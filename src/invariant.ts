/**
 * Minimal invariant and error vocabulary for dsh-account.
 * @module @tsuuanmi/dsh-account/invariant
 */

/** Fail loudly if a locally closed union gains an unhandled member. */
export function assertNever(value: never): never {
	throw new TypeError(`unknown dsh-account value: ${String(value)}`);
}

/** Stable error codes surfaced by the plugin to the account UI/RPC. */
export type AccountErrorCode =
	| "UNKNOWN_PROVIDER"
	| "UNKNOWN_ACCOUNT"
	| "DUPLICATE_ACCOUNT"
	| "ACTIVE_ACCOUNT"
	| "NO_OAUTH"
	| "NO_API_KEY"
	| "STORAGE"
	| "CANCELED"
	| "LOGIN_FAILED"
	| "NEEDS_KEY"
	| "NEEDS_CODE";

/** An expected account-management failure reported to the account UI. */
export class AccountError extends Error {
	readonly code: AccountErrorCode;

	constructor(code: AccountErrorCode, message: string) {
		super(message);
		this.name = "AccountError";
		this.code = code;
	}
}
