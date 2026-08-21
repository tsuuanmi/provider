/**
 * Client-side account API types + unwrap helper shared by the dropdown and
 * dialog components. Shapes mirror the server RPC results in `src/account-rpc.ts`.
 *
 * @module @tsuuanmi/provider/client/api
 */

/** Structural mirror of the generic RPC result (avoids a host-only import). */
export interface RpcResult<T> {
	ok: true;
	value: T;
}
export interface RpcErrorResult {
	ok: false;
	error: { code: string; message: string };
}
export type RpcOutcome<T> = RpcResult<T> | RpcErrorResult;

/** Unwrap a result or throw with the server's message. */
export function unwrap<T>(result: RpcOutcome<T>): T {
	if (result.ok) return result.value;
	throw new Error(result.error.message);
}

export interface AccountView {
	accountId: string;
	type: string;
	active: boolean;
}
export interface ProviderView {
	id: string;
	name: string;
	kind: string;
	oauth: boolean;
	accounts: AccountView[];
}
export interface AccountListResult {
	providers: ProviderView[];
}

export interface OAuthStartResult {
	kind: "oauth";
	url: string;
	token: string;
	providerId: string;
	accountId: string;
}
export interface AddedResult {
	kind: "added";
	providerId: string;
	accountId: string;
}
export type AddStartResult = OAuthStartResult | AddedResult;

/** The RPC face the dropdown receives through its slot inject. */
export interface AccountRpc {
	call: <T = unknown>(endpoint: string, payload?: unknown) => Promise<RpcOutcome<T>>;
}
