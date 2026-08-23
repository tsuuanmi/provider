/**
 * Plugin entry-point regression coverage. Codex routing belongs to
 * dsh-codex-subscription, so provider must initialize without the DSH LLM
 * service and must not require or register an openai-codex adapter.
 */
import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import { apply, inject } from "../src/index.ts";

describe("provider plugin entry point", () => {
	it("initializes without the llm service", () => {
		expect(inject).toEqual(["connection", "credentials", "settings"]);
		const ctx = {
			connection: {
				rpc: {
					handle: () => async () => {},
				},
			},
		} as unknown as Context;

		const dispose = apply(ctx);
		expect(dispose).toBeTypeOf("function");
		dispose();
	});
});
