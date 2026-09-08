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
import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionRpcHandler } from "@deepseek-ai/dsh-client-connection";
import type { RpcError, RpcResult } from "@deepseek-ai/dsh-host-apiproxy";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { AccountStore, type AccountInfo } from "./account-store.ts";
import { removeCodexSubscriptionAccount, syncCodexSubscriptionAccount } from "./codex-subscription.ts";
import { AccountError } from "./invariant.ts";
import { CodeRegistry, authUrlFromEvent, startOAuthLogin, waitForLoginEvent } from "./login.ts";
import { buildInventory, findAccountProvider, findOAuthProvider, type AccountProviderInfo } from "./providers.ts";
import { CODEX_PROVIDER_ID, clearActiveAccountCredential, switchActiveAccount } from "./switch.ts";

/** One account rendered for the dropdown. */
export interface AccountView {
	accountId: string;
	type: "api_key" | "oauth";
	/** Whether this is the provider's active account. */
	active: boolean;
}

/** One provider group rendered for the dropdown. */
export interface ProviderView {
	id: string;
	name: string;
	kind: "profile" | "oauth";
	oauth: boolean;
	accounts: AccountView[];
}

/** `provider/list` result. */
export interface AccountListResult {
	providers: ProviderView[];
}

/** `provider/add-start` result for an OAuth provider. */
export interface OAuthStartResult {
	kind: "oauth";
	url: string;
	token: string;
	providerId: string;
	accountId: string;
}

/** `provider/add-start` result for an api-key provider. */
export interface AddedResult {
	kind: "added";
	providerId: string;
	accountId: string;
}

/** Loose dispatch payload shapes (fields validated at use). */
interface AddStartPayload {
	providerId?: string;
	accountId?: string;
	key?: string;
}
interface AddCompletePayload {
	token?: string;
	code?: string;
}
interface AccountRefPayload {
	providerId?: string;
	accountId?: string;
}

function requireStr(value: unknown, name: string): string {
	if (typeof value === "string" && value.length > 0) return value;
	throw new AccountError("UNKNOWN_ACCOUNT", `provider: missing required string field "${name}"`);
}

function errText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function fold(error: unknown): RpcError {
	// Folding every failure into the catch-all code keeps this third-party
	// surface free of the closed RpcErrorCode union; the message carries detail.
	return { code: "internal", message: errText(error), details: {} };
}

/** Build the full list view from the inventory + store. */
async function buildList(ctx: Context, store: AccountStore): Promise<AccountListResult> {
	const inventory = buildInventory(ctx);
	const providers: ProviderView[] = [];
	for (const info of inventory) {
		const accounts: AccountInfo[] = await store.listAccounts(info.id);
		const active = await store.getActive(info.id);
		providers.push({
			id: info.id,
			name: info.name,
			kind: info.kind,
			oauth: info.oauth,
			accounts: accounts.map((account) => ({
				accountId: account.accountId,
				type: account.type,
				active: account.accountId === active,
			})),
		});
	}
	return { providers };
}

/** Start a managed OAuth login, returning the URL + resume token immediately. */
async function startOAuth(
	ctx: Context,
	store: AccountStore,
	registry: CodeRegistry,
	providerId: string,
	accountId: string,
): Promise<OAuthStartResult> {
	const managed = findOAuthProvider(providerId);
	if (!managed) throw new AccountError("NO_OAUTH", `Provider "${providerId}" has no OAuth flow to start.`);
	const token = randomUUID();
	const handle = startOAuthLogin({ providerId, accountId, buildProvider: managed.build, store, registry, token });
	const event = await waitForLoginEvent(handle);
	// Non-blocking: persist + activate-if-first when the browser callback (or a
	// later add-complete code) finishes the login.
	handle.done
		.then(async () => {
			if (!(await store.getActive(providerId))) await switchActiveAccount(ctx, store, providerId, accountId);
		})
		.catch((error) => ctx.logger.warn('provider: login for "%s" failed: %s', accountId, errText(error)));
	return { kind: "oauth", url: authUrlFromEvent(event), token, providerId, accountId };
}

/** Start adding an account: api-key providers add now; OAuth returns a URL + token. */
async function startAdd(
	ctx: Context,
	store: AccountStore,
	registry: CodeRegistry,
	payload: AddStartPayload,
): Promise<OAuthStartResult | AddedResult> {
	const providerId = requireStr(payload.providerId, "providerId");
	const accountId = requireStr(payload.accountId, "accountId");
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) {
		throw new AccountError(
			"UNKNOWN_PROVIDER",
			`Unknown provider "${providerId}". Known: ${buildInventory(ctx).map((p) => p.id).join(", ")}`,
		);
	}
	if (await store.hasAccount(providerId, accountId)) {
		throw new AccountError("DUPLICATE_ACCOUNT", `Account "${accountId}" already exists for ${providerId}`);
	}
	if (info.oauth) return startOAuth(ctx, store, registry, providerId, accountId);
	if (payload.key === undefined || payload.key.length === 0) {
		throw new AccountError("NEEDS_KEY", `Provide the API key for ${providerId} to add an account.`);
	}
	await store.addAccount(providerId, accountId, { type: "api_key", key: payload.key });
	if (info.apiKeyEnv !== undefined) await ctx.credentials.set(credentialRef(info.apiKeyEnv), payload.key);
	if (!(await store.getActive(providerId))) await store.setActive(providerId, accountId);
	return { kind: "added", providerId, accountId };
}

/** Register the account RPC endpoints on a dedicated logical channel. */
export function registerAccountRpc(
	ctx: Context,
	store: AccountStore,
	registry: CodeRegistry,
): () => Promise<void> {
	// The shared `/api` channel already owns an interceptor (the API gateway),
	// so a plugin surface must register its own channel via `handle`.
	const handler: ConnectionRpcHandler = async (endpoint, payload, _signal) => {
		try {
			let value: unknown;
			switch (endpoint) {
				case "list":
					value = await buildList(ctx, store);
					break;
				case "switch": {
					const ref = payload as AccountRefPayload;
					const providerId = requireStr(ref?.providerId, "providerId");
					const accountId = requireStr(ref?.accountId, "accountId");
					await switchActiveAccount(ctx, store, providerId, accountId);
					value = { active: accountId };
					break;
				}
				case "remove": {
					const ref = payload as AccountRefPayload;
					const providerId = requireStr(ref?.providerId, "providerId");
					const accountId = requireStr(ref?.accountId, "accountId");
					const credential = await store.getCredential(providerId, accountId); // before removal
					const wasActive = await store.removeAccount(providerId, accountId);
					if (wasActive) await clearActiveAccountCredential(ctx, providerId);
					if (providerId === CODEX_PROVIDER_ID && credential?.type === "oauth") {
						// The removed account's grant must not survive in the
						// Codex subscription vault the running route reads from.
						await removeCodexSubscriptionAccount(ctx, credential);
						const active = await store.getActive(providerId);
						if (active !== undefined) {
							// The provider still has an active account: keep the
							// vault's active account pinned to it.
							const activeCredential = await store.getCredential(providerId, active);
							if (activeCredential?.type === "oauth") {
								await syncCodexSubscriptionAccount(ctx, activeCredential, active);
							}
						}
					}
					value = { removed: accountId };
					break;
				}
				case "add-start":
					value = await startAdd(ctx, store, registry, (payload ?? {}) as AddStartPayload);
					break;
				case "add-complete": {
					const p = (payload ?? {}) as AddCompletePayload;
					await registry.complete(requireStr(p?.token, "token"), requireStr(p?.code, "code"));
					value = { done: true };
					break;
				}
				default:
					throw new AccountError("UNKNOWN_ACCOUNT", `Unknown endpoint "${endpoint}".`);
			}
			return { ok: true, value } satisfies RpcResult<unknown>;
		} catch (error) {
			return { ok: false, error: fold(error) } satisfies RpcResult<unknown>;
		}
	};
	return ctx.connection.rpc.handle("/provider", handler, { authority: "loopback" });
}
