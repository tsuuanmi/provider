/**
 * Runtime synchronization with `dsh-codex-subscription`.
 *
 * `dsh-codex-subscription` ≥ 1.13 no longer derives its active account from
 * the `OPENAI_CODEX_SUBSCRIPTION_OAUTH` string reference: it keeps its own
 * multi-account vault in the `codex-subscription/accounts` credential *record*
 * and resolves the active account from that record on every request. Writing
 * only the legacy reference (as older versions required) therefore switched
 * nothing at runtime — the host kept serving the previously active account.
 *
 * This module keeps that vault synchronized with the plugin's active account,
 * through the same `ctx.credentials` record seam the vault itself uses:
 *
 * - **switch**: select the vault account whose credential identifies the same
 *   ChatGPT account (exact token match first, then the ChatGPT `accountId`),
 *   importing the account into the vault when it is not there yet. The next
 *   Codex request then authenticates as the newly active account without any
 *   restart, because the vault re-reads its record per operation.
 * - **remove**: drop the vault account matching the removed credential, so a
 *   removed account's OAuth grant is not left behind for the Codex route to
 *   keep using. When the last vault account disappears the whole record is
 *   deleted (the Codex plugin requires a non-empty vault; removing the record
 *   is its sign-out equivalent).
 *
 * Every write is a read-decide-replace inside `modifyRecord` under the
 * credentials document lock, so it cannot interleave with the vault's own
 * refresh-token rotations. Records this module does not understand (a future
 * vault version, or a malformed record) are left untouched with a warning:
 * corrupting the vault would break the Codex route entirely, while skipping
 * only degrades back to the legacy-reference behavior.
 *
 * When the DSH `credentials` service has no record API (older DSH), or the
 * stored credential is not OAuth, every function here is a no-op.
 *
 * @module @tsuuanmi/provider/codex-subscription
 */
import { createHash } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type { Credential } from "@earendil-works/pi-ai";

/**
 * Credential record key owning `dsh-codex-subscription`'s account vault.
 * Matches `credentialKey("codex-subscription", "accounts")`; built literally
 * because the pinned `dsh-credentials` peer does not export `credentialKey`.
 */
const CODEX_VAULT_KEY = "codex-subscription/accounts";

/** The only vault payload version this module knows how to preserve. */
const VAULT_VERSION = 1;

/** `dsh-codex-subscription`'s account label bounds (see its `normalizeLabel`). */
const LABEL_MAX_LENGTH = 48;

/** Structural slice of a DSH credential record (`kind: "grant"`). */
interface GrantRecord {
	kind: "grant";
	payload: unknown;
}

/** Structural slice of the record half of the DSH `credentials` service. */
interface RecordsCredentials {
	readRecord(key: string): Promise<GrantRecord | undefined>;
	modifyRecord(
		key: string,
		mutate: (current: GrantRecord | undefined) => Promise<GrantRecord | undefined>,
	): Promise<GrantRecord | undefined>;
	deleteRecord(key: string): Promise<void>;
}

/** One account as stored inside the Codex subscription vault record. */
interface VaultAccount {
	id: string;
	label: string;
	credential: {
		access: string;
		refresh: string;
		expires: number;
		/** ChatGPT account id; stable across token refreshes and logins. */
		accountId?: string;
		[key: string]: unknown;
	};
}

/** The `dsh-codex-subscription` vault payload, version 1. */
interface VaultPayload extends Record<string, unknown> {
	version: 1;
	activeId: string;
	/** `undefined` both when unset and when cleared (dropped by the JSON round trip, as the Codex plugin itself does). */
	legacyAccountId?: string | undefined;
	accounts: VaultAccount[];
}

/** Why a stored record could not be synchronized. */
type SkipReason = "unsupported" | "malformed";

/** A validated vault record, or why it was left alone. */
type VaultRecord = { ok: true; payload: VaultPayload } | { ok: false; reason: SkipReason };

/**
 * The record API when the running DSH provides it, else `undefined`. The
 * records half of `credentials` is newer than this plugin's pinned peer
 * dependency, so it is detected structurally at runtime.
 */
function recordsApi(ctx: Context): RecordsCredentials | undefined {
	const credentials = (ctx as { credentials?: unknown }).credentials as Partial<RecordsCredentials> | undefined;
	if (credentials === undefined) return undefined;
	if (
		typeof credentials.readRecord !== "function" ||
		typeof credentials.modifyRecord !== "function" ||
		typeof credentials.deleteRecord !== "function"
	) {
		return undefined;
	}
	return credentials as RecordsCredentials;
}

function isOAuthCredentialShape(value: unknown): value is VaultAccount["credential"] {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v["type"] === "oauth" &&
		typeof v["access"] === "string" &&
		v["access"].length > 0 &&
		typeof v["refresh"] === "string" &&
		v["refresh"].length > 0 &&
		typeof v["expires"] === "number" &&
		Number.isFinite(v["expires"])
	);
}

/**
 * Validate a vault record exactly as strictly as `dsh-codex-subscription`
 * validates it on every read, so a record this module refuses to touch is one
 * the Codex plugin would reject anyway, and one it writes is one the Codex
 * plugin accepts. Unknown payload fields are preserved, not dropped.
 */
function parseVaultRecord(record: GrantRecord | undefined): VaultRecord {
	if (record === undefined || record.kind !== "grant") return { ok: false, reason: "malformed" };
	const payload = record.payload;
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		return { ok: false, reason: "malformed" };
	}
	const raw = payload as Record<string, unknown>;
	if (raw["version"] !== VAULT_VERSION) return { ok: false, reason: "unsupported" };
	const activeId = raw["activeId"];
	if (typeof activeId !== "string" || activeId.length === 0) return { ok: false, reason: "malformed" };
	const legacyAccountId = raw["legacyAccountId"];
	if (legacyAccountId !== undefined && (typeof legacyAccountId !== "string" || legacyAccountId.length === 0)) {
		return { ok: false, reason: "malformed" };
	}
	const accountsValue = raw["accounts"];
	if (!Array.isArray(accountsValue) || accountsValue.length === 0) return { ok: false, reason: "malformed" };
	const ids = new Set<string>();
	const accounts: VaultAccount[] = [];
	for (const entry of accountsValue) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return { ok: false, reason: "malformed" };
		const account = entry as Record<string, unknown>;
		const id = account["id"];
		const label = account["label"];
		if (typeof id !== "string" || id.length === 0 || ids.has(id)) return { ok: false, reason: "malformed" };
		if (typeof label !== "string" || label.length === 0 || label.length > LABEL_MAX_LENGTH) {
			return { ok: false, reason: "malformed" };
		}
		if (!isOAuthCredentialShape(account["credential"])) return { ok: false, reason: "malformed" };
		ids.add(id);
		accounts.push(account as unknown as VaultAccount);
	}
	if (!ids.has(activeId)) return { ok: false, reason: "malformed" };
	if (legacyAccountId !== undefined && !ids.has(legacyAccountId)) return { ok: false, reason: "malformed" };
	return {
		ok: true,
		payload: { ...(raw as VaultPayload), activeId, legacyAccountId, accounts },
	};
}

/** A vault label within `dsh-codex-subscription`'s 1–48 character bounds. */
function vaultLabel(name: string): string {
	const label = name.trim().replace(/\s+/gu, " ");
	if (label.length === 0) return "Account";
	return label.length > LABEL_MAX_LENGTH ? label.slice(0, LABEL_MAX_LENGTH) : label;
}

/** The ChatGPT account id carried by a credential, when present. */
function chatgptAccountId(credential: Credential): string | undefined {
	const id = (credential as Record<string, unknown>)["accountId"];
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Prefix separating provider-managed account ids from native random ids. */
const MANAGED_VAULT_ID_PREFIX = "provider:";

/** Stable vault identity for one named provider account. */
function vaultAccountId(providerAccountId: string): string {
	return `${MANAGED_VAULT_ID_PREFIX}${createHash("sha256").update(providerAccountId).digest("hex")}`;
}

/** Native vault labels used before this plugin associated labels with named accounts. */
function isLegacyVaultLabel(label: string): boolean {
	return /^Account \d+$/u.test(label);
}

/**
 * Find the vault account belonging to one named provider account.
 *
 * Provider-managed records use a deterministic vault id, which survives token
 * rotation and distinguishes named credentials sharing a ChatGPT `accountId`.
 * Legacy random-id entries are adopted only by an exact token, matching label,
 * or one unambiguous generic `Account N` entry for the same ChatGPT identity.
 */
function matchVaultAccount(
	accounts: readonly VaultAccount[],
	credential: Credential,
	providerAccountId: string,
): VaultAccount | undefined {
	if (credential.type !== "oauth") return undefined;
	const id = vaultAccountId(providerAccountId);
	const managed = accounts.find((account) => account.id === id);
	if (managed !== undefined) return managed;
	const label = vaultLabel(providerAccountId);
	const named = accounts.find((account) => account.label === label);
	if (named !== undefined) return named;
	for (const account of accounts) {
		if (account.credential.access === credential.access) return account;
	}
	const accountId = chatgptAccountId(credential);
	if (accountId === undefined) return undefined;
	const legacyMatches = accounts.filter(
		(account) => account.credential.accountId === accountId && isLegacyVaultLabel(account.label),
	);
	return legacyMatches.length === 1 ? legacyMatches[0] : undefined;
}

function grantRecord(payload: VaultPayload): GrantRecord {
	return { kind: "grant", payload };
}

/**
 * Select `credential` as the Codex subscription vault's active account,
 * importing it (labeled `label`) when the vault does not know it yet. The
 * running Codex route switches on its next request; no restart is needed.
 *
 * Hard storage failures propagate to the caller (the switch should not
 * silently report success when the runtime account did not change); records
 * this module cannot understand are skipped with a warning instead, because
 * rewriting them could not work anyway.
 */
export async function syncCodexSubscriptionAccount(
	ctx: Context,
	credential: Credential,
	label: string,
): Promise<void> {
	if (credential.type !== "oauth" || !isOAuthCredentialShape(credential)) return;
	const records = recordsApi(ctx);
	if (records === undefined) return;
	let skipped: SkipReason | undefined;
	await records.modifyRecord(CODEX_VAULT_KEY, async (current) => {
		const id = vaultAccountId(label);
		const normalizedLabel = vaultLabel(label);
		if (current === undefined) {
			// No vault yet: seed one holding this account, mirroring how the
			// Codex plugin itself imports the legacy reference on first read.
			return grantRecord({
				version: VAULT_VERSION,
				activeId: id,
				legacyAccountId: id,
				accounts: [{ id, label: normalizedLabel, credential }],
			});
		}
		const record = parseVaultRecord(current);
		if (!record.ok) {
			skipped = record.reason;
			return undefined; // leave a record we do not fully understand untouched
		}
		const match = matchVaultAccount(record.payload.accounts, credential, label);
		if (match?.id === id && record.payload.activeId === id) return undefined; // already active
		const accounts =
			match === undefined
				? [...record.payload.accounts, { id, label: normalizedLabel, credential }]
				: record.payload.accounts.map((account) =>
					account.id === match.id ? { ...account, id, label: normalizedLabel } : account,
				);
		return grantRecord({
			...record.payload,
			activeId: id,
			legacyAccountId: record.payload.legacyAccountId === match?.id ? id : record.payload.legacyAccountId,
			accounts,
		});
	});
	if (skipped !== undefined) {
		warnSkipped(ctx, skipped, "select the active Codex account at runtime");
	}
}

/**
 * Remove the vault account matching `credential`, so a removed provider
 * account's OAuth grant is not left behind for the Codex route to keep using.
 * When the removed account was the vault's active one, the first remaining
 * account is promoted (the vault requires an active account; the Codex
 * plugin's own removal behaves the same way). Removing the last vault account
 * deletes the whole record — the vault cannot be empty.
 */
export async function removeCodexSubscriptionAccount(
	ctx: Context,
	credential: Credential,
	providerAccountId: string,
): Promise<void> {
	if (credential.type !== "oauth" || !isOAuthCredentialShape(credential)) return;
	const records = recordsApi(ctx);
	if (records === undefined) return;
	let skipped: SkipReason | undefined;
	let soleAccount = false;
	await records.modifyRecord(CODEX_VAULT_KEY, async (current) => {
		if (current === undefined) return undefined; // no vault: nothing to remove
		const record = parseVaultRecord(current);
		if (!record.ok) {
			skipped = record.reason;
			return undefined;
		}
		const match = matchVaultAccount(record.payload.accounts, credential, providerAccountId);
		if (match === undefined) return undefined; // the vault never held this account
		const accounts = record.payload.accounts.filter((account) => account.id !== match.id);
		if (accounts.length === 0) {
			// A vault record with zero accounts is malformed to the Codex
			// plugin; drop the record instead of writing an empty one.
			soleAccount = true;
			return undefined;
		}
		return grantRecord({
			...record.payload,
			activeId: record.payload.activeId === match.id ? accounts[0]!.id : record.payload.activeId,
			legacyAccountId: record.payload.legacyAccountId === match.id ? undefined : record.payload.legacyAccountId,
			accounts,
		});
	});
	if (soleAccount) await records.deleteRecord(CODEX_VAULT_KEY);
	if (skipped !== undefined) {
		warnSkipped(ctx, skipped, "remove the account from the Codex subscription vault");
	}
}

/** Report that a vault record was deliberately left untouched. */
function warnSkipped(ctx: Context, reason: SkipReason, intent: string): void {
	const detail =
		reason === "unsupported"
			? `an unsupported vault format (version ${VAULT_VERSION} expected)`
			: "a malformed vault record";
	ctx.logger.warn(`provider: could not ${intent}: the codex-subscription vault record is ${detail}`);
}