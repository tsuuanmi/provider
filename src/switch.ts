/**
 * Shared active-account switching logic, used by both the RPC service and any
 * future surface. Sets the provider's active account in the store, writes
 * `llm-pi-ai` profile API keys into their DSH credential slots, and mirrors
 * the active OpenAI Codex OAuth credential for `dsh-codex-subscription` —
 * both its legacy string reference and (for 1.13+) its multi-account vault
 * record, so the *running* Codex route switches accounts too.
 *
 * @module @tsuuanmi/provider/switch
 */
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { AccountStore } from "./account-store.ts";
import { syncCodexSubscriptionAccount } from "./codex-subscription.ts";
import { AccountError } from "./invariant.ts";
import { buildInventory, findAccountProvider } from "./providers.ts";

export const CODEX_PROVIDER_ID = "openai-codex";
const CODEX_SUBSCRIPTION_OAUTH_REF = credentialRef("OPENAI_CODEX_SUBSCRIPTION_OAUTH");

/** Make `accountId` the active account for `providerId` (persists + rewires). */
export async function switchActiveAccount(
	ctx: Context,
	store: AccountStore,
	providerId: string,
	accountId: string,
): Promise<void> {
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) throw new AccountError("UNKNOWN_PROVIDER", `Unknown provider "${providerId}".`);
	await store.setActive(providerId, accountId); // throws UNKNOWN_ACCOUNT when absent
	const credential = await store.getCredential(providerId, accountId);
	if (info.kind === "profile" && info.apiKeyEnv !== undefined && credential?.type === "api_key" && credential.key) {
		await ctx.credentials.set(credentialRef(info.apiKeyEnv), credential.key);
	}
	if (providerId === CODEX_PROVIDER_ID && credential?.type === "oauth") {
		// Legacy reference for `dsh-codex-subscription` < 1.13 (per-operation
		// reads pick the change up without a restart) ...
		await ctx.credentials.set(CODEX_SUBSCRIPTION_OAUTH_REF, JSON.stringify(credential));
		// ... and the 1.13+ account vault, which the running route actually
		// resolves per request. Without this half the host keeps serving the
		// previously active account even though the reference changed.
		await syncCodexSubscriptionAccount(ctx, credential, accountId);
	}
}

/**
 * Tear down the active account's mirrored credential for a provider, used after
 * removing the active account so no stale credential (e.g. the Codex
 * subscription OAuth grant) is left behind for another plugin to keep using.
 * Removing an absent reference is a no-op in the credentials seam.
 */
export async function clearActiveAccountCredential(ctx: Context, providerId: string): Promise<void> {
	const info = findAccountProvider(buildInventory(ctx), providerId);
	if (!info) return;
	if (info.kind === "profile" && info.apiKeyEnv !== undefined) {
		await ctx.credentials.unset(credentialRef(info.apiKeyEnv));
	}
	if (providerId === CODEX_PROVIDER_ID) {
		await ctx.credentials.unset(CODEX_SUBSCRIPTION_OAUTH_REF);
	}
}
