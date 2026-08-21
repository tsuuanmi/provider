/**
 * Account dropdown copy. The English dictionary is the key-set source of truth.
 *
 * @module @tsuuanmi/dsh-account/client/locales
 */
export const NS = "account";

export interface AccountKey {
	"trigger.fallback": string;
	"menu.aria": string;
	"option.active": string;
	"action.add": string;
	"action.remove": string;
	"action.removeConfirm": string;
	"action.cancel": string;
	"action.close": string;
	"action.copy": string;
	"action.copied": string;
	"dialog.add.title": string;
	"dialog.add.provider": string;
	"dialog.add.accountName": string;
	"dialog.add.accountNamePlaceholder": string;
	"dialog.add.apiKey": string;
	"dialog.add.apiKeyPlaceholder": string;
	"dialog.add.submit": string;
	"dialog.add.openUrl": string;
	"dialog.add.completeBrowser": string;
	"dialog.add.pasteCode": string;
	"dialog.add.codePlaceholder": string;
	"dialog.add.finish": string;
	"dialog.add.waiting": string;
	"dialog.remove.title": string;
	"dialog.remove.body": string;
	"status.loading": string;
	"error.operation": string;
	"empty.all": string;
}

/** Simplified Chinese dictionary. */
export const zh: AccountKey = {
	"trigger.fallback": "账户",
	"menu.aria": "账户",
	"option.active": "当前",
	"action.add": "添加账户",
	"action.remove": "移除",
	"action.removeConfirm": "确认移除",
	"action.cancel": "取消",
	"action.close": "关闭",
	"action.copy": "复制",
	"action.copied": "已复制",
	"dialog.add.title": "添加账户",
	"dialog.add.provider": "提供商",
	"dialog.add.accountName": "账户名称",
	"dialog.add.accountNamePlaceholder": "例如 codex-1",
	"dialog.add.apiKey": "API Key",
	"dialog.add.apiKeyPlaceholder": "粘贴 API Key",
	"dialog.add.submit": "开始",
	"dialog.add.openUrl": "使用此 URL 登录：",
	"dialog.add.completeBrowser": "在浏览器中完成登录。若被要求粘贴回调码，请粘贴到下方。",
	"dialog.add.pasteCode": "回调码（可选）",
	"dialog.add.codePlaceholder": "粘贴 localhost 回调 code",
	"dialog.add.finish": "完成登录",
	"dialog.add.waiting": "等待登录完成…",
	"dialog.remove.title": "移除账户",
	"dialog.remove.body": "确定要移除 {provider} / {account} 吗？",
	"status.loading": "正在加载账户…",
	"error.operation": "账户操作失败：{message}",
	"empty.all": "没有可用的账户。",
};

/** English dictionary. */
export const en: AccountKey = {
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
	"dialog.add.waiting": "Waiting for login to complete…",
	"dialog.remove.title": "Remove account",
	"dialog.remove.body": "Remove {provider} / {account}?",
	"status.loading": "Loading accounts…",
	"error.operation": "Account operation failed: {message}",
	"empty.all": "No accounts available.",
};
