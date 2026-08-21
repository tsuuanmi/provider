/**
 * dsh-account browser half (client cordis plugin).
 *
 * Mounts the account dropdown into the composer tool row
 * (`conversation.input.right`, right of the model seat). All data and mutations
 * travel over the generic `/api` RPC channel to the host half's `dsh-account/*`
 * endpoints.
 *
 * Services are read through the runtime's `ctx.get(...)` (string-keyed) rather
 * than the host/native-typed `Context` augmentations, which are host-biased on
 * this build; the interfaces below are the browser faces this plugin consumes.
 *
 * @module @tsuuanmi/dsh-account/client
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { RpcOutcome } from "./api.ts";
import { AccountSelect } from "./AccountSelect.tsx";
import { en, NS, zh } from "./locales.ts";

interface LocaleFace {
	register(namespace: string, dict: Record<string, unknown>): void;
}
interface SlotsFace {
	inject(slot: string, callback: () => () => void): void;
	register(
		options: {
			name: string;
			id: string;
			order: number;
			locale: string;
			inject: () => Record<string, unknown>;
		},
		component: unknown,
	): () => void;
}
interface ConnectionFace {
	rpc: { call(channel: string, endpoint: string, payload?: unknown): Promise<unknown> };
}

export const inject = ["connection", "locale", "slots"];

export function apply(ctx: ClientContext): void {
	const get = (ctx as unknown as { get: (name: string) => unknown }).get;
	const locale = get("locale") as LocaleFace;
	const slots = get("slots") as SlotsFace;
	const connection = get("connection") as ConnectionFace;
	const call = <T = unknown>(endpoint: string, payload?: unknown): Promise<RpcOutcome<T>> =>
		connection.rpc.call("/dsh-account", endpoint, payload === undefined ? {} : payload) as Promise<RpcOutcome<T>>;

	locale.register(NS, { zh, en });
	slots.inject(
		"conversation.input.right",
		() =>
			slots.register(
				{
					name: "conversation.input.right",
					id: "dsh-account",
					order: 90,
					locale: NS,
					inject: () => ({ call }),
				},
				AccountSelect,
			),
	);
}
