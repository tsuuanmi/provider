import { AccountError } from "./invariant.js";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { createModels } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
//#region src/account-store.ts
/** Basename of the accounts document inside the Harness home. */
const ACCOUNTS_FILENAME = "accounts.json";
/** Current on-disk format; readers reject every other version. */
const FORMAT_VERSION = 1;
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/** Reject a credential document readable by another POSIX user. */
async function assertOwnerOnly(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT(error)) return;
		throw error;
	}
	if (process.platform === "win32") return;
	if ((mode & 63) !== 0) throw new AccountError("STORAGE", `provider: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
}
function isCredential(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const v = value;
	return v.type === "api_key" || v.type === "oauth";
}
/** Validate the strict JSON document. */
function parseDocument(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new AccountError("STORAGE", `provider: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AccountError("STORAGE", `provider: ${filename} must contain an object`);
	const document = value;
	if (document["version"] !== FORMAT_VERSION) throw new AccountError("STORAGE", `provider: ${filename} has unsupported accounts format version ${String(document["version"])}`);
	if (Object.keys(document).some((key) => key !== "version" && key !== "providers")) throw new AccountError("STORAGE", `provider: ${filename} contains an unknown top-level field`);
	const providers = document["providers"];
	if (typeof providers !== "object" || providers === null || Array.isArray(providers)) throw new AccountError("STORAGE", `provider: ${filename} providers must be an object`);
	for (const [providerId, raw] of Object.entries(providers)) {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new AccountError("STORAGE", `provider: ${filename} provider "${providerId}" must be an object`);
		const entry = raw;
		if (Object.keys(entry).some((key) => key !== "accounts" && key !== "active")) throw new AccountError("STORAGE", `provider: ${filename} provider "${providerId}" has an unknown field`);
		const accounts = entry["accounts"];
		if (typeof accounts !== "object" || accounts === null || Array.isArray(accounts)) throw new AccountError("STORAGE", `provider: ${filename} provider "${providerId}" accounts must be an object`);
		for (const [accountId, credential] of Object.entries(accounts)) if (!isCredential(credential)) throw new AccountError("STORAGE", `provider: ${filename} provider "${providerId}" account "${accountId}" has an invalid credential`);
		const active = entry["active"];
		if (active !== void 0 && (typeof active !== "string" || !(active in accounts))) throw new AccountError("STORAGE", `provider: ${filename} provider "${providerId}" active account "${String(active)}" is not among its accounts`);
	}
	return document;
}
/** Detach a credential so callers cannot mutate provider-owned extras. */
function cloneCredential(credential) {
	return structuredClone(credential);
}
function emptyDocument() {
	return {
		version: FORMAT_VERSION,
		providers: {}
	};
}
/** Resolve the default accounts document path. */
function accountPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), ACCOUNTS_FILENAME));
}
/**
* Multi-account store over one versioned, owner-only JSON document. All
* mutations run under the cross-process file lock and commit atomically.
*/
var AccountStore = class {
	filename;
	constructor(filename = accountPath()) {
		this.filename = resolve(filename);
	}
	/** Read and validate the accounts document without the writer lock. */
	async readDocument() {
		await assertOwnerOnly(this.filename);
		let text;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT(error)) return emptyDocument();
			throw new AccountError("STORAGE", `provider: failed to read ${this.filename}`);
		}
		return parseDocument(text, this.filename);
	}
	/** Read-modify-write one document under the cross-process writer lock. */
	async mutate(fn) {
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const next = fn(await this.readDocument());
			parseDocument(JSON.stringify(next), this.filename);
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return next;
		});
	}
	/** Provider ids that have at least one stored account. */
	async listProviders() {
		return Object.keys((await this.readDocument()).providers);
	}
	/** All named accounts for one provider, ordered alphabetically by account id. */
	async listAccounts(providerId) {
		const entry = (await this.readDocument()).providers[providerId];
		if (!entry) return [];
		return Object.entries(entry.accounts).map(([accountId, credential]) => {
			const base = {
				providerId,
				accountId,
				type: credential.type
			};
			return credential.type === "oauth" ? {
				...base,
				expires: credential.expires
			} : base;
		}).sort((left, right) => left.accountId.localeCompare(right.accountId, "en"));
	}
	/** The active account id for one provider, if any. */
	async getActive(providerId) {
		return (await this.readDocument()).providers[providerId]?.active;
	}
	/** Read one named account's credential. */
	async getCredential(providerId, accountId) {
		const credential = (await this.readDocument()).providers[providerId]?.accounts[accountId];
		return credential === void 0 ? void 0 : cloneCredential(credential);
	}
	/** Whether one named account exists. */
	async hasAccount(providerId, accountId) {
		return (await this.readDocument()).providers[providerId]?.accounts[accountId] !== void 0;
	}
	/** Store a named account's credential. Errors if the id already exists. */
	async addAccount(providerId, accountId, credential) {
		await this.mutate((document) => {
			const entry = document.providers[providerId] ??= { accounts: {} };
			if (entry.accounts[accountId] !== void 0) throw new AccountError("DUPLICATE_ACCOUNT", `Account "${accountId}" already exists for ${providerId}`);
			entry.accounts[accountId] = cloneCredential(credential);
			return document;
		});
	}
	/** Replace a named account's credential (upsert). */
	async upsertAccount(providerId, accountId, credential) {
		await this.mutate((doc) => {
			const entry = doc.providers[providerId] ??= { accounts: {} };
			entry.accounts[accountId] = cloneCredential(credential);
			return doc;
		});
	}
	/** Set the active account for a provider. Refuses an unknown account. */
	async setActive(providerId, accountId) {
		await this.mutate((doc) => {
			const entry = doc.providers[providerId];
			if (!entry || entry.accounts[accountId] === void 0) throw new AccountError("UNKNOWN_ACCOUNT", `No account "${accountId}" for ${providerId}`);
			entry.active = accountId;
			return doc;
		});
	}
	/**
	* Remove one named account. When the removed account was the provider's
	* active account, the active marker is cleared (no account is silently
	* promoted). Returns whether the removed account had been active, so callers
	* can tear down its mirrored credential (e.g. the Codex subscription slot).
	*/
	async removeAccount(providerId, accountId) {
		let wasActive = false;
		await this.mutate((doc) => {
			const entry = doc.providers[providerId];
			if (!entry || entry.accounts[accountId] === void 0) throw new AccountError("UNKNOWN_ACCOUNT", `No account "${accountId}" for ${providerId}`);
			wasActive = entry.active === accountId;
			delete entry.accounts[accountId];
			if (wasActive) delete entry.active;
			if (Object.keys(entry.accounts).length === 0) delete doc.providers[providerId];
			return doc;
		});
		return wasActive;
	}
};
/**
* pi-ai `CredentialStore` adapter over an {@link AccountStore}. By default it
* serves each provider's active account (what the running agent uses); a
* {@link StoreTarget} lets a login persist into a specific named account
* without changing the active one.
*/
var ActiveCredentialStore = class {
	store;
	target;
	constructor(store, target = {}) {
		this.store = store;
		this.target = target;
	}
	/** The effective account id for one provider (target account or active). */
	async resolveAccount(providerId) {
		if (this.target.providerId === providerId && this.target.accountId !== void 0) return this.target.accountId;
		return this.store.getActive(providerId);
	}
	async read(providerId) {
		const accountId = await this.resolveAccount(providerId);
		return accountId === void 0 ? void 0 : this.store.getCredential(providerId, accountId);
	}
	async list() {
		const providers = await this.store.listProviders();
		const info = [];
		for (const providerId of providers) {
			const accountId = await this.resolveAccount(providerId);
			if (accountId === void 0) continue;
			const credential = await this.store.getCredential(providerId, accountId);
			if (credential !== void 0) info.push({
				providerId,
				type: credential.type
			});
		}
		return info;
	}
	async modify(providerId, fn) {
		const accountId = await this.resolveAccount(providerId);
		if (accountId === void 0) return void 0;
		const current = await this.store.getCredential(providerId, accountId);
		const candidate = await fn(current);
		if (candidate === void 0) return current;
		await this.store.upsertAccount(providerId, accountId, candidate);
		return this.store.getCredential(providerId, accountId);
	}
	async delete(providerId) {
		const accountId = await this.resolveAccount(providerId);
		if (accountId === void 0) return;
		await this.store.removeAccount(providerId, accountId);
	}
};
//#endregion
//#region src/codex-subscription.ts
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
/**
* The record API when the running DSH provides it, else `undefined`. The
* records half of `credentials` is newer than this plugin's pinned peer
* dependency, so it is detected structurally at runtime.
*/
function recordsApi(ctx) {
	const credentials = ctx.credentials;
	if (credentials === void 0) return void 0;
	if (typeof credentials.readRecord !== "function" || typeof credentials.modifyRecord !== "function" || typeof credentials.deleteRecord !== "function") return;
	return credentials;
}
function isOAuthCredentialShape(value) {
	if (typeof value !== "object" || value === null) return false;
	const v = value;
	return v["type"] === "oauth" && typeof v["access"] === "string" && v["access"].length > 0 && typeof v["refresh"] === "string" && v["refresh"].length > 0 && typeof v["expires"] === "number" && Number.isFinite(v["expires"]);
}
/**
* Validate a vault record exactly as strictly as `dsh-codex-subscription`
* validates it on every read, so a record this module refuses to touch is one
* the Codex plugin would reject anyway, and one it writes is one the Codex
* plugin accepts. Unknown payload fields are preserved, not dropped.
*/
function parseVaultRecord(record) {
	if (record === void 0 || record.kind !== "grant") return {
		ok: false,
		reason: "malformed"
	};
	const payload = record.payload;
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return {
		ok: false,
		reason: "malformed"
	};
	const raw = payload;
	if (raw["version"] !== VAULT_VERSION) return {
		ok: false,
		reason: "unsupported"
	};
	const activeId = raw["activeId"];
	if (typeof activeId !== "string" || activeId.length === 0) return {
		ok: false,
		reason: "malformed"
	};
	const legacyAccountId = raw["legacyAccountId"];
	if (legacyAccountId !== void 0 && (typeof legacyAccountId !== "string" || legacyAccountId.length === 0)) return {
		ok: false,
		reason: "malformed"
	};
	const accountsValue = raw["accounts"];
	if (!Array.isArray(accountsValue) || accountsValue.length === 0) return {
		ok: false,
		reason: "malformed"
	};
	const ids = /* @__PURE__ */ new Set();
	const accounts = [];
	for (const entry of accountsValue) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return {
			ok: false,
			reason: "malformed"
		};
		const account = entry;
		const id = account["id"];
		const label = account["label"];
		if (typeof id !== "string" || id.length === 0 || ids.has(id)) return {
			ok: false,
			reason: "malformed"
		};
		if (typeof label !== "string" || label.length === 0 || label.length > LABEL_MAX_LENGTH) return {
			ok: false,
			reason: "malformed"
		};
		if (!isOAuthCredentialShape(account["credential"])) return {
			ok: false,
			reason: "malformed"
		};
		ids.add(id);
		accounts.push(account);
	}
	if (!ids.has(activeId)) return {
		ok: false,
		reason: "malformed"
	};
	if (legacyAccountId !== void 0 && !ids.has(legacyAccountId)) return {
		ok: false,
		reason: "malformed"
	};
	return {
		ok: true,
		payload: {
			...raw,
			activeId,
			legacyAccountId,
			accounts
		}
	};
}
/** A vault label within `dsh-codex-subscription`'s 1–48 character bounds. */
function vaultLabel(name) {
	const label = name.trim().replace(/\s+/gu, " ");
	if (label.length === 0) return "Account";
	return label.length > LABEL_MAX_LENGTH ? label.slice(0, LABEL_MAX_LENGTH) : label;
}
/** The ChatGPT account id carried by a credential, when present. */
function chatgptAccountId(credential) {
	const id = credential["accountId"];
	return typeof id === "string" && id.length > 0 ? id : void 0;
}
/**
* Find the vault account identifying the same ChatGPT account as `credential`.
* An exact access-token match wins; otherwise accounts sharing the ChatGPT
* `accountId` match (the vault's copy may hold a fresher, rotated token for
* the very account being selected).
*/
function matchVaultAccount(accounts, credential) {
	if (credential.type !== "oauth") return void 0;
	for (const account of accounts) if (account.credential.access === credential.access) return account;
	const accountId = chatgptAccountId(credential);
	if (accountId === void 0) return void 0;
	return accounts.find((account) => account.credential.accountId === accountId);
}
function grantRecord(payload) {
	return {
		kind: "grant",
		payload
	};
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
async function syncCodexSubscriptionAccount(ctx, credential, label) {
	if (credential.type !== "oauth" || !isOAuthCredentialShape(credential)) return;
	const records = recordsApi(ctx);
	if (records === void 0) return;
	let skipped;
	await records.modifyRecord(CODEX_VAULT_KEY, async (current) => {
		if (current === void 0) {
			const id = randomUUID();
			return grantRecord({
				version: VAULT_VERSION,
				activeId: id,
				legacyAccountId: id,
				accounts: [{
					id,
					label: vaultLabel(label),
					credential
				}]
			});
		}
		const record = parseVaultRecord(current);
		if (!record.ok) {
			skipped = record.reason;
			return;
		}
		const match = matchVaultAccount(record.payload.accounts, credential);
		if (match !== void 0 && record.payload.activeId === match.id) return void 0;
		const activeId = match?.id ?? randomUUID();
		const accounts = match !== void 0 ? record.payload.accounts : [...record.payload.accounts, {
			id: activeId,
			label: vaultLabel(label),
			credential
		}];
		return grantRecord({
			...record.payload,
			activeId,
			accounts
		});
	});
	if (skipped !== void 0) warnSkipped(ctx, skipped, "select the active Codex account at runtime");
}
/**
* Remove the vault account matching `credential`, so a removed provider
* account's OAuth grant is not left behind for the Codex route to keep using.
* When the removed account was the vault's active one, the first remaining
* account is promoted (the vault requires an active account; the Codex
* plugin's own removal behaves the same way). Removing the last vault account
* deletes the whole record — the vault cannot be empty.
*/
async function removeCodexSubscriptionAccount(ctx, credential) {
	if (credential.type !== "oauth" || !isOAuthCredentialShape(credential)) return;
	const records = recordsApi(ctx);
	if (records === void 0) return;
	let skipped;
	let soleAccount = false;
	await records.modifyRecord(CODEX_VAULT_KEY, async (current) => {
		if (current === void 0) return void 0;
		const record = parseVaultRecord(current);
		if (!record.ok) {
			skipped = record.reason;
			return;
		}
		const match = matchVaultAccount(record.payload.accounts, credential);
		if (match === void 0) return void 0;
		const accounts = record.payload.accounts.filter((account) => account.id !== match.id);
		if (accounts.length === 0) {
			soleAccount = true;
			return;
		}
		return grantRecord({
			...record.payload,
			activeId: record.payload.activeId === match.id ? accounts[0].id : record.payload.activeId,
			legacyAccountId: record.payload.legacyAccountId === match.id ? void 0 : record.payload.legacyAccountId,
			accounts
		});
	});
	if (soleAccount) await records.deleteRecord(CODEX_VAULT_KEY);
	if (skipped !== void 0) warnSkipped(ctx, skipped, "remove the account from the Codex subscription vault");
}
/** Report that a vault record was deliberately left untouched. */
function warnSkipped(ctx, reason, intent) {
	const detail = reason === "unsupported" ? `an unsupported vault format (version ${VAULT_VERSION} expected)` : "a malformed vault record";
	ctx.logger.warn(`provider: could not ${intent}: the codex-subscription vault record is ${detail}`);
}
//#endregion
//#region src/login.ts
/**
* OAuth interaction for the account-management GUI.
*
* An interactive multi-step OAuth flow is driven as a state machine:
* - `notify()` events (auth URL, device code) are collected and exposed.
* - Providers that complete in-browser without further input complete directly.
* - Providers that require pasting a code back (`manual_code`, e.g. OpenAI
*   Codex) are parked in a {@link CodeRegistry}; the GUI completes the pending
*   prompt so the login resumes and persists.
*
* Reuses pi-ai's `Models.login` and its `AuthInteraction` contract.
*
* @module @tsuuanmi/provider/login
*/
/** How long a parked manual-code login may wait before it must be reissued. */
const PENDING_CODE_TTL_MS = 6e5;
/** Registry of parked manual-code logins, keyed by token. */
var CodeRegistry = class {
	pending = /* @__PURE__ */ new Map();
	/** Complete a parked login with the pasted code. */
	async complete(token, code) {
		const pending = this.pending.get(token);
		if (!pending) throw new AccountError("NEEDS_CODE", `No pending login for token "${token}"; it may have expired. Start the add-account flow again.`);
		if (Date.now() > pending.expires) {
			this.pending.delete(token);
			pending.reject(new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`));
			throw new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`);
		}
		this.pending.delete(token);
		pending.resolve(code);
		return pending.done;
	}
	/** Park a login that needs a pasted code, keyed by its pre-issued token. */
	add(entry) {
		this.pending.set(entry.token, {
			...entry,
			expires: Date.now() + PENDING_CODE_TTL_MS
		});
	}
	/** Reap expired pending logins (never throws). */
	reap() {
		const now = Date.now();
		for (const [token, pending] of this.pending) if (now > pending.expires) {
			this.pending.delete(token);
			pending.reject(new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`));
		}
	}
};
function defer() {
	let resolve;
	let reject;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
}
/** Render an auth event (URL / device code / progress) as fallback text. */
function renderAuthEvent(event) {
	switch (event.type) {
		case "auth_url": return event.instructions ? `${event.url}\n${event.instructions}` : event.url;
		case "device_code": return `Go to ${event.verificationUri} and enter code: ${event.userCode}`;
		case "progress": return event.message;
		case "info": return event.message;
	}
}
/** Return the raw URL for a browser OAuth dialog; keep text rendering for other events. */
function authUrlFromEvent(event) {
	return event.type === "auth_url" ? event.url : renderAuthEvent(event);
}
/**
* Start an OAuth login for one named account. Use {@link waitForLoginEvent} to
* expose the auth URL/device code promptly, then drive completion through
* the `done` promise and the manual-code registry.
*/
function startOAuthLogin(options) {
	const { providerId, accountId, buildProvider, store, registry, token } = options;
	const abortController = new AbortController();
	const events = [];
	const firstEvent = defer();
	let firstEventResolved = false;
	let loginDone;
	const interaction = {
		signal: abortController.signal,
		notify: (event) => {
			events.push(event);
			if (!firstEventResolved) {
				firstEventResolved = true;
				firstEvent.resolve(event);
			}
		},
		prompt: async (prompt) => {
			switch (prompt.type) {
				case "manual_code": {
					const codeDone = defer();
					registry.add({
						providerId,
						accountId,
						resolve: codeDone.resolve,
						reject: codeDone.reject,
						done: loginDone,
						token
					});
					return codeDone.promise;
				}
				case "select": return prompt.options[0]?.id ?? "";
				case "text":
				case "secret": throw new AccountError("NEEDS_KEY", `Provider "${providerId}" requested interactive ${prompt.type} input, which the account GUI cannot collect.`);
			}
		}
	};
	const models = createModels({ credentials: new ActiveCredentialStore(store, {
		providerId,
		accountId
	}) });
	models.setProvider(buildProvider());
	loginDone = models.login(providerId, "oauth", interaction).catch((error) => {
		if (abortController.signal.aborted) throw new AccountError("CANCELED", "Login cancelled.");
		throw error;
	});
	return {
		done: loginDone,
		firstEvent: firstEvent.promise,
		events,
		abort: (reason) => {
			abortController.abort(reason);
		}
	};
}
/**
* Wait for the first auth event with a deadline, so the GUI receives a login
* instruction promptly instead of blocking on completion.
*/
async function waitForLoginEvent(handle, timeoutMs = 1e4) {
	const timeout = new Promise((_, reject) => {
		setTimeout(() => reject(new AccountError("LOGIN_FAILED", "Timed out waiting for a login URL.")), timeoutMs);
	});
	return Promise.race([handle.firstEvent, timeout]);
}
//#endregion
//#region src/providers.ts
/**
* The `llm-pi-ai` settings namespace, as a literal branded string.
* `dsh-settings` removed its runtime `settingsNamespace()` helper in
* 0.1.2-rc.1, but `ctx.settings.get` accepts the same namespace string in
* every supported generation — and the type-only import keeps this module
* free of any runtime requirement on the removed helper's export.
*/
const LLM_PI_AI_NAMESPACE = "llm-pi-ai";
/** The OAuth-capable providers this plugin manages. Extend to add more. */
const OAUTH_PROVIDERS = [{
	id: "openai-codex",
	name: "OpenAI Codex",
	build: () => openaiCodexProvider()
}];
/** Resolve a managed OAuth provider by id. */
function findOAuthProvider(providerId) {
	return OAUTH_PROVIDERS.find((provider) => provider.id === providerId);
}
/** Load the `llm-pi-ai` settings namespace value (empty when absent/unregistered). */
function profileMap(ctx) {
	const providers = ctx.settings.get(LLM_PI_AI_NAMESPACE);
	return new Map(Object.entries(providers?.providers ?? {}));
}
/** The effective inventory of accounts the plugin can manage. */
function buildInventory(ctx) {
	const byId = /* @__PURE__ */ new Map();
	for (const [id, profile] of profileMap(ctx)) {
		const info = {
			id,
			name: profile.displayName ?? id,
			kind: "profile",
			oauth: false
		};
		if (profile.apiKeyEnv !== void 0) info.apiKeyEnv = profile.apiKeyEnv;
		byId.set(id, info);
	}
	for (const provider of OAUTH_PROVIDERS) if (!byId.has(provider.id)) byId.set(provider.id, {
		id: provider.id,
		name: provider.name,
		kind: "oauth",
		oauth: true
	});
	return [...byId.values()];
}
/** Look up one provider in the inventory. */
function findAccountProvider(inventory, providerId) {
	return inventory.find((info) => info.id === providerId);
}
const CODEX_SUBSCRIPTION_OAUTH_REF = credentialRef("OPENAI_CODEX_SUBSCRIPTION_OAUTH");
/** Make `accountId` the active account for `providerId` (persists + rewires). */
async function switchActiveAccount(ctx, store, providerId, accountId) {
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) throw new AccountError("UNKNOWN_PROVIDER", `Unknown provider "${providerId}".`);
	await store.setActive(providerId, accountId);
	const credential = await store.getCredential(providerId, accountId);
	if (info.kind === "profile" && info.apiKeyEnv !== void 0 && credential?.type === "api_key" && credential.key) await ctx.credentials.set(credentialRef(info.apiKeyEnv), credential.key);
	if (providerId === "openai-codex" && credential?.type === "oauth") {
		await ctx.credentials.set(CODEX_SUBSCRIPTION_OAUTH_REF, JSON.stringify(credential));
		await syncCodexSubscriptionAccount(ctx, credential, accountId);
	}
}
/**
* Tear down the active account's mirrored credential for a provider, used after
* removing the active account so no stale credential (e.g. the Codex
* subscription OAuth grant) is left behind for another plugin to keep using.
* Removing an absent reference is a no-op in the credentials seam.
*/
async function clearActiveAccountCredential(ctx, providerId) {
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) return;
	if (info.kind === "profile" && info.apiKeyEnv !== void 0) await ctx.credentials.unset(credentialRef(info.apiKeyEnv));
	if (providerId === "openai-codex") await ctx.credentials.unset(CODEX_SUBSCRIPTION_OAUTH_REF);
}
//#endregion
//#region src/account-rpc.ts
/**
* Account RPC service for the GUI dropdown.
*
* Registers a dedicated logical RPC channel (`/provider`) on the host
* connection. The client plugin (browser half) calls these through
* `ctx.connection.rpc.call("/provider", endpoint, payload)`; each handler
* returns an `RpcResult` and never throws. Reuses the plugin's multi-account
* store, the shared switch helper, and the OAuth login controller + code
* registry.
*
* @module @tsuuanmi/provider/rpc
*/
function requireStr(value, name) {
	if (typeof value === "string" && value.length > 0) return value;
	throw new AccountError("UNKNOWN_ACCOUNT", `provider: missing required string field "${name}"`);
}
function errText(error) {
	return error instanceof Error ? error.message : String(error);
}
function fold(error) {
	return {
		code: "internal",
		message: errText(error),
		details: {}
	};
}
/** Build the full list view from the inventory + store. */
async function buildList(ctx, store) {
	const inventory = buildInventory(ctx);
	const providers = [];
	for (const info of inventory) {
		const accounts = await store.listAccounts(info.id);
		const active = await store.getActive(info.id);
		providers.push({
			id: info.id,
			name: info.name,
			kind: info.kind,
			oauth: info.oauth,
			accounts: accounts.map((account) => ({
				accountId: account.accountId,
				type: account.type,
				active: account.accountId === active
			}))
		});
	}
	return { providers };
}
/** Start a managed OAuth login, returning the URL + resume token immediately. */
async function startOAuth(ctx, store, registry, providerId, accountId) {
	const managed = findOAuthProvider(providerId);
	if (!managed) throw new AccountError("NO_OAUTH", `Provider "${providerId}" has no OAuth flow to start.`);
	const token = randomUUID();
	const handle = startOAuthLogin({
		providerId,
		accountId,
		buildProvider: managed.build,
		store,
		registry,
		token
	});
	const event = await waitForLoginEvent(handle);
	handle.done.then(async () => {
		if (!await store.getActive(providerId)) await switchActiveAccount(ctx, store, providerId, accountId);
	}).catch((error) => ctx.logger.warn("provider: login for \"%s\" failed: %s", accountId, errText(error)));
	return {
		kind: "oauth",
		url: authUrlFromEvent(event),
		token,
		providerId,
		accountId
	};
}
/** Start adding an account: api-key providers add now; OAuth returns a URL + token. */
async function startAdd(ctx, store, registry, payload) {
	const providerId = requireStr(payload.providerId, "providerId");
	const accountId = requireStr(payload.accountId, "accountId");
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) throw new AccountError("UNKNOWN_PROVIDER", `Unknown provider "${providerId}". Known: ${buildInventory(ctx).map((p) => p.id).join(", ")}`);
	if (await store.hasAccount(providerId, accountId)) throw new AccountError("DUPLICATE_ACCOUNT", `Account "${accountId}" already exists for ${providerId}`);
	if (info.oauth) return startOAuth(ctx, store, registry, providerId, accountId);
	if (payload.key === void 0 || payload.key.length === 0) throw new AccountError("NEEDS_KEY", `Provide the API key for ${providerId} to add an account.`);
	await store.addAccount(providerId, accountId, {
		type: "api_key",
		key: payload.key
	});
	if (info.apiKeyEnv !== void 0) await ctx.credentials.set(credentialRef(info.apiKeyEnv), payload.key);
	if (!await store.getActive(providerId)) await store.setActive(providerId, accountId);
	return {
		kind: "added",
		providerId,
		accountId
	};
}
/** Register the account RPC endpoints on a dedicated logical channel. */
function registerAccountRpc(ctx, store, registry) {
	const handler = async (endpoint, payload, _signal) => {
		try {
			let value;
			switch (endpoint) {
				case "list":
					value = await buildList(ctx, store);
					break;
				case "switch": {
					const ref = payload;
					const providerId = requireStr(ref?.providerId, "providerId");
					const accountId = requireStr(ref?.accountId, "accountId");
					await switchActiveAccount(ctx, store, providerId, accountId);
					value = { active: accountId };
					break;
				}
				case "remove": {
					const ref = payload;
					const providerId = requireStr(ref?.providerId, "providerId");
					const accountId = requireStr(ref?.accountId, "accountId");
					const credential = await store.getCredential(providerId, accountId);
					if (await store.removeAccount(providerId, accountId)) await clearActiveAccountCredential(ctx, providerId);
					if (providerId === "openai-codex" && credential?.type === "oauth") {
						await removeCodexSubscriptionAccount(ctx, credential);
						const active = await store.getActive(providerId);
						if (active !== void 0) {
							const activeCredential = await store.getCredential(providerId, active);
							if (activeCredential?.type === "oauth") await syncCodexSubscriptionAccount(ctx, activeCredential, active);
						}
					}
					value = { removed: accountId };
					break;
				}
				case "add-start":
					value = await startAdd(ctx, store, registry, payload ?? {});
					break;
				case "add-complete": {
					const p = payload ?? {};
					await registry.complete(requireStr(p?.token, "token"), requireStr(p?.code, "code"));
					value = { done: true };
					break;
				}
				default: throw new AccountError("UNKNOWN_ACCOUNT", `Unknown endpoint "${endpoint}".`);
			}
			return {
				ok: true,
				value
			};
		} catch (error) {
			return {
				ok: false,
				error: fold(error)
			};
		}
	};
	return ctx.connection.rpc.handle("/provider", handler, { authority: "loopback" });
}
//#endregion
//#region src/index.ts
const name = "provider";
const inject = [
	"connection",
	"credentials",
	"settings"
];
/** How often parked manual-code logins are reaped. */
const CODE_REAP_INTERVAL_MS = 6e4;
function apply(ctx) {
	const store = new AccountStore();
	const registry = new CodeRegistry();
	const disposeRpc = registerAccountRpc(ctx, store, registry);
	const timer = setInterval(() => registry.reap(), CODE_REAP_INTERVAL_MS);
	return () => {
		clearInterval(timer);
		disposeRpc();
	};
}
//#endregion
export { apply, inject, name };
