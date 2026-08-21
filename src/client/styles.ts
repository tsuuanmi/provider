/**
 * Account dropdown styles, injected once as a `<style data-plugin-css>` tag
 * (mirrors the harness client-bundle CSS convention). Kept minimal and driven
 * by the shell's design tokens so the control matches the model dropdown.
 *
 * @module @tsuuanmi/dsh-account/client/styles
 */

const CSS = `
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

const TAG_ID = "@tsuuanmi/dsh-account/account.module.css";
let injected = false;

/** Inject the dropdown stylesheet once (idempotent; no-op on repeat). */
export function injectAccountStyles(): void {
	if (injected) return;
	injected = true;
	if (typeof document === "undefined") return;
	if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "@tsuuanmi/dsh-account";
	tag.dataset.pluginCss = TAG_ID;
	tag.textContent = CSS;
	document.head.appendChild(tag);
}
