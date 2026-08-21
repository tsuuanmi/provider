//#region src/invariant.d.ts
/**
 * Minimal invariant and error vocabulary for provider.
 * @module @tsuuanmi/provider/invariant
 */
/** Fail loudly if a locally closed union gains an unhandled member. */
declare function assertNever(value: never): never;
/** Stable error codes surfaced by the plugin to the account UI/RPC. */
type AccountErrorCode = "UNKNOWN_PROVIDER" | "UNKNOWN_ACCOUNT" | "DUPLICATE_ACCOUNT" | "ACTIVE_ACCOUNT" | "NO_OAUTH" | "NO_API_KEY" | "STORAGE" | "CANCELED" | "LOGIN_FAILED" | "NEEDS_KEY" | "NEEDS_CODE";
/** An expected account-management failure reported to the account UI. */
declare class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message: string);
}
//#endregion
export { AccountError, AccountErrorCode, assertNever };