import { AccountError } from "./invariant.js";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
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
	/** All named accounts for one provider, in insertion order. */
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
		});
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
	/** Remove one named account. Refuses removing the active account. */
	async removeAccount(providerId, accountId) {
		await this.mutate((doc) => {
			const entry = doc.providers[providerId];
			if (!entry || entry.accounts[accountId] === void 0) throw new AccountError("UNKNOWN_ACCOUNT", `No account "${accountId}" for ${providerId}`);
			if (entry.active === accountId) throw new AccountError("ACTIVE_ACCOUNT", `Account "${accountId}" is active for ${providerId}; switch first`);
			delete entry.accounts[accountId];
			if (Object.keys(entry.accounts).length === 0) delete doc.providers[providerId];
			return doc;
		});
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
//#region src/providers.ts
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
	const providers = ctx.settings.get(settingsNamespace("llm-pi-ai"));
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
//#endregion
//#region src/adapter.ts
const STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Add a request-scoped api-key auth so pi-ai honors the bearer override. */
function wrapBearerApiKeyAuth(provider) {
	const apiKeyAuth = {
		name: "OAuth bearer token",
		async resolve(input) {
			const apiKey = input.credential?.key;
			return apiKey === void 0 || apiKey.length === 0 ? void 0 : {
				auth: { apiKey },
				source: "OAuth"
			};
		}
	};
	return {
		...provider,
		auth: {
			...provider.auth,
			apiKey: apiKeyAuth
		}
	};
}
/** Build a PiAiAdapter for one managed OAuth provider reading the active account. */
function buildOAuthAdapter(provider, name, activeStore) {
	const piProvider = wrapBearerApiKeyAuth(provider);
	const models = createModels({ credentials: activeStore });
	models.setProvider(provider);
	const profiles = /* @__PURE__ */ new Map([[provider.id, {
		provider: provider.id,
		displayName: name,
		streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
		retryPolicy: resolveRetryPolicy(void 0, `provider ${provider.id} retryPolicy`),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		piProvider
	}]]);
	return new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: async () => (await models.getAuth(provider.id))?.auth.apiKey
	});
}
/**
* Register adapters for every managed OAuth provider that is not already
* routed. Returns the count of providers actually registered.
*/
function registerOAuthProviders(ctx, store) {
	const existing = new Set(ctx.llm.listProviders().map((info) => info.id));
	const activeStore = new ActiveCredentialStore(store);
	let registered = 0;
	for (const managed of OAUTH_PROVIDERS) {
		if (existing.has(managed.id)) {
			ctx.logger.warn("provider: provider \"%s\" is already routed by another adapter; skipping registration", managed.id);
			continue;
		}
		try {
			const adapter = buildOAuthAdapter(managed.build(), managed.name, activeStore);
			ctx.llm.registerAdapter([managed.id], adapter);
			registered += 1;
		} catch (error) {
			ctx.logger.warn("provider: failed to register provider \"%s\": %s", managed.id, String(error));
		}
	}
	return registered;
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
//#region src/switch.ts
/** Make `accountId` the active account for `providerId` (persists + rewires). */
async function switchActiveAccount(ctx, store, providerId, accountId) {
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) throw new AccountError("UNKNOWN_PROVIDER", `Unknown provider "${providerId}".`);
	await store.setActive(providerId, accountId);
	if (info.kind === "profile" && info.apiKeyEnv !== void 0) {
		const credential = await store.getCredential(providerId, accountId);
		if (credential?.type === "api_key" && credential.key) await ctx.credentials.set(credentialRef(info.apiKeyEnv), credential.key);
	}
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
		if (!await store.getActive(providerId)) await store.setActive(providerId, accountId);
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
					await store.removeAccount(providerId, accountId);
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
	"settings",
	"llm"
];
/** How often parked manual-code logins are reaped. */
const CODE_REAP_INTERVAL_MS = 6e4;
function apply(ctx) {
	const store = new AccountStore();
	const registry = new CodeRegistry();
	const registered = registerOAuthProviders(ctx, store);
	if (registered > 0) ctx.logger.info("provider: registered %d OAuth provider adapter(s)", registered);
	const disposeRpc = registerAccountRpc(ctx, store, registry);
	const timer = setInterval(() => registry.reap(), CODE_REAP_INTERVAL_MS);
	return () => {
		clearInterval(timer);
		disposeRpc();
	};
}
//#endregion
export { apply, inject, name };
