/**
 * Provider inventory for account management.
 *
 * Accounts are managed for two families of providers:
 * - **profile** providers already routed by `dsh-llm-pi-ai` (from the
 *   `llm-pi-ai` settings namespace); their API keys live in DSH's `credentials`
 *   service referenced by `apiKeyEnv`.
 * - **oauth** providers the plugin routes itself (e.g. OpenAI Codex) through
 *   pi-ai, authenticating with a stored OAuth token.
 *
 * Reuses pi-ai's built-in provider factories (no reimplementation of OAuth).
 *
 * @module @tsuuanmi/provider/providers
 */
import type { Context } from "@deepseek-ai/cordis";
import type { Provider } from "@earendil-works/pi-ai";
import type { SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

/**
 * The `llm-pi-ai` settings namespace, as a literal branded string.
 * `dsh-settings` removed its runtime `settingsNamespace()` helper in
 * 0.1.2-rc.1, but `ctx.settings.get` accepts the same namespace string in
 * every supported generation — and the type-only import keeps this module
 * free of any runtime requirement on the removed helper's export.
 */
const LLM_PI_AI_NAMESPACE = "llm-pi-ai" as SettingsNamespace;

/** One OAuth provider the plugin routes and can log into. */
export interface ManagedOAuthProvider {
	id: string;
	name: string;
	/** pi-ai provider factory; owns native OAuth + API implementations. */
	build: () => Provider;
}

/** The OAuth-capable providers this plugin manages. Extend to add more. */
export const OAUTH_PROVIDERS: readonly ManagedOAuthProvider[] = [
	{ id: "openai-codex", name: "OpenAI Codex", build: () => openaiCodexProvider() },
];

/** Resolve a managed OAuth provider by id. */
export function findOAuthProvider(providerId: string): ManagedOAuthProvider | undefined {
	return OAUTH_PROVIDERS.find((provider) => provider.id === providerId);
}

/** One provider surfaced by the account-management inventory. */
export interface AccountProviderInfo {
	id: string;
	name: string;
	kind: "profile" | "oauth";
	/** Credential ref (env-var name) for profile providers; the value lives in `ctx.credentials`. */
	apiKeyEnv?: string;
	/** Whether this provider authenticates by OAuth. */
	oauth: boolean;
}

/** One `llm-pi-ai` provider profile as resolved from settings. */
interface LlmProfile {
	displayName?: string;
	apiKeyEnv?: string;
}

/** Load the `llm-pi-ai` settings namespace value (empty when absent/unregistered). */
function profileMap(ctx: Context): Map<string, LlmProfile> {
	const providers = ctx.settings.get(LLM_PI_AI_NAMESPACE) as
		| { providers?: Record<string, LlmProfile> }
		| undefined;
	return new Map(Object.entries(providers?.providers ?? {}));
}

/** The effective inventory of accounts the plugin can manage. */
export function buildInventory(ctx: Context): readonly AccountProviderInfo[] {
	const byId = new Map<string, AccountProviderInfo>();
	for (const [id, profile] of profileMap(ctx)) {
		const info: AccountProviderInfo = { id, name: profile.displayName ?? id, kind: "profile", oauth: false };
		if (profile.apiKeyEnv !== undefined) info.apiKeyEnv = profile.apiKeyEnv;
		byId.set(id, info);
	}
	for (const provider of OAUTH_PROVIDERS) {
		if (!byId.has(provider.id)) {
			byId.set(provider.id, { id: provider.id, name: provider.name, kind: "oauth", oauth: true });
		}
	}
	return [...byId.values()];
}

/** Look up one provider in the inventory. */
export function findAccountProvider(
	inventory: readonly AccountProviderInfo[],
	providerId: string,
): AccountProviderInfo | undefined {
	return inventory.find((info) => info.id === providerId);
}
