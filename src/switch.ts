/**
 * Shared active-account switching logic, used by both the RPC service and any
 * future surface. Sets the provider's active account in the store, writes
 * `llm-pi-ai` profile API keys into their DSH credential slots, and mirrors the
 * active OpenAI Codex OAuth credential for `dsh-codex-subscription`.
 *
 * @module @tsuuanmi/provider/switch
 */
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { AccountStore } from "./account-store.ts";
import { AccountError } from "./invariant.ts";
import { buildInventory, findAccountProvider } from "./providers.ts";

const CODEX_PROVIDER_ID = "openai-codex";
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
		await ctx.credentials.set(CODEX_SUBSCRIPTION_OAUTH_REF, JSON.stringify(credential));
	}
}
