/**
 * Unit tests for the `dsh-codex-subscription` vault synchronization. A fake
 * records-capable `ctx.credentials` stands in for the DSH credential record
 * seam; assertions target the vault payload shape the Codex plugin validates
 * on every read (grant record, versioned payload, non-empty accounts, and an
 * active id that names one of them).
 */
import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { Credential } from "@earendil-works/pi-ai";
import {
	removeCodexSubscriptionAccount,
	syncCodexSubscriptionAccount,
} from "../src/codex-subscription.ts";

interface GrantRecord {
	kind: "grant";
	payload: unknown;
}

const VAULT_KEY = "codex-subscription/accounts";

function oauth(overrides: Partial<Record<string, unknown>> = {}): Credential {
	return {
		type: "oauth",
		access: "access-a",
		refresh: "refresh-a",
		expires: 2_000_000_000_000,
		accountId: "chatgpt-account-a",
		...overrides,
	} as Credential;
}

function makeHarness(records?: Record<string, GrantRecord>) {
	const store = records ?? {};
	const credentials = {
		set: vi.fn(),
		unset: vi.fn(),
		readRecord: (key: string) => Promise.resolve(store[key]),
		modifyRecord: (
			key: string,
			mutate: (current: GrantRecord | undefined) => Promise<GrantRecord | undefined>,
		) =>
			(async () => {
				const next = await mutate(store[key]);
				if (next !== undefined) store[key] = next;
				return next;
			})(),
		deleteRecord: (key: string) => {
			delete store[key];
			return Promise.resolve();
		},
	};
	const warn = vi.fn();
	const ctx = { credentials, logger: { warn } } as unknown as Context;
	return { store, credentials, warn, ctx };
}

interface VaultAccountView {
	id: string;
	label: string;
	credential: Record<string, unknown>;
}

interface VaultView {
	activeId: string;
	legacyAccountId?: string;
	accounts: VaultAccountView[];
	account(index: number): VaultAccountView;
}

function vaultOf(store: Record<string, GrantRecord>): VaultView {
	const record = store[VAULT_KEY];
	if (record === undefined) throw new Error("vault record missing");
	const payload = record.payload as {
		activeId: string;
		legacyAccountId?: string;
		accounts: VaultAccountView[];
	};
	return {
		...payload,
		account(index: number): VaultAccountView {
			const account = payload.accounts[index];
			if (account === undefined) throw new Error(`vault account ${index} missing`);
			return account;
		},
	};
}

describe("syncCodexSubscriptionAccount", () => {
	it("seeds a vault holding the account when no record exists yet", async () => {
		const { store, ctx } = makeHarness();
		await syncCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(1);
		expect(vault.account(0).label).toBe("codex-a");
		expect(vault.account(0).credential.access).toBe("access-a");
		expect(vault.activeId).toBe(vault.account(0).id);
		expect(vault.legacyAccountId).toBe(vault.account(0).id);
	});

	it("selects the exactly matching vault account without touching its stored credential", async () => {
		const rotated = oauth({ access: "access-a-rotated", expires: 2_100_000_000_000 });
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [
						{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> },
						{ id: "vault-2", label: "Account 2", credential: oauth({ access: "access-b", refresh: "refresh-b", accountId: "chatgpt-account-b" }) as Record<string, unknown> },
					],
				},
			},
		});
		await syncCodexSubscriptionAccount(ctx, rotated, "codex-a");
		const vault = vaultOf(store);
		expect(vault.activeId).toBe(vault.account(0).id);
		expect(vault.accounts).toHaveLength(2);
		expect(vault.account(0).credential.access).toBe("access-a"); // stale copy kept, not overwritten
	});

	it("falls back to the ChatGPT account id when the vault copy holds a rotated token", async () => {
		const stale = oauth({ access: "access-a-old" });
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-2",
					accounts: [
						{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> },
						{ id: "vault-2", label: "Account 2", credential: oauth({ access: "access-b", refresh: "refresh-b", accountId: "chatgpt-account-b" }) as Record<string, unknown> },
					],
				},
			},
		});
		await syncCodexSubscriptionAccount(ctx, stale, "codex-a");
		const vault = vaultOf(store);
		expect(vault.activeId).toBe(vault.account(0).id);
		expect(vault.account(0).credential.access).toBe("access-a"); // fresh vault copy preserved
	});

	it("imports an unknown account into the vault and makes it active", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> }],
				},
			},
		});
		const fresh = oauth({ access: "access-c", refresh: "refresh-c", accountId: "chatgpt-account-c" });
		await syncCodexSubscriptionAccount(ctx, fresh, "codex-c");
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(2);
		const imported = vault.account(1);
		expect(imported.label).toBe("codex-c");
		expect(imported.credential.access).toBe("access-c");
		expect(vault.activeId).toBe(imported.id);
	});

	it("keeps separately named credentials sharing one ChatGPT account id", async () => {
		const { store, ctx } = makeHarness();
		const educationOne = oauth({ access: "education-one", refresh: "education-one-refresh", accountId: "shared-education" });
		const educationTwo = oauth({ access: "education-two", refresh: "education-two-refresh", accountId: "shared-education" });

		await syncCodexSubscriptionAccount(ctx, educationOne, "chatgpt-education-1");
		await syncCodexSubscriptionAccount(ctx, educationTwo, "chatgpt-education-2");
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(2);
		expect(vault.accounts.map((account) => account.label)).toEqual(["chatgpt-education-1", "chatgpt-education-2"]);
		expect(vault.account(1).credential.access).toBe("education-two");
		expect(vault.activeId).toBe(vault.account(1).id);

		await syncCodexSubscriptionAccount(
			ctx,
			oauth({ access: "education-one-rotated", refresh: "education-one-refresh-rotated", accountId: "shared-education" }),
			"chatgpt-education-1",
		);
		const afterRotation = vaultOf(store);
		expect(afterRotation.accounts).toHaveLength(2);
		expect(afterRotation.activeId).toBe(afterRotation.account(0).id);
		expect(afterRotation.account(0).credential.access).toBe("education-one");
	});

	it("does not rewrite a managed record when the matching account is already active", async () => {
		const { store, ctx } = makeHarness();
		await syncCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		const before = JSON.stringify(store[VAULT_KEY]);
		await syncCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		expect(JSON.stringify(store[VAULT_KEY])).toBe(before);
	});

	it("clamps an imported label to the Codex plugin's bounds", async () => {
		const { store, ctx } = makeHarness();
		await syncCodexSubscriptionAccount(ctx, oauth(), "  x".repeat(30));
		const vault = vaultOf(store);
		expect(vault.account(0).label).toHaveLength(48);
		expect(vault.account(0).label.startsWith("x")).toBe(true);
	});

	it("leaves an unsupported vault version untouched and warns", async () => {
		const record: GrantRecord = {
			kind: "grant",
			payload: { version: 2, activeId: "x", accounts: [{ id: "x", label: "A", credential: oauth() }] },
		};
		const { store, warn, ctx } = makeHarness({ [VAULT_KEY]: record });
		await syncCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		expect(store[VAULT_KEY]).toBe(record);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("leaves a malformed vault record untouched and warns", async () => {
		const record: GrantRecord = { kind: "grant", payload: { version: 1, activeId: "ghost" } };
		const { store, warn, ctx } = makeHarness({ [VAULT_KEY]: record });
		await syncCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		expect(store[VAULT_KEY]).toBe(record);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("is a no-op when the credentials service has no records API", async () => {
		const warn = vi.fn();
		const ctx = { credentials: { set: vi.fn(), unset: vi.fn() }, logger: { warn } } as unknown as Context;
		await expect(syncCodexSubscriptionAccount(ctx, oauth(), "codex-a")).resolves.toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});

	it("is a no-op for a non-oauth credential", async () => {
		const { store, ctx } = makeHarness();
		await syncCodexSubscriptionAccount(ctx, { type: "api_key", key: "k" }, "codex-a");
		expect(store[VAULT_KEY]).toBeUndefined();
	});
});

describe("removeCodexSubscriptionAccount", () => {
	it("removes the matching account and promotes the first remaining one when it was active", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					legacyAccountId: "vault-1",
					accounts: [
						{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> },
						{ id: "vault-2", label: "Account 2", credential: oauth({ access: "access-b", refresh: "refresh-b", accountId: "chatgpt-account-b" }) as Record<string, unknown> },
					],
				},
			},
		});
		await removeCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(1);
		expect(vault.account(0).id).toBe("vault-2");
		expect(vault.activeId).toBe("vault-2");
		expect(vault.legacyAccountId).toBeUndefined();
	});

	it("removes a non-active matching account without disturbing the active one", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [
						{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> },
						{ id: "vault-2", label: "Account 2", credential: oauth({ access: "access-b", refresh: "refresh-b", accountId: "chatgpt-account-b" }) as Record<string, unknown> },
					],
				},
			},
		});
		await removeCodexSubscriptionAccount(
			ctx,
			oauth({ access: "access-b", refresh: "refresh-b", accountId: "chatgpt-account-b" }),
			"codex-b",
		);
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(1);
		expect(vault.activeId).toBe("vault-1");
	});

	it("deletes the whole record when the removed account was the last one", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> }],
				},
			},
		});
		await removeCodexSubscriptionAccount(ctx, oauth(), "codex-a");
		expect(store[VAULT_KEY]).toBeUndefined();
	});

	it("removes only the named account when two credentials share a ChatGPT account id", async () => {
		const first = oauth({ access: "education-one", refresh: "education-one-refresh", accountId: "shared-education" });
		const second = oauth({ access: "education-two", refresh: "education-two-refresh", accountId: "shared-education" });
		const { store, ctx } = makeHarness();
		await syncCodexSubscriptionAccount(ctx, first, "chatgpt-education-1");
		await syncCodexSubscriptionAccount(ctx, second, "chatgpt-education-2");

		await removeCodexSubscriptionAccount(ctx, second, "chatgpt-education-2");
		const vault = vaultOf(store);
		expect(vault.accounts).toHaveLength(1);
		expect(vault.account(0).label).toBe("chatgpt-education-1");
	});

	it("matches by ChatGPT account id when the vault copy was rotated", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [
						{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> },
					],
				},
			},
		});
		await removeCodexSubscriptionAccount(ctx, oauth({ access: "access-a-stale-copy" }), "Account 1");
		expect(store[VAULT_KEY]).toBeUndefined();
	});

	it("is a no-op when no account matches and when no record exists", async () => {
		const { store, ctx } = makeHarness({
			[VAULT_KEY]: {
				kind: "grant",
				payload: {
					version: 1,
					activeId: "vault-1",
					accounts: [{ id: "vault-1", label: "Account 1", credential: oauth() as Record<string, unknown> }],
				},
			},
		});
		await removeCodexSubscriptionAccount(
			ctx,
			oauth({ access: "access-z", refresh: "refresh-z", accountId: "chatgpt-account-z" }),
			"codex-z",
		);
		expect(vaultOf(store).accounts).toHaveLength(1);

		const empty = makeHarness();
		await expect(removeCodexSubscriptionAccount(empty.ctx, oauth(), "codex-a")).resolves.toBeUndefined();
		expect(empty.store[VAULT_KEY]).toBeUndefined();
	});

	it("is a no-op when the credentials service has no records API", async () => {
		const ctx = { credentials: { set: vi.fn(), unset: vi.fn() }, logger: { warn: vi.fn() } } as unknown as Context;
		await expect(removeCodexSubscriptionAccount(ctx, oauth(), "codex-a")).resolves.toBeUndefined();
	});
});