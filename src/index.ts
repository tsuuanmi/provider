/**
 * dsh-account — pi-style multi-account provider management for DSH.
 *
 * Keeps a multi-account credential store (one active account per provider),
 * routes the managed OAuth providers (OpenAI Codex) so the running agent uses
 * the active account, and exposes an `/api` RPC surface (`dsh-account/*`) that
 * the GUI dropdown (browser client half) calls to list, switch, add, and remove
 * accounts. Reuses pi-ai's `Models`/OAuth and the DSH `credentials`, `settings`,
 * and `llm` services; only the multi-account store and the RPC dispatch are new.
 *
 * @module @tsuuanmi/dsh-account
 */
import type { Context } from "@deepseek-ai/cordis";
import { AccountStore } from "./account-store.ts";
import { registerOAuthProviders } from "./adapter.ts";
import { registerAccountRpc } from "./account-rpc.ts";
import { CodeRegistry } from "./login.ts";

export const name = "dsh-account";
export const inject = ["connection", "credentials", "settings", "llm"];

/** How often parked manual-code logins are reaped. */
const CODE_REAP_INTERVAL_MS = 60_000;

export function apply(ctx: Context): () => void {
	const store = new AccountStore();
	const registry = new CodeRegistry();
	const registered = registerOAuthProviders(ctx, store);
	if (registered > 0) {
		ctx.logger.info('dsh-account: registered %d OAuth provider adapter(s)', registered);
	}
	const disposeRpc = registerAccountRpc(ctx, store, registry);
	const timer = setInterval(() => registry.reap(), CODE_REAP_INTERVAL_MS);
	return () => {
		clearInterval(timer);
		void disposeRpc();
	};
}
