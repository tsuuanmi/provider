# @tsuuanmi/provider

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for
managing multiple named provider accounts from the web UI.

The plugin adds an **Account** dropdown beside the model selector. It manages
account credentials and active-account switching; model selection remains in the
normal Harness model dropdown.

## Features

- Fixed **Account** composer toggle.
- List accounts grouped by provider.
- Switch the active account instantly.
- Keep `dsh-codex-subscription` synchronized with the active OpenAI Codex account.
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
into `$DSH_HOME/.credentials.yaml` as `OPENAI_CODEX_SUBSCRIPTION_OAUTH`. The
`dsh-codex-subscription` plugin reads that credential and owns the Codex route.

Removing the active account clears that provider's active marker (no other
account is silently promoted) and tears down its mirrored credential, so a
removed account's OAuth grant or API key is not left behind for another plugin
to keep using. Switch to another account first if you want to keep the route
live.

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

The implementation reuses existing DSH and pi-ai services:

- `@earendil-works/pi-ai` for OAuth and provider authentication
- `@deepseek-ai/dsh-credentials` for profile API-key credentials
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

## License

Apache-2.0
