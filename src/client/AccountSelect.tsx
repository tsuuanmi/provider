/**
 * AccountSelect: the composer's account dropdown (conversation.input.right seat),
 * mirroring the model dropdown's trigger + menu pattern. Lists accounts grouped
 * by provider with the active one checked; one click switches the active
 * account. "Add account" opens the add dialog; each account row has a remove
 * action. Reads/writes through the `dsh-account/*` RPC endpoints.
 *
 * @module @tsuuanmi/dsh-account/client/AccountSelect
 */
import { useEffect, useRef, useState } from "react";
import { type AccountListResult, type AccountRpc, type ProviderView, type RpcOutcome, unwrap } from "./api.ts";
import { injectAccountStyles } from "./styles.ts";
import { AddAccountDialog } from "./AddAccountDialog.tsx";

type Tfn = (key: string, params?: Record<string, unknown>) => string;

export interface AccountSelectProps {
	/** RPC face injected by the slot registrar. */
	call: AccountRpc["call"];
	/** Locale bound to the `account` namespace. */
	t: Tfn;
	/** Owner share (conversation.input.right) — unused by this control. */
	session?: unknown;
	input?: unknown;
}

function Chevron({ open }: { open: boolean }) {
	return (
		<svg
			className={`acct-chevron${open ? " acct-chevronOpen" : ""}`}
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
		>
			<path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M3 4h10M6 4V3h4v1M5 4l.5 8h5l.5-8"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PlusIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export function AccountSelect({ call, t }: AccountSelectProps) {
	injectAccountStyles();
	const [open, setOpen] = useState(false);
	const [providers, setProviders] = useState<ProviderView[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [addOpen, setAddOpen] = useState(false);
	const [remove, setRemove] = useState<{ providerId: string; accountId: string } | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const load = async () => {
		setLoading(true);
		setError(null);
		try {
			const list = unwrap((await call("list")) as RpcOutcome<AccountListResult>);
			setProviders(list.providers);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!open) return;
		load();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const closeOutside = (event: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", closeOutside);
		return () => document.removeEventListener("mousedown", closeOutside);
	}, [open]);

	const label = "Account";

	const switchAccount = async (providerId: string, accountId: string) => {
		setBusy(true);
		setError(null);
		try {
			await unwrap(await call("switch", { providerId, accountId }));
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const confirmRemove = async () => {
		if (!remove) return;
		setBusy(true);
		setError(null);
		try {
			await unwrap(await call("remove", remove));
			setRemove(null);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setRemove(null);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="acct-root" ref={rootRef}>
			<button
				ref={triggerRef}
				type="button"
				className="acct-trigger"
				aria-haspopup="menu"
				aria-expanded={open}
				title={label}
				onClick={() => (open ? setOpen(false) : setOpen(true))}
			>
				<span className="acct-triggerLabel">{label}</span>
				<Chevron open={open} />
			</button>

			{open && (
				<div className="acct-menu" role="menu" aria-label={t("menu.aria")}>
					{loading && <div className="acct-status">{t("status.loading")}</div>}
					{error !== null && <div className="acct-error">{t("error.operation", { message: error })}</div>}
					<div className="acct-groups">
						{!loading &&
							providers.map((provider) => (
								<section key={provider.id} className="acct-group" role="group" aria-label={provider.name}>
									<div className="acct-groupTitle">{provider.name}</div>
									{provider.accounts.length === 0 && <div className="acct-status">{t("empty.all")}</div>}
									{provider.accounts.map((account) => (
										<div key={account.accountId} className="acct-row">
											<button
												type="button"
												role="menuitemradio"
												aria-checked={account.active}
												className="acct-option"
												disabled={busy}
												title={account.accountId}
												onClick={() => switchAccount(provider.id, account.accountId)}
											>
												<span className="acct-optionCopy">
													<span className="acct-name">{account.accountId}</span>
												</span>
												{account.active && (
													<span className="acct-check">
														<CheckIcon />
													</span>
												)}
											</button>
											<button
												type="button"
												className="acct-removeBtn"
												aria-label={t("action.remove")}
												title={t("action.remove")}
												disabled={busy || account.active}
												onClick={() => setRemove({ providerId: provider.id, accountId: account.accountId })}
											>
												<TrashIcon />
											</button>
										</div>
									))}
								</section>
							))}
					</div>
					<div className="acct-footer">
						<button type="button" className="acct-addBtn" onClick={() => setAddOpen(true)}>
							<PlusIcon />
							{t("action.add")}
						</button>
					</div>
				</div>
			)}

			{addOpen && (
				<AddAccountDialog
					t={t}
					rpc={{ call }}
					providers={providers}
					onClose={() => setAddOpen(false)}
					onAdded={() => {
						setAddOpen(false);
						load();
					}}
				/>
			)}

			{remove !== null && (
				<div className="acct-overlay" onClick={() => setRemove(null)}>
					<div className="acct-dialog" role="alertdialog" onClick={(e) => e.stopPropagation()}>
						<div className="acct-dialogTitle">{t("dialog.remove.title")}</div>
						<div className="acct-hint">
							{t("dialog.remove.body", { provider: remove.providerId, account: remove.accountId })}
						</div>
						{error !== null && <div className="acct-errText">{error}</div>}
						<div className="acct-actions">
							<button type="button" className="acct-btn" onClick={() => setRemove(null)} disabled={busy}>
								{t("action.cancel")}
							</button>
							<button type="button" className="acct-btn acct-btnDanger" onClick={confirmRemove} disabled={busy}>
								{t("action.removeConfirm")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
