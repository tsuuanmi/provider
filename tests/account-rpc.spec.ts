/**
 * Unit tests for the `dsh-account/*` RPC handlers. A fake host context captures
 * the `/api` interceptor; the OAuth start path (network) is exercised
 * separately and is out of scope here. The api-key add, switch, remove, list,
 * and error-folding paths are covered against a temp account store.
 */
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { AccountStore } from "../src/account-store.ts";
import { registerAccountRpc, type AccountListResult } from "../src/account-rpc.ts";
import { CodeRegistry } from "../src/login.ts";

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<{ ok: boolean; [k: string]: unknown }>;

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function makeHarness() {
	const dir = join(tmpdir(), `dsh-account-rpc-${Math.random().toString(36).slice(2)}`);
	dirs.push(dir);
	const store = new AccountStore(join(dir, "accounts.json"));
	const registry = new CodeRegistry();
	let captured: RpcHandler | undefined;
	const credentialsSet = vi.fn();
	const ctx = {
		settings: {
			get: () => ({
				providers: {
					"profile-key": { displayName: "Profile Key", apiKeyEnv: "PROFILE_KEY" },
				},
			}),
		},
		credentials: { set: credentialsSet },
		connection: {
			rpc: {
				handle: (_channel: string, handler: RpcHandler) => {
					captured = handler;
					return async () => {};
				},
			},
		},
		logger: { warn: () => {} },
	} as unknown as Context;
	registerAccountRpc(ctx, store, registry);
	if (!captured) throw new Error("rpc handler not captured");
	return { store, ctx, handler: captured, credentialsSet };
}

describe("account RPC", () => {
	it("lists providers and active accounts", async () => {
		const { store, handler } = makeHarness();
		await store.addAccount("openai-codex", "a1", { type: "api_key", key: "k" });
		await store.setActive("openai-codex", "a1");

		const result = (await handler("list", {}, new AbortController().signal)) as {
			ok: true;
			value: AccountListResult;
		};
		expect(result.ok).toBe(true);
		const providers = result.value.providers;
		const codex = providers.find((p) => p.id === "openai-codex");
		expect(codex).toBeDefined();
		expect(codex!.kind).toBe("oauth");
		expect(codex!.accounts).toEqual([{ accountId: "a1", type: "api_key", active: true }]);
		const profile = providers.find((p) => p.id === "profile-key");
		expect(profile!.kind).toBe("profile");
	});

	it("switches the active account and rewrites the credential slot for a profile provider", async () => {
		const { store, handler, credentialsSet } = makeHarness();
		await store.addAccount("profile-key", "one", { type: "api_key", key: "KEY1" });
		await store.addAccount("profile-key", "two", { type: "api_key", key: "KEY2" });

		const result = await handler("switch", { providerId: "profile-key", accountId: "two" }, new AbortController().signal);
		expect(result.ok).toBe(true);
		expect(await store.getActive("profile-key")).toBe("two");
		expect(credentialsSet).toHaveBeenCalled();
	});

	it("folds an unknown account into an ok:false result instead of throwing", async () => {
		const { store, handler } = makeHarness();
		await store.addAccount("openai-codex", "a1", { type: "api_key", key: "k" });
		const result = (await handler(
			"switch",
			{ providerId: "openai-codex", accountId: "missing" },
			new AbortController().signal,
		)) as { ok: false; error: { code: string; message: string } };
		expect(result.ok).toBe(false);
		expect(result.error.code).toBe("internal");
		expect(result.error.message).toContain("missing");
	});

	it("adds an api-key account and activates it when it is the first", async () => {
		const { store, handler } = makeHarness();
		const result = (await handler(
			"add-start",
			{ providerId: "profile-key", accountId: "new1", key: "k3" },
			new AbortController().signal,
		)) as { ok: true; value: { kind: "added" } };
		expect(result.ok).toBe(true);
		expect(result.value.kind).toBe("added");
		expect(await store.getActive("profile-key")).toBe("new1");
	});

	it("removes a non-active account but refuses the active one", async () => {
		const { store, handler } = makeHarness();
		await store.addAccount("openai-codex", "a1", { type: "api_key", key: "k" });
		await store.addAccount("openai-codex", "a2", { type: "api_key", key: "k2" });
		await store.setActive("openai-codex", "a1");

		const ok = (await handler(
			"remove",
			{ providerId: "openai-codex", accountId: "a2" },
			new AbortController().signal,
		)) as { ok: true };
		expect(ok.ok).toBe(true);
		expect(await store.hasAccount("openai-codex", "a2")).toBe(false);

		const refused = (await handler(
			"remove",
			{ providerId: "openai-codex", accountId: "a1" },
			new AbortController().signal,
		)) as { ok: false; error: { message: string } };
		expect(refused.ok).toBe(false);
		expect(refused.error.message).toMatch(/active/i);
	});

	it("add-complete rejects an unknown token as a folded error", async () => {
		const { handler } = makeHarness();
		const result = (await handler(
			"add-complete",
			{ token: "nope", code: "x" },
			new AbortController().signal,
		)) as { ok: false; error: { message: string } };
		expect(result.ok).toBe(false);
		expect(result.error.message).toMatch(/no pending login/i);
	});
});
