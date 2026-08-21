/**
 * OAuth interaction for the account-management GUI.
 *
 * An interactive multi-step OAuth flow is driven as a state machine:
 * - `notify()` events (auth URL, device code) are collected and exposed.
 * - Providers that complete in-browser without further input complete directly.
 * - Providers that require pasting a code back (`manual_code`, e.g. OpenAI
 *   Codex) are parked in a {@link CodeRegistry}; the GUI completes the pending
 *   prompt so the login resumes and persists.
 *
 * Reuses pi-ai's `Models.login` and its `AuthInteraction` contract.
 *
 * @module @tsuuanmi/provider/login
 */
import { createModels } from "@earendil-works/pi-ai";
import type { AuthEvent, AuthInteraction, AuthPrompt, Credential, Provider } from "@earendil-works/pi-ai";
import { AccountStore, ActiveCredentialStore } from "./account-store.ts";
import { AccountError } from "./invariant.ts";

/** How long a parked manual-code login may wait before it must be reissued. */
const PENDING_CODE_TTL_MS = 10 * 60 * 1000;

/** Control handle for one in-flight OAuth login. */
export interface LoginController {
	/** Resolves when the login completes and the credential is persisted. */
	done: Promise<Credential>;
	/** The first rendered `notify` event (auth URL / device code / progress). */
	firstEvent: Promise<AuthEvent>;
	/** Every `notify` event seen so far. */
	events: readonly AuthEvent[];
	/** Cancel the login (aborts the interaction and rejects `done`). */
	abort(reason?: string): void;
}

/** A parked manual-code login awaiting the GUI's pasted code. */
export interface PendingLogin {
	/** The token associated with the GUI's pending code entry. */
	token: string;
	providerId: string;
	accountId: string;
	/** Completes the pending `manual_code` prompt with the pasted code. */
	resolve: (code: string) => void;
	reject: (error: Error) => void;
	/** The in-flight login; resolves with the credential once it completes. */
	done: Promise<Credential>;
}

/** A parked login plus its expiry; internal to the registry. */
interface StoredPending extends PendingLogin {
	expires: number;
}

/** Registry of parked manual-code logins, keyed by token. */
export class CodeRegistry {
	private readonly pending = new Map<string, StoredPending>();

	/** Complete a parked login with the pasted code. */
	async complete(token: string, code: string): Promise<Credential> {
		const pending = this.pending.get(token);
		if (!pending) {
			throw new AccountError(
				"NEEDS_CODE",
				`No pending login for token "${token}"; it may have expired. Start the add-account flow again.`,
			);
		}
		if (Date.now() > pending.expires) {
			this.pending.delete(token);
			pending.reject(new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`));
			throw new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`);
		}
		this.pending.delete(token);
		pending.resolve(code);
		return pending.done;
	}

	/** Park a login that needs a pasted code, keyed by its pre-issued token. */
	add(entry: PendingLogin): void {
		this.pending.set(entry.token, { ...entry, expires: Date.now() + PENDING_CODE_TTL_MS });
	}

	/** Reap expired pending logins (never throws). */
	reap(): void {
		const now = Date.now();
		for (const [token, pending] of this.pending) {
			if (now > pending.expires) {
				this.pending.delete(token);
				pending.reject(new AccountError("NEEDS_CODE", `Login token "${token}" expired. Start the add-account flow again.`));
			}
		}
	}
}

function defer<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Render an auth event (URL / device code / progress) as fallback text. */
export function renderAuthEvent(event: AuthEvent): string {
	switch (event.type) {
		case "auth_url":
			return event.instructions ? `${event.url}\n${event.instructions}` : event.url;
		case "device_code":
			return `Go to ${event.verificationUri} and enter code: ${event.userCode}`;
		case "progress":
			return event.message;
		case "info":
			return event.message;
	}
}

/** Return the raw URL for a browser OAuth dialog; keep text rendering for other events. */
export function authUrlFromEvent(event: AuthEvent): string {
	return event.type === "auth_url" ? event.url : renderAuthEvent(event);
}

/**
 * Start an OAuth login for one named account. Use {@link waitForLoginEvent} to
 * expose the auth URL/device code promptly, then drive completion through
 * the `done` promise and the manual-code registry.
 */
export function startOAuthLogin(options: {
	providerId: string;
	accountId: string;
	buildProvider: () => Provider;
	store: AccountStore;
	registry: CodeRegistry;
	/** Pre-issued token a manual-code prompt will park under. */
	token: string;
}): LoginController {
	const { providerId, accountId, buildProvider, store, registry, token } = options;
	const abortController = new AbortController();
	const events: AuthEvent[] = [];
	const firstEvent = defer<AuthEvent>();
	let firstEventResolved = false;
	let loginDone: Promise<Credential>;

	const interaction: AuthInteraction = {
		signal: abortController.signal,
		notify: (event) => {
			events.push(event);
			if (!firstEventResolved) {
				firstEventResolved = true;
				firstEvent.resolve(event);
			}
		},
		prompt: async (prompt: AuthPrompt) => {
			switch (prompt.type) {
				case "manual_code": {
					const codeDone = defer<string>();
					registry.add({
						providerId,
						accountId,
						resolve: codeDone.resolve,
						reject: codeDone.reject,
						done: loginDone,
						token,
					});
					return codeDone.promise;
				}
				case "select": {
					return prompt.options[0]?.id ?? "";
				}
				case "text":
				case "secret":
					throw new AccountError(
						"NEEDS_KEY",
						`Provider "${providerId}" requested interactive ${prompt.type} input, which the account GUI cannot collect.`,
					);
			}
		},
	};

	const models = createModels({
		credentials: new ActiveCredentialStore(store, { providerId, accountId }),
	});
	models.setProvider(buildProvider());

	loginDone = models.login(providerId, "oauth", interaction).catch((error) => {
		if (abortController.signal.aborted) throw new AccountError("CANCELED", "Login cancelled.");
		throw error;
	});

	return {
		done: loginDone,
		firstEvent: firstEvent.promise,
		events,
		abort: (reason?: string) => {
			abortController.abort(reason);
		},
	};
}

/**
 * Wait for the first auth event with a deadline, so the GUI receives a login
 * instruction promptly instead of blocking on completion.
 */
export async function waitForLoginEvent(handle: LoginController, timeoutMs = 10_000): Promise<AuthEvent> {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new AccountError("LOGIN_FAILED", "Timed out waiting for a login URL.")), timeoutMs);
	});
	return Promise.race([handle.firstEvent, timeout]);
}
