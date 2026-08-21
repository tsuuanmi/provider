/**
 * Register pi-ai OAuth providers as usable Harness provider routes.
 *
 * Mirrors dsh-codex-connect's approach: a `PiAiAdapter` over pi-ai's `Models`
 * whose `resolveApiKey` yields the active account's OAuth bearer token, so the
 * running agent uses whichever account is marked active. Reuses
 * `PiAiAdapter` and `Models.getAuth` from the DSH/pi-ai stack.
 *
 * @module @tsuuanmi/provider/adapter
 */
import type { Context } from "@deepseek-ai/cordis";
import { createModels } from "@earendil-works/pi-ai";
import type { ApiKeyAuth, AuthResult, Provider } from "@earendil-works/pi-ai";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { AccountStore, ActiveCredentialStore } from "./account-store.ts";
import { OAUTH_PROVIDERS } from "./providers.ts";

const STREAM_IDLE_TIMEOUT_MS = 300_000;

/** Add a request-scoped api-key auth so pi-ai honors the bearer override. */
function wrapBearerApiKeyAuth(provider: Provider): Provider {
	const apiKeyAuth: ApiKeyAuth = {
		name: "OAuth bearer token",
		async resolve(input: { credential?: { key?: string } }): Promise<AuthResult | undefined> {
			const apiKey = input.credential?.key;
			return apiKey === undefined || apiKey.length === 0 ? undefined : { auth: { apiKey }, source: "OAuth" };
		},
	};
	return {
		...provider,
		auth: { ...provider.auth, apiKey: apiKeyAuth },
	};
}

/** Build a PiAiAdapter for one managed OAuth provider reading the active account. */
export function buildOAuthAdapter(
	provider: Provider,
	name: string,
	activeStore: ActiveCredentialStore,
): PiAiAdapter {
	const piProvider = wrapBearerApiKeyAuth(provider);
	const models = createModels({ credentials: activeStore });
	models.setProvider(provider);
	const profiles = new Map([
		[
			provider.id,
			{
				provider: provider.id,
				displayName: name,
				streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
				retryPolicy: resolveRetryPolicy(undefined, `provider ${provider.id} retryPolicy`),
				configuredMaxTokens: new Map<string, number>(),
				piProvider,
			},
		],
	]);
	return new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: async () => (await models.getAuth(provider.id))?.auth.apiKey,
	});
}

/**
 * Register adapters for every managed OAuth provider that is not already
 * routed. Returns the count of providers actually registered.
 */
export function registerOAuthProviders(ctx: Context, store: AccountStore): number {
	const existing = new Set(ctx.llm.listProviders().map((info) => info.id));
	const activeStore = new ActiveCredentialStore(store);
	let registered = 0;
	for (const managed of OAUTH_PROVIDERS) {
		if (existing.has(managed.id)) {
			ctx.logger.warn('provider: provider "%s" is already routed by another adapter; skipping registration', managed.id);
			continue;
		}
		try {
			const adapter = buildOAuthAdapter(managed.build(), managed.name, activeStore);
			ctx.llm.registerAdapter([managed.id], adapter);
			registered += 1;
		} catch (error) {
			ctx.logger.warn('provider: failed to register provider "%s": %s', managed.id, String(error));
		}
	}
	return registered;
}
