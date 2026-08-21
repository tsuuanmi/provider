/**
 * Multi-account credential store for dsh-account.
 *
 * pi-ai's `CredentialStore` is one-credential-per-provider, but this plugin
 * manages many named accounts per provider with one active. This module keeps a
 * richer on-disk document (provider -> named accounts + active marker) and
 * exposes a thin `CredentialStore` adapter that serves the *active* account, so
 * pi-ai's `Models`/`getAuth`/`login` work unchanged while the plugin can add,
 * remove, and switch named accounts.
 *
 * Persistence reuses `@deepseek-ai/dsh-atomic-write` (exclusive-create temp +
 * rename commit, cross-process writer lock) and mirrors the owner-only,
 * strict-versioned posture of `dsh-codex-connect`'s OAuth store. The document
 * lives at `$DSH_HOME/accounts.json`.
 *
 * @module @tsuuanmi/dsh-account/store
 */
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { AccountError } from "./invariant.ts";

/** Basename of the accounts document inside the Harness home. */
const ACCOUNTS_FILENAME = "accounts.json";
/** Current on-disk format; readers reject every other version. */
const FORMAT_VERSION = 1;

/** Per-provider stored state. */
export interface ProviderAccounts {
	/** Named accounts by account id; each value is a pi-ai `Credential`. */
	accounts: Record<string, Credential>;
	/** The active account id for this provider, when any. */
	active?: string;
}

/** Whole-document shape. */
interface AccountDocument {
	version: 1;
	providers: Record<string, ProviderAccounts>;
}

function isENOENT(error: unknown): boolean {
	return (error as { code?: string } | undefined)?.code === "ENOENT";
}

/** Reject a credential document readable by another POSIX user. */
async function assertOwnerOnly(filename: string): Promise<void> {
	let mode: number;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT(error)) return;
		throw error;
	}
	if (process.platform === "win32") return;
	if ((mode & 0o77) !== 0) {
		throw new AccountError(
			"STORAGE",
			`dsh-account: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)}); run "chmod 600 ${filename}" before starting again`,
		);
	}
}

function isCredential(value: unknown): value is Credential {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return v.type === "api_key" || v.type === "oauth";
}

/** Validate the strict JSON document. */
function parseDocument(text: string, filename: string): AccountDocument {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new AccountError("STORAGE", `dsh-account: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new AccountError("STORAGE", `dsh-account: ${filename} must contain an object`);
	}
	const document = value as Record<string, unknown>;
	if (document["version"] !== FORMAT_VERSION) {
		throw new AccountError(
			"STORAGE",
			`dsh-account: ${filename} has unsupported accounts format version ${String(document["version"])}`,
		);
	}
	if (Object.keys(document).some((key) => key !== "version" && key !== "providers")) {
		throw new AccountError("STORAGE", `dsh-account: ${filename} contains an unknown top-level field`);
	}
	const providers = document["providers"];
	if (typeof providers !== "object" || providers === null || Array.isArray(providers)) {
		throw new AccountError("STORAGE", `dsh-account: ${filename} providers must be an object`);
	}
	for (const [providerId, raw] of Object.entries(providers as Record<string, unknown>)) {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			throw new AccountError("STORAGE", `dsh-account: ${filename} provider "${providerId}" must be an object`);
		}
		const entry = raw as Record<string, unknown>;
		if (Object.keys(entry).some((key) => key !== "accounts" && key !== "active")) {
			throw new AccountError("STORAGE", `dsh-account: ${filename} provider "${providerId}" has an unknown field`);
		}
		const accounts = entry["accounts"];
		if (typeof accounts !== "object" || accounts === null || Array.isArray(accounts)) {
			throw new AccountError("STORAGE", `dsh-account: ${filename} provider "${providerId}" accounts must be an object`);
		}
		for (const [accountId, credential] of Object.entries(accounts as Record<string, unknown>)) {
			if (!isCredential(credential)) {
				throw new AccountError(
					"STORAGE",
					`dsh-account: ${filename} provider "${providerId}" account "${accountId}" has an invalid credential`,
				);
			}
		}
		const active = entry["active"];
		if (active !== undefined && (typeof active !== "string" || !(active in (accounts as Record<string, unknown>)))) {
			throw new AccountError(
				"STORAGE",
				`dsh-account: ${filename} provider "${providerId}" active account "${String(active)}" is not among its accounts`,
			);
		}
	}
	return document as unknown as AccountDocument;
}

/** Detach a credential so callers cannot mutate provider-owned extras. */
function cloneCredential(credential: Credential): Credential {
	return structuredClone(credential);
}

function emptyDocument(): AccountDocument {
	return { version: FORMAT_VERSION, providers: {} };
}

/** Resolve the default accounts document path. */
export function accountPath(dshHome?: string): string {
	return resolve(join(resolveDshHome(dshHome), ACCOUNTS_FILENAME));
}

/** One named account view for display. */
export interface AccountInfo {
	accountId: string;
	providerId: string;
	type: Credential["type"];
	/** Credential expiry (ms epoch) for OAuth accounts, else undefined. */
	expires?: number;
}

/**
 * Multi-account store over one versioned, owner-only JSON document. All
 * mutations run under the cross-process file lock and commit atomically.
 */
export class AccountStore {
	readonly filename: string;

	constructor(filename: string = accountPath()) {
		this.filename = resolve(filename);
	}

	/** Read and validate the accounts document without the writer lock. */
	private async readDocument(): Promise<AccountDocument> {
		await assertOwnerOnly(this.filename);
		let text: string;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT(error)) return emptyDocument();
			throw new AccountError("STORAGE", `dsh-account: failed to read ${this.filename}`);
		}
		return parseDocument(text, this.filename);
	}

	/** Read-modify-write one document under the cross-process writer lock. */
	private async mutate(fn: (document: AccountDocument) => AccountDocument): Promise<AccountDocument> {
		await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
		return withFileLock(this.filename, async () => {
			const current = await this.readDocument();
			const next = fn(current);
			parseDocument(JSON.stringify(next), this.filename); // fail loud on an invalid mutation
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 0o600,
				dirMode: 0o700,
			});
			return next;
		});
	}

	/** Provider ids that have at least one stored account. */
	async listProviders(): Promise<string[]> {
		return Object.keys((await this.readDocument()).providers);
	}

	/** All named accounts for one provider, in insertion order. */
	async listAccounts(providerId: string): Promise<AccountInfo[]> {
		const providers = (await this.readDocument()).providers;
		const entry = providers[providerId];
		if (!entry) return [];
		return Object.entries(entry.accounts).map(([accountId, credential]) => {
			const base = { providerId, accountId, type: credential.type as Credential["type"] };
			return credential.type === "oauth" ? { ...base, expires: credential.expires } : base;
		});
	}

	/** The active account id for one provider, if any. */
	async getActive(providerId: string): Promise<string | undefined> {
		return (await this.readDocument()).providers[providerId]?.active;
	}

	/** Read one named account's credential. */
	async getCredential(providerId: string, accountId: string): Promise<Credential | undefined> {
		const providers = (await this.readDocument()).providers;
		const credential = providers[providerId]?.accounts[accountId];
		return credential === undefined ? undefined : cloneCredential(credential);
	}

	/** Whether one named account exists. */
	async hasAccount(providerId: string, accountId: string): Promise<boolean> {
		const providers = (await this.readDocument()).providers;
		return providers[providerId]?.accounts[accountId] !== undefined;
	}

	/** Store a named account's credential. Errors if the id already exists. */
	async addAccount(providerId: string, accountId: string, credential: Credential): Promise<void> {
		await this.mutate((document) => {
			const entry = (document.providers[providerId] ??= { accounts: {} });
			if (entry.accounts[accountId] !== undefined) {
				throw new AccountError("DUPLICATE_ACCOUNT", `Account "${accountId}" already exists for ${providerId}`);
			}
			entry.accounts[accountId] = cloneCredential(credential);
			return document;
		});
	}

	/** Replace a named account's credential (upsert). */
	async upsertAccount(providerId: string, accountId: string, credential: Credential): Promise<void> {
		await this.mutate((doc) => {
			const entry = (doc.providers[providerId] ??= { accounts: {} });
			entry.accounts[accountId] = cloneCredential(credential);
			return doc;
		});
	}

	/** Set the active account for a provider. Refuses an unknown account. */
	async setActive(providerId: string, accountId: string): Promise<void> {
		await this.mutate((doc) => {
			const entry = doc.providers[providerId];
			if (!entry || entry.accounts[accountId] === undefined) {
				throw new AccountError("UNKNOWN_ACCOUNT", `No account "${accountId}" for ${providerId}`);
			}
			entry.active = accountId;
			return doc;
		});
	}

	/** Remove one named account. Refuses removing the active account. */
	async removeAccount(providerId: string, accountId: string): Promise<void> {
		await this.mutate((doc) => {
			const entry = doc.providers[providerId];
			if (!entry || entry.accounts[accountId] === undefined) {
				throw new AccountError("UNKNOWN_ACCOUNT", `No account "${accountId}" for ${providerId}`);
			}
			if (entry.active === accountId) {
				throw new AccountError("ACTIVE_ACCOUNT", `Account "${accountId}" is active for ${providerId}; switch first`);
			}
			delete entry.accounts[accountId];
			if (Object.keys(entry.accounts).length === 0) delete doc.providers[providerId];
			return doc;
		});
	}
}

/** Options steering which account a {@link CredentialStore} operation touches. */
export interface StoreTarget {
	/** The provider the target account belongs to. */
	providerId?: string;
	/** When set, reads/writes target this named account instead of the active one. */
	accountId?: string;
}

/**
 * pi-ai `CredentialStore` adapter over an {@link AccountStore}. By default it
 * serves each provider's active account (what the running agent uses); a
 * {@link StoreTarget} lets a login persist into a specific named account
 * without changing the active one.
 */
export class ActiveCredentialStore implements CredentialStore {
	constructor(
		private readonly store: AccountStore,
		private target: StoreTarget = {},
	) {}

	/** The effective account id for one provider (target account or active). */
	private async resolveAccount(providerId: string): Promise<string | undefined> {
		if (this.target.providerId === providerId && this.target.accountId !== undefined) return this.target.accountId;
		return this.store.getActive(providerId);
	}

	async read(providerId: string): Promise<Credential | undefined> {
		const accountId = await this.resolveAccount(providerId);
		return accountId === undefined ? undefined : this.store.getCredential(providerId, accountId);
	}

	async list(): Promise<readonly CredentialInfo[]> {
		const providers = await this.store.listProviders();
		const info: CredentialInfo[] = [];
		for (const providerId of providers) {
			const accountId = await this.resolveAccount(providerId);
			if (accountId === undefined) continue;
			const credential = await this.store.getCredential(providerId, accountId);
			if (credential !== undefined) info.push({ providerId, type: credential.type });
		}
		return info;
	}

	async modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		const accountId = await this.resolveAccount(providerId);
		if (accountId === undefined) return undefined;
		const current = await this.store.getCredential(providerId, accountId);
		const candidate = await fn(current);
		if (candidate === undefined) return current;
		await this.store.upsertAccount(providerId, accountId, candidate);
		return this.store.getCredential(providerId, accountId);
	}

	async delete(providerId: string): Promise<void> {
		const accountId = await this.resolveAccount(providerId);
		if (accountId === undefined) return;
		await this.store.removeAccount(providerId, accountId);
	}
}
