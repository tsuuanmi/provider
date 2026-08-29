import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore, ActiveCredentialStore } from "../src/account-store.ts";
import { AccountError } from "../src/invariant.ts";
import { CodeRegistry } from "../src/login.ts";

let dirs: string[] = [];

async function makeStore(): Promise<AccountStore> {
	const dir = await mkdtemp(join(tmpdir(), "provider-"));
	dirs.push(dir);
	return new AccountStore(join(dir, "accounts.json"));
}

afterEach(async () => {
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
	dirs = [];
});

const oauth = { type: "oauth" as const, access: "acc", refresh: "ref", expires: Date.now() + 60_000 };
const apiKey = { type: "api_key" as const, key: "sk-abc" };

describe("AccountStore", () => {
	it("adds, lists, and switches active accounts", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", oauth);
		await store.addAccount("openai-codex", "a2", oauth);
		await store.setActive("openai-codex", "a1");

		const accounts = await store.listAccounts("openai-codex");
		expect(accounts).toHaveLength(2);
		expect(await store.getActive("openai-codex")).toBe("a1");

		await store.setActive("openai-codex", "a2");
		expect(await store.getActive("openai-codex")).toBe("a2");
	});

	it("persists across instances", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", oauth);
		await store.setActive("openai-codex", "a1");

		const reload = new AccountStore(store.filename);
		expect(await reload.getActive("openai-codex")).toBe("a1");
		expect(await reload.listProviders()).toEqual(["openai-codex"]);
	});

	it("rejects duplicate accounts and clears active on removal", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", oauth);
		await store.addAccount("openai-codex", "a2", oauth);
		await store.setActive("openai-codex", "a1");
		await expect(store.addAccount("openai-codex", "a1", oauth)).rejects.toMatchObject({ code: "DUPLICATE_ACCOUNT" });

		// Removing a non-active account leaves the active marker untouched.
		expect(await store.removeAccount("openai-codex", "a2")).toBe(false);
		expect(await store.getActive("openai-codex")).toBe("a1");
		expect(await store.hasAccount("openai-codex", "a2")).toBe(false);

		// Removing the active account clears the marker and reports it.
		expect(await store.removeAccount("openai-codex", "a1")).toBe(true);
		expect(await store.getActive("openai-codex")).toBe(undefined);
		expect(await store.listProviders()).toEqual([]);
	});

	it("rejects removing an unknown account", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", oauth);
		await expect(store.removeAccount("openai-codex", "missing")).rejects.toMatchObject({ code: "UNKNOWN_ACCOUNT" });
	});

	it("fails loud on a corrupt document", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", oauth);
		await import("node:fs/promises").then(({ writeFile }) =>
			writeFile(store.filename, "{not json"),
		);
		await expect(store.listAccounts("openai-codex")).rejects.toMatchObject({ code: "STORAGE" });
	});

	it("ActiveCredentialStore serves the active account and a target account", async () => {
		const store = await makeStore();
		await store.addAccount("openai-codex", "a1", apiKey);
		await store.addAccount("openai-codex", "a2", apiKey);
		await store.setActive("openai-codex", "a1");

		const active = new ActiveCredentialStore(store);
		expect((await active.read("openai-codex"))?.type).toBe("api_key");
		expect((await active.list()).map((i) => i.providerId)).toEqual(["openai-codex"]);

		// A target account lets login persist elsewhere without touching active.
		const targeted = new ActiveCredentialStore(store, { providerId: "openai-codex", accountId: "a2" });
		await targeted.modify("openai-codex", async () => ({ type: "api_key" as const, key: "sk-new" }));
		expect((await store.getCredential("openai-codex", "a2"))?.key).toBe("sk-new");
		expect(await store.getActive("openai-codex")).toBe("a1");
	});
});

describe("CodeRegistry", () => {
	it("parks a manual-code login and completes it", async () => {
		const registry = new CodeRegistry();
		let resolved = false;
		const pending = new Promise<void>((resolve) => {
			registry.add({
				token: "tok-1",
				providerId: "openai-codex",
				accountId: "a1",
				resolve: (code) => {
					expect(code).toBe("the-code");
					resolve();
				},
				reject: () => {},
				done: Promise.resolve(oauth),
			});
			void registry.complete("tok-1", "the-code").then(() => (resolved = true));
		});
		await pending;
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(true);
	});

	it("rejects unknown or expired tokens", async () => {
		const registry = new CodeRegistry();
		await expect(registry.complete("nope", "x")).rejects.toMatchObject({ code: "NEEDS_CODE" });
	});
});
