//#region src/invariant.ts
/**
* Minimal invariant and error vocabulary for provider.
* @module @tsuuanmi/provider/invariant
*/
/** Fail loudly if a locally closed union gains an unhandled member. */
function assertNever(value) {
	throw new TypeError(`unknown provider value: ${String(value)}`);
}
/** An expected account-management failure reported to the account UI. */
var AccountError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "AccountError";
		this.code = code;
	}
};
//#endregion
export { AccountError, assertNever };
