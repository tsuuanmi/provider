/**
 * Add-account dialog: for api-key providers collects the key and adds
 * immediately; for OAuth providers drives the login (shows the URL, then either
 * polls until the account appears or finishes with a pasted redirect code).
 *
 * @module @tsuuanmi/dsh-account/client/AddAccountDialog
 */
import { useEffect, useMemo, useState } from "react";
import {
	type AccountListResult,
	type AccountRpc,
	type AddStartResult,
	type ProviderView,
	type RpcOutcome,
	unwrap,
} from "./api.ts";

type Tfn = (key: string, params?: Record<string, unknown>) => string;

export function AddAccountDialog({
	t,
	rpc,
	providers,
	onClose,
	onAdded,
}: {
	t: Tfn;
	rpc: AccountRpc;
	providers: ProviderView[];
	onClose: () => void;
	onAdded: () => void;
}) {
	const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
	const [accountId, setAccountId] = useState("");
	const [key, setKey] = useState("");
	const [code, setCode] = useState("");
	const [stage, setStage] = useState<"form" | "oauth" | "done">("form");
	const [url, setUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const [token, setToken] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);
	const isOAuth = provider?.oauth === true;

	// While in the oauth stage, poll for the account appearing so an auto
	// completed browser login closes the dialog on its own.
	useEffect(() => {
		if (stage !== "oauth" || !providerId) return;
		const timer = setInterval(async () => {
			try {
				const list = unwrap((await rpc.call("list")) as RpcOutcome<AccountListResult>);
				const found = list.providers
					.find((p) => p.id === providerId)
					?.accounts.some((a) => a.accountId === accountId);
				if (found) {
					setStage("done");
					onAdded();
				}
			} catch {
				/* keep polling */
			}
		}, 2000);
		return () => clearInterval(timer);
	}, [stage, providerId, accountId, rpc, onAdded]);

	const submit = async () => {
		if (!accountId.trim()) {
			setError(t("dialog.add.accountName"));
			return;
		}
		if (!isOAuth && !key.trim()) {
			setError(t("dialog.add.apiKey"));
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const result = await rpc.call<AddStartResult>("add-start", {
				providerId,
				accountId: accountId.trim(),
				...(isOAuth ? {} : { key: key.trim() }),
			});
			const value = unwrap(result);
			if (value.kind === "added") {
				setStage("done");
				onAdded();
				return;
			}
			setUrl(value.url);
			setCopied(false);
			setToken(value.token);
			setStage("oauth");
		} catch (err) {
			setError(t("error.operation", { message: err instanceof Error ? err.message : String(err) }));
		} finally {
			setBusy(false);
		}
	};

	const copyUrl = async () => {
		if (!url) return;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(url);
			} else {
				const textarea = document.createElement("textarea");
				textarea.value = url;
				textarea.style.position = "fixed";
				textarea.style.opacity = "0";
				document.body.appendChild(textarea);
				textarea.focus();
				textarea.select();
				document.execCommand("copy");
				textarea.remove();
			}
			setCopied(true);
		} catch (err) {
			setError(t("error.operation", { message: err instanceof Error ? err.message : String(err) }));
		}
	};

	const finishCode = async () => {
		if (!token || !code.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await unwrap(await rpc.call("add-complete", { token, code: code.trim() }));
			setStage("done");
			onAdded();
		} catch (err) {
			setError(t("error.operation", { message: err instanceof Error ? err.message : String(err) }));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="acct-overlay" onClick={onClose}>
			<div className="acct-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
				{stage === "form" && (
					<>
						<div className="acct-dialogTitle">{t("dialog.add.title")}</div>
						<div className="acct-field">
							<label className="acct-fieldLabel" htmlFor="acct-provider">
								{t("dialog.add.provider")}
							</label>
							<select
								id="acct-provider"
								className="acct-select"
								value={providerId}
								onChange={(e) => setProviderId(e.target.value)}
							>
								{providers.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>
						<div className="acct-field">
							<label className="acct-fieldLabel" htmlFor="acct-name">
								{t("dialog.add.accountName")}
							</label>
							<input
								id="acct-name"
								className="acct-input"
								value={accountId}
								placeholder={t("dialog.add.accountNamePlaceholder")}
								onChange={(e) => setAccountId(e.target.value)}
							/>
						</div>
						{!isOAuth && (
							<div className="acct-field">
								<label className="acct-fieldLabel" htmlFor="acct-key">
									{t("dialog.add.apiKey")}
								</label>
								<input
									id="acct-key"
									className="acct-input"
									type="password"
									value={key}
									placeholder={t("dialog.add.apiKeyPlaceholder")}
									onChange={(e) => setKey(e.target.value)}
								/>
							</div>
						)}
						{error !== null && <div className="acct-errText">{error}</div>}
						<div className="acct-actions">
							<button type="button" className="acct-btn" onClick={onClose} disabled={busy}>
								{t("action.cancel")}
							</button>
							<button type="button" className="acct-btn acct-btnPrimary" onClick={submit} disabled={busy}>
								{busy ? t("dialog.add.starting") : t("dialog.add.submit")}
							</button>
						</div>
					</>
				)}
				{stage === "oauth" && (
					<>
						<div className="acct-dialogTitle">{t("dialog.add.title")}</div>
						<div className="acct-hint">{t("dialog.add.openUrl")}</div>
						<div className="acct-urlRow">
							{/^https?:\/\//i.test(url) ? (
								<a className="acct-url" href={url} target="_blank" rel="noopener noreferrer">
									{url}
								</a>
							) : (
								<span className="acct-url">{url}</span>
							)}
							<button type="button" className="acct-btn acct-copyBtn" onClick={copyUrl}>
								{copied ? t("action.copied") : t("action.copy")}
							</button>
						</div>
						<div className="acct-hint">{t("dialog.add.completeBrowser")}</div>
						<div className="acct-field">
							<label className="acct-fieldLabel" htmlFor="acct-code">
								{t("dialog.add.pasteCode")}
							</label>
							<input
								id="acct-code"
								className="acct-input"
								value={code}
								placeholder={t("dialog.add.codePlaceholder")}
								onChange={(e) => setCode(e.target.value)}
							/>
						</div>
						{error !== null && <div className="acct-errText">{error}</div>}
						<div className="acct-actions">
							<button type="button" className="acct-btn" onClick={onClose} disabled={busy}>
								{t("action.close")}
							</button>
							<button type="button" className="acct-btn acct-btnPrimary" onClick={finishCode} disabled={busy}>
								{busy ? t("dialog.add.waiting") : t("dialog.add.finish")}
							</button>
						</div>
					</>
				)}
				{stage === "done" && (
					<div className="acct-dialogTitle">{t("dialog.add.finish")}</div>
				)}
			</div>
		</div>
	);
}
