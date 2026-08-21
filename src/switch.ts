/**
 * Shared active-account switching logic, used by both the RPC service and any
 * future surface. Sets the provider's active account in the store and, for
 * `llm-pi-ai` profile providers, writes the active account's API key into DSH's
 * credential slot so the routed agent actually uses it.
 *
 * @module @tsuuanmi/provider/switch
 */
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { AccountStore } from "./account-store.ts";
import { AccountError } from "./invariant.ts";
import { buildInventory, findAccountProvider } from "./providers.ts";

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
	if (info.kind === "profile" && info.apiKeyEnv !== undefined) {
		const credential = await store.getCredential(providerId, accountId);
		if (credential?.type === "api_key" && credential.key) {
			await ctx.credentials.set(credentialRef(info.apiKeyEnv), credential.key);
		}
	}
}
