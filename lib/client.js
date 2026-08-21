window.__ModuleLoader__.load({
	id: "@tsuuanmi/provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/AccountSelect.tsx
var import_react2 = require("react");

// src/client/api.ts
function unwrap(result) {
  if (result.ok) return result.value;
  throw new Error(result.error.message);
}

// src/client/styles.ts
var CSS = `
.acct-root{min-width:0;position:relative}
.acct-trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}
.acct-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.acct-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.acct-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.acct-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.acct-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.acct-chevronOpen{transform:rotate(180deg)}
.acct-menu{z-index:30;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(260px,100vw - 32px);max-height:min(380px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}
.acct-status,.acct-empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}
.acct-error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}
.acct-groups{min-height:0;overflow-y:auto}
.acct-group+.acct-group{margin-top:4px}
.acct-groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);padding:5px 8px 3px;font-size:12px;font-weight:500;line-height:18px;position:sticky;top:0}
.acct-row{display:flex;align-items:center;gap:4px}
.acct-option{flex:1;min-width:0;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}
.acct-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.acct-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.acct-optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}
.acct-name{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}
.acct-check{color:var(--dsw-alias-label-primary);flex:0 0 18px;place-items:center;display:grid}
.acct-removeBtn{flex:none;color:var(--dsw-alias-label-caption);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:2px;display:grid;place-items:center}
.acct-removeBtn:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}
.acct-footer{border-top:1px solid var(--dsw-alias-border-divider);margin-top:4px;padding:4px}
.acct-addBtn{width:100%;height:32px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 8px;font-size:13px;font-weight:500;line-height:32px;display:flex}
.acct-addBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.acct-overlay{position:fixed;inset:0;z-index:40;background:var(--dsw-alias-overlay-bg,rgba(0,0,0,.4));align-items:center;justify-content:center;display:flex}
.acct-dialog{width:min(420px,calc(100vw - 32px));border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary);border-radius:16px;box-shadow:var(--dsw-shadow-lv3);padding:16px;flex-direction:column;gap:12px;display:flex}
.acct-dialogTitle{font-size:15px;font-weight:600;line-height:22px}
.acct-field{flex-direction:column;gap:6px;display:flex}
.acct-fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}
.acct-input{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:7px 9px;font-size:13px;line-height:20px}
.acct-input:focus{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.acct-select{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-field);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:7px 9px;font-size:13px;line-height:20px}
.acct-urlRow{align-items:flex-start;gap:8px;display:flex}
.acct-url{color:var(--dsw-alias-label-link,var(--dsw-alias-label-primary));text-decoration:underline;user-select:text;word-break:break-all;background:var(--dsw-alias-bg-field);border-radius:8px;padding:8px;font-size:12px;line-height:18px;flex:1;max-height:120px;overflow-y:auto}
.acct-url:hover{color:var(--dsw-alias-label-link-hover,var(--dsw-alias-label-primary))}
.acct-copyBtn{flex:none}
.acct-actions{justify-content:flex-end;align-items:center;gap:8px;display:flex}
.acct-btn{height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 14px;font-size:13px;font-weight:500;line-height:30px}
.acct-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.acct-btnPrimary{color:#fff;background:var(--dsw-alias-brand-bg,var(--dsw-alias-state-info-primary));border:1px solid transparent}
.acct-btnPrimary:hover{background:var(--dsw-alias-state-info-primary)}
.acct-btnDanger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-border-l2)}
.acct-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.acct-errText{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
`;
var TAG_ID = "@tsuuanmi/provider/account.module.css";
var injected = false;
function injectAccountStyles() {
  if (injected) return;
  injected = true;
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@tsuuanmi/provider";
  tag.dataset.pluginCss = TAG_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

// src/client/AddAccountDialog.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function AddAccountDialog({
  t,
  rpc,
  providers,
  onClose,
  onAdded
}) {
  const [providerId, setProviderId] = (0, import_react.useState)(providers[0]?.id ?? "");
  const [accountId, setAccountId] = (0, import_react.useState)("");
  const [key, setKey] = (0, import_react.useState)("");
  const [code, setCode] = (0, import_react.useState)("");
  const [stage, setStage] = (0, import_react.useState)("form");
  const [url, setUrl] = (0, import_react.useState)("");
  const [copied, setCopied] = (0, import_react.useState)(false);
  const [token, setToken] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const provider = (0, import_react.useMemo)(() => providers.find((p) => p.id === providerId), [providers, providerId]);
  const isOAuth = provider?.oauth === true;
  (0, import_react.useEffect)(() => {
    if (stage !== "oauth" || !providerId) return;
    const timer = setInterval(async () => {
      try {
        const list = unwrap(await rpc.call("list"));
        const found = list.providers.find((p) => p.id === providerId)?.accounts.some((a) => a.accountId === accountId);
        if (found) {
          setStage("done");
          onAdded();
        }
      } catch {
      }
    }, 2e3);
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
      const result = await rpc.call("add-start", {
        providerId,
        accountId: accountId.trim(),
        ...isOAuth ? {} : { key: key.trim() }
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-overlay", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-dialog", role: "dialog", "aria-modal": "true", onClick: (e) => e.stopPropagation(), children: [
    stage === "form" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-dialogTitle", children: t("dialog.add.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "acct-fieldLabel", htmlFor: "acct-provider", children: t("dialog.add.provider") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "select",
          {
            id: "acct-provider",
            className: "acct-select",
            value: providerId,
            onChange: (e) => setProviderId(e.target.value),
            children: providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: p.id, children: p.name }, p.id))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "acct-fieldLabel", htmlFor: "acct-name", children: t("dialog.add.accountName") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "acct-name",
            className: "acct-input",
            value: accountId,
            placeholder: t("dialog.add.accountNamePlaceholder"),
            onChange: (e) => setAccountId(e.target.value)
          }
        )
      ] }),
      !isOAuth && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "acct-fieldLabel", htmlFor: "acct-key", children: t("dialog.add.apiKey") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "acct-key",
            className: "acct-input",
            type: "password",
            value: key,
            placeholder: t("dialog.add.apiKeyPlaceholder"),
            onChange: (e) => setKey(e.target.value)
          }
        )
      ] }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-errText", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "acct-btn", onClick: onClose, disabled: busy, children: t("action.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "acct-btn acct-btnPrimary", onClick: submit, disabled: busy, children: busy ? t("dialog.add.starting") : t("dialog.add.submit") })
      ] })
    ] }),
    stage === "oauth" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-dialogTitle", children: t("dialog.add.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-hint", children: t("dialog.add.openUrl") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-urlRow", children: [
        /^https?:\/\//i.test(url) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "acct-url", href: url, target: "_blank", rel: "noopener noreferrer", children: url }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "acct-url", children: url }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "acct-btn acct-copyBtn", onClick: copyUrl, children: copied ? t("action.copied") : t("action.copy") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-hint", children: t("dialog.add.completeBrowser") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "acct-fieldLabel", htmlFor: "acct-code", children: t("dialog.add.pasteCode") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "acct-code",
            className: "acct-input",
            value: code,
            placeholder: t("dialog.add.codePlaceholder"),
            onChange: (e) => setCode(e.target.value)
          }
        )
      ] }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-errText", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acct-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "acct-btn", onClick: onClose, disabled: busy, children: t("action.close") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "acct-btn acct-btnPrimary", onClick: finishCode, disabled: busy, children: busy ? t("dialog.add.waiting") : t("dialog.add.finish") })
      ] })
    ] }),
    stage === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acct-dialogTitle", children: t("dialog.add.finish") })
  ] }) });
}

// src/client/AccountSelect.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "svg",
    {
      className: `acct-chevron${open ? " acct-chevronOpen" : ""}`,
      width: "14",
      height: "14",
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": "true",
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M4 6l4 4 4-4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function TrashIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "path",
    {
      d: "M3 4h10M6 4V3h4v1M5 4l.5 8h5l.5-8",
      stroke: "currentColor",
      strokeWidth: "1.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
function CheckIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M3 8l3 3 7-7", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function PlusIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) });
}
function AccountSelect({ call, t }) {
  injectAccountStyles();
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [providers, setProviders] = (0, import_react2.useState)([]);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)(null);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [addOpen, setAddOpen] = (0, import_react2.useState)(false);
  const [remove, setRemove] = (0, import_react2.useState)(null);
  const rootRef = (0, import_react2.useRef)(null);
  const triggerRef = (0, import_react2.useRef)(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = unwrap(await call("list"));
      setProviders(list.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    load();
  }, [open]);
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);
  const label = "Account";
  const switchAccount = async (providerId, accountId) => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "acct-root", ref: rootRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        ref: triggerRef,
        type: "button",
        className: "acct-trigger",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        title: label,
        onClick: () => open ? setOpen(false) : setOpen(true),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "acct-triggerLabel", children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chevron, { open })
        ]
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "acct-menu", role: "menu", "aria-label": t("menu.aria"), children: [
      loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-status", children: t("status.loading") }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-error", children: t("error.operation", { message: error }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-groups", children: !loading && providers.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "acct-group", role: "group", "aria-label": provider.name, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-groupTitle", children: provider.name }),
        provider.accounts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-status", children: t("empty.all") }),
        provider.accounts.map((account) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "acct-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              role: "menuitemradio",
              "aria-checked": account.active,
              className: "acct-option",
              disabled: busy,
              title: account.accountId,
              onClick: () => switchAccount(provider.id, account.accountId),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "acct-optionCopy", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "acct-name", children: account.accountId }) }),
                account.active && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "acct-check", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckIcon, {}) })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "acct-removeBtn",
              "aria-label": t("action.remove"),
              title: t("action.remove"),
              disabled: busy || account.active,
              onClick: () => setRemove({ providerId: provider.id, accountId: account.accountId }),
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TrashIcon, {})
            }
          )
        ] }, account.accountId))
      ] }, provider.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-footer", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "acct-addBtn", onClick: () => setAddOpen(true), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PlusIcon, {}),
        t("action.add")
      ] }) })
    ] }),
    addOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      AddAccountDialog,
      {
        t,
        rpc: { call },
        providers,
        onClose: () => setAddOpen(false),
        onAdded: () => {
          setAddOpen(false);
          load();
        }
      }
    ),
    remove !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-overlay", onClick: () => setRemove(null), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "acct-dialog", role: "alertdialog", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-dialogTitle", children: t("dialog.remove.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-hint", children: t("dialog.remove.body", { provider: remove.providerId, account: remove.accountId }) }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "acct-errText", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "acct-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "acct-btn", onClick: () => setRemove(null), disabled: busy, children: t("action.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "acct-btn acct-btnDanger", onClick: confirmRemove, disabled: busy, children: t("action.removeConfirm") })
      ] })
    ] }) })
  ] });
}

// src/client/locales.ts
var NS = "account";
var zh = {
  "trigger.fallback": "\u8D26\u6237",
  "menu.aria": "\u8D26\u6237",
  "option.active": "\u5F53\u524D",
  "action.add": "\u6DFB\u52A0\u8D26\u6237",
  "action.remove": "\u79FB\u9664",
  "action.removeConfirm": "\u786E\u8BA4\u79FB\u9664",
  "action.cancel": "\u53D6\u6D88",
  "action.close": "\u5173\u95ED",
  "action.copy": "\u590D\u5236",
  "action.copied": "\u5DF2\u590D\u5236",
  "dialog.add.title": "\u6DFB\u52A0\u8D26\u6237",
  "dialog.add.provider": "\u63D0\u4F9B\u5546",
  "dialog.add.accountName": "\u8D26\u6237\u540D\u79F0",
  "dialog.add.accountNamePlaceholder": "\u4F8B\u5982 codex-1",
  "dialog.add.apiKey": "API Key",
  "dialog.add.apiKeyPlaceholder": "\u7C98\u8D34 API Key",
  "dialog.add.submit": "\u5F00\u59CB",
  "dialog.add.openUrl": "\u4F7F\u7528\u6B64 URL \u767B\u5F55\uFF1A",
  "dialog.add.completeBrowser": "\u5728\u6D4F\u89C8\u5668\u4E2D\u5B8C\u6210\u767B\u5F55\u3002\u82E5\u88AB\u8981\u6C42\u7C98\u8D34\u56DE\u8C03\u7801\uFF0C\u8BF7\u7C98\u8D34\u5230\u4E0B\u65B9\u3002",
  "dialog.add.pasteCode": "\u56DE\u8C03\u7801\uFF08\u53EF\u9009\uFF09",
  "dialog.add.codePlaceholder": "\u7C98\u8D34 localhost \u56DE\u8C03 code",
  "dialog.add.finish": "\u5B8C\u6210\u767B\u5F55",
  "dialog.add.waiting": "\u7B49\u5F85\u767B\u5F55\u5B8C\u6210\u2026",
  "dialog.remove.title": "\u79FB\u9664\u8D26\u6237",
  "dialog.remove.body": "\u786E\u5B9A\u8981\u79FB\u9664 {provider} / {account} \u5417\uFF1F",
  "status.loading": "\u6B63\u5728\u52A0\u8F7D\u8D26\u6237\u2026",
  "error.operation": "\u8D26\u6237\u64CD\u4F5C\u5931\u8D25\uFF1A{message}",
  "empty.all": "\u6CA1\u6709\u53EF\u7528\u7684\u8D26\u6237\u3002"
};
var en = {
  "trigger.fallback": "Account",
  "menu.aria": "Accounts",
  "option.active": "Active",
  "action.add": "Add account",
  "action.remove": "Remove",
  "action.removeConfirm": "Remove",
  "action.cancel": "Cancel",
  "action.close": "Close",
  "action.copy": "Copy",
  "action.copied": "Copied",
  "dialog.add.title": "Add account",
  "dialog.add.provider": "Provider",
  "dialog.add.accountName": "Account name",
  "dialog.add.accountNamePlaceholder": "e.g. codex-1",
  "dialog.add.apiKey": "API key",
  "dialog.add.apiKeyPlaceholder": "Paste the API key",
  "dialog.add.submit": "Start",
  "dialog.add.openUrl": "Sign in with this URL:",
  "dialog.add.completeBrowser": "Complete login in your browser. If you're asked to paste a redirect code, paste it below.",
  "dialog.add.pasteCode": "Redirect code (optional)",
  "dialog.add.codePlaceholder": "Paste the localhost callback code",
  "dialog.add.finish": "Finish login",
  "dialog.add.waiting": "Waiting for login to complete\u2026",
  "dialog.remove.title": "Remove account",
  "dialog.remove.body": "Remove {provider} / {account}?",
  "status.loading": "Loading accounts\u2026",
  "error.operation": "Account operation failed: {message}",
  "empty.all": "No accounts available."
};

// src/client/index.ts
var inject = ["connection", "locale", "slots"];
function apply(ctx) {
  const get = ctx.get;
  const locale = get("locale");
  const slots = get("slots");
  const connection = get("connection");
  const call = (endpoint, payload) => connection.rpc.call("/provider", endpoint, payload === void 0 ? {} : payload);
  locale.register(NS, { zh, en });
  slots.inject(
    "conversation.input.right",
    () => slots.register(
      {
        name: "conversation.input.right",
        id: "provider",
        order: 90,
        locale: NS,
        inject: () => ({ call })
      },
      AccountSelect
    )
  );
}

		return module.exports;
	}
});

