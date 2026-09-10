# @tsuuanmi/provider

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for
managing multiple named provider accounts from the web UI.

The plugin adds an **Account** dropdown beside the model selector. It manages
account credentials and active-account switching; model selection remains in the
normal Harness model dropdown.

## Features

- Fixed **Account** composer toggle.
- List accounts grouped by provider.
- Switch the active account instantly — including the running OpenAI Codex
  route, which follows the newly active account on its next request with no
  restart.
- Keep `dsh-codex-subscription` synchronized with the active OpenAI Codex
  account: its legacy OAuth reference (< 1.13) and its multi-account vault
  record (≥ 1.13).
- Add multiple accounts for the same provider.
- Add OpenAI Codex accounts through pi-ai OAuth.
- Add API-key provider accounts through the UI.
- Open OAuth URLs in a new tab or copy them directly.
- Remove accounts (including the active one).
- Store account credentials in an owner-only JSON file.

## Supported providers

### OpenAI Codex

OpenAI Codex uses pi-ai's OAuth flow. The dialog supports both the browser
callback flow and manual redirect-code entry.

### Profile API-key providers

Any provider declared in the `llm-pi-ai` settings namespace with an `apiKeyEnv`
field can be managed by the dropdown. For example:

```yaml
llm-pi-ai:
  providers:
    ollama-cloud:
      displayName: Ollama Cloud
      apiKeyEnv: OLLAMA_CLOUD_API_KEY
      api: openai-completions
      baseURL: https://ollama.com/v1
      models:
        - id: deepseek-v4-flash:0731
          name: DeepSeek Flash
```

## Install

Install the published package into a DSH profile:

```sh
dsh plugin --profile <profile> add @tsuuanmi/provider
```

Or install a linked local checkout:

```sh
dsh plugin --profile <profile> add /path/to/provider
```

Restart the profile after installation:

```sh
dsh --profile <profile>
```

The package contains both a host plugin and a browser client plugin. The host
must be loaded before the Account dropdown can use its RPC service.

## Account storage

Accounts are stored at:

```text
$DSH_HOME/accounts.json
```

The file is created with owner-only permissions (`0600`) inside an owner-only
DSH home directory. The document contains provider accounts, credentials, and
one active account per provider. The plugin reads only this filename; older
filenames are not used.

When an OpenAI Codex account becomes active, its OAuth credential is serialized
into `$DSH_HOME/.credentials.yaml` as `OPENAI_CODEX_SUBSCRIPTION_OAUTH`. That
reference is what `dsh-codex-subscription` < 1.13 reads per request, so the
running Codex route follows the switch without a restart.

`dsh-codex-subscription` ≥ 1.13 no longer resolves its account from that
reference: it keeps its own multi-account vault in the
`codex-subscription/accounts` credential record and serves whichever account
the vault marks active. Switching therefore also selects that vault's matching
account (matched by access token, then by ChatGPT account id), importing the
account into the vault when it is not there yet — never overwriting a stored
credential, which may hold a fresher rotated token. A vault record the plugin
does not understand (a future format, or a malformed one) is left untouched
with a warning instead of being rewritten.

Removing an OpenAI Codex account also removes its matching entry from the
Codex subscription vault, promoting the first remaining vault account when the
removed one was active (the vault requires an active account), and deleting the
whole vault record when it becomes empty. Removing the active account clears
that provider's active marker (no other account is silently promoted) and tears
down its mirrored credential, so a removed account's OAuth grant or API key is
not left behind for another plugin to keep using. Switch to another account
first if you want to keep the route live.

## Default model

Account management and model selection are separate. Configure the default
model through DSH's `agent-default-model` settings. For example, to use Ollama
Cloud's DeepSeek Flash for new sessions:

```yaml
agent-default-model:
  provider: ollama-cloud
  model: deepseek-v4-flash:0731
```

OpenAI Codex models remain available in the normal model dropdown through
`dsh-codex-subscription`. This plugin does not register an `openai-codex`
adapter, so both plugins can load without a duplicate-provider conflict.

## Architecture

This is a dual-face DSH plugin:

- **Host** (`lib/index.js`): owns account storage, OAuth login, active-account
  switching, and synchronization with `dsh-codex-subscription`.
- **Browser** (`lib/client.js`): renders the Account dropdown and dialog in the
  `conversation.input.right` composer slot.
- **RPC**: uses the dedicated `/provider` logical connection channel with
  `list`, `switch`, `remove`, `add-start`, and `add-complete` endpoints.
- **Codex sync** (`src/codex-subscription.ts`): keeps
  `dsh-codex-subscription` ≥ 1.13's account vault record aligned with the
  active Codex account, through the `ctx.credentials` record seam (read-decide-
  replace under the document lock, so it cannot interleave with the vault's
  own token refreshes).

The implementation reuses existing DSH and pi-ai services:

- `@earendil-works/pi-ai` for OAuth and provider authentication
- `@deepseek-ai/dsh-credentials` for profile API-key credentials and the
  Codex subscription vault record
- `@deepseek-ai/dsh-settings` for provider configuration
- `@deepseek-ai/dsh-atomic-write` for locked atomic persistence
- `dsh-codex-subscription` for the OpenAI Codex provider route
- DSH client runtime, locale, connection, and slot services for the UI

No slash command is registered by this plugin.

## Development

Requirements: Node.js 22.19+ or 24+, pnpm, and a DSH installation.

```sh
pnpm install --ignore-scripts
pnpm typecheck
pnpm build
pnpm test
```

The build produces:

- `lib/index.js` — host plugin bundle
- `lib/client.js` — browser module-loader bundle

## Testing in the `web` profile

Never debug in the profile you use daily. The plugin tree is composed at boot,
so a plugin whose entry fails to load — a wrong `inject`, a bad patch — takes
the whole host down with a loader error instead of starting (the v0.1.5
connection-fiber issue did exactly that). Use the disposable `web` profile as
the test bed, and restore it afterwards.

Build first — a linked checkout serves `lib/` straight from the working tree —
then link the checkout into the profile and boot it on a free port:

```sh
pnpm build
dsh plugin --profile web add /path/to/provider
dsh --profile web --no-open --port 0
```

`--port 0` picks a free port, so a test boot never fights the daily profile for
3080. A clean boot means the tree composed and the `/provider` channel mounted;
a broken one crashes with a loader error naming the failing entry. To inspect
the composed tree without booting — including the loader-level effects of
`cordis.patch.yml`, such as the connection row's `inject:` list:

```sh
dsh --profile web --dump-config
```

The channel can also be probed headlessly: open the boot banner's URL once to
receive the browser cookie, then POST a client-request envelope to the channel
(read-only `list` is safe):

```sh
curl -s -c /tmp/dsh-cookies "http://127.0.0.1:<port>/?token=<token>" -o /dev/null
curl -s -b /tmp/dsh-cookies -X POST "http://127.0.0.1:<port>/provider/list" \
  -H 'Content-Type: application/json' \
  -d '{"type":"client-request","rpcId":"t1","method":"list","payload":{}}'
```

Account state is shared per DSH home: every profile in `$DSH_HOME` reads the
same `accounts.json`, so switching accounts in a test boot switches them for
the daily profile too. To keep real accounts untouched, boot inside a scratch
home instead — a fresh `web` profile is created there on first use, and the
whole experiment is undone with one `rm -rf`:

```sh
DSH_HOME=/tmp/provider-debug dsh plugin --profile web add /path/to/provider
DSH_HOME=/tmp/provider-debug dsh --profile web --no-open --port 0
rm -rf /tmp/provider-debug
```

### Restoring the `web` profile after debugging

Remove the plugin so the profile is exactly what it was before. `dsh plugin`
reconciles the bundle list from the installed state, so the dependency and its
`dsh.profile.bundles` row are dropped together:

```sh
dsh plugin --profile web remove @tsuuanmi/provider
```

Verify the profile is back to stock — `--dump-config` shows no
`patched by @tsuuanmi/provider` sections, and the profile manifest no longer
lists the dependency:

```sh
dsh --profile web --dump-config
cat "$DSH_HOME/profiles/web/package.json"
```

## License

Apache-2.0
