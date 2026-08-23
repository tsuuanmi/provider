/**
 * provider — pi-style multi-account provider management for DSH.
 *
 * Keeps a multi-account credential store (one active account per provider),
 * mirrors the active OpenAI Codex credential for `dsh-codex-subscription`, and
 * exposes an `/api` RPC surface (`provider/*`) that the GUI dropdown (browser
 * client half) calls to list, switch, add, and remove accounts. Reuses pi-ai's
 * OAuth and the DSH `credentials` and `settings` services; only the
 * multi-account store and the RPC dispatch are new.
 *
 * @module @tsuuanmi/provider
 */
import type { Context } from "@deepseek-ai/cordis";
import { AccountStore } from "./account-store.ts";
import { registerAccountRpc } from "./account-rpc.ts";
import { CodeRegistry } from "./login.ts";

export const name = "provider";
export const inject = ["connection", "credentials", "settings"];

/** How often parked manual-code logins are reaped. */
const CODE_REAP_INTERVAL_MS = 60_000;

export function apply(ctx: Context): () => void {
	const store = new AccountStore();
	const registry = new CodeRegistry();
	const disposeRpc = registerAccountRpc(ctx, store, registry);
	const timer = setInterval(() => registry.reap(), CODE_REAP_INTERVAL_MS);
	return () => {
		clearInterval(timer);
		void disposeRpc();
	};
}
