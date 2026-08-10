# lark-tenant-key-cli

[简体中文](README.zh-CN.md)

An unofficial, minimal-permission CLI that retrieves the `tenant_key` for the
currently authorized Lark or Feishu user. It delegates app setup, OAuth, token
storage, refresh, and API calls to the official
[`@larksuite/cli`](https://www.npmjs.com/package/@larksuite/cli).

> This project is not affiliated with or endorsed by Lark Technologies. Lark,
> Feishu, and their related marks belong to their respective owners.

## Quick start

Node.js 22 or newer is required.

Installation (or the first execution) also downloads the official precompiled
`lark-cli` binary. The machine must be able to reach GitHub Releases or a
configured npm binary mirror.

For the first run, choose the service explicitly, configure lark-cli, authorize
the user, and print the tenant key in one flow:

```bash
# Lark (international)
npx --yes lark-tenant-key-cli --setup --brand lark

# Feishu (Mainland China)
npx --yes lark-tenant-key-cli --setup --brand feishu
```

`--setup` creates an Open Platform app through the official CLI. The person
running it therefore needs permission to create/manage developer apps. If the
customer does not have that permission, ask their app administrator to perform
the setup or provide a configured lark-cli profile.

Later runs reuse the locally stored lark-cli profile and token:

```bash
npx --yes lark-tenant-key-cli
```

For frequent use, install it globally:

```bash
npm install --global lark-tenant-key-cli
lark-tenant-key --setup --brand lark
```

The final value is the only content written to stdout, so shell capture is
safe:

```bash
export LARK_TENANT_KEY="$(lark-tenant-key)"
```

Progress, browser authorization instructions, and errors go to stderr.

## What it does

1. Reuses an existing lark-cli user authorization when possible.
2. When authorization is missing or expired, runs:

   ```bash
   lark-cli auth login --scope offline_access
   ```

3. Calls the read-only user API through lark-cli:

   ```bash
   lark-cli api GET /open-apis/authen/v1/user_info \
     --as user \
     --jq '.data.tenant_key'
   ```

The official [user-info API](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get?lang=en-US)
requires no business API scope and returns `data.tenant_key`. The official
lark-cli device flow always adds
`offline_access`, so that is the smallest authorization possible while using
lark-cli. No Contacts, Messages, Docs, or Calendar scope is requested by this
package.

Depending on the app and tenant, an app administrator may need to enable
“Access authorized data offline” (`offline_access`), enable
[user access-token refresh](https://open.feishu.cn/document/authentication-management/access-token/refresh-user-access-token?lang=en-US),
and publish the app configuration.

Lark user grants are cumulative. This command does not revoke scopes that the
same user previously granted to the same app. Use an isolated app/profile or
revoke the old grant in Lark/Feishu authorization management when strict
isolation is required.

## Options

```text
--setup            Configure lark-cli first, then authorize and get tenant_key
--brand <brand>    Required with --setup: feishu or lark
--force-login      Authorize again, useful when switching accounts
--profile <name>   Use a specific lark-cli profile
--json             Output {"tenant_key":"..."}
-v, --version      Print the package version
-h, --help         Show help
```

Examples:

```bash
lark-tenant-key --json
lark-tenant-key --profile work
lark-tenant-key --force-login
```

## Security and privacy

- Access tokens, refresh tokens, and app secrets are managed by lark-cli and
  are never printed by this package.
- During login, lark-cli may receive and locally store identity data and OAuth
  tokens. For the user-info request, this wrapper receives only the
  lark-cli-filtered `tenant_key` value.
- This wrapper has no backend and sends no telemetry of its own.
- The official lark-cli documentation states that it sends limited OS/device
  risk-control signals by default; see its
  [security notes](https://github.com/larksuite/cli#security--risk-warnings-read-before-use).
- stdout is reserved for the final `tenant_key` only.
- Control and invisible Unicode format characters in an unexpected response
  are rejected before output.
- `tenant_key` is an organization identifier, not an access token. Treat real
  customer identifiers as configuration data and do not commit them to public
  repositories.
- The package invokes subprocesses with argument arrays and never uses a shell.

See [PRIVACY.md](PRIVACY.md) for the data flow and [SECURITY.md](SECURITY.md)
to report a vulnerability.

## Troubleshooting

### lark-cli is not configured

Run:

```bash
lark-tenant-key --setup --brand lark
# or: lark-tenant-key --setup --brand feishu
```

This starts the official lark-cli setup flow. It may ask you to approve app
configuration in a browser.

### `offline_access` is not enabled

Enable “Access authorized data offline” for the app represented by the active
lark-cli profile. Some environments also require a security review or a new app
release. Ask the app administrator when you do not manage the app.

Do not work around this by requesting `--recommend` or `--domain all`; those
options request more permissions than this tool needs.

### The result belongs to the wrong organization

The value belongs to the organization of the user who completed browser
authorization. Check the browser account, then use `--force-login` or a
separate `--profile`.

### Lark versus Feishu

Select `--brand lark` or `--brand feishu` when creating a profile. Later runs
use the brand stored in that profile; this package does not hard-code a service
domain.

### The official binary could not be installed

First try:

```bash
npm install --global @larksuite/cli --registry=https://registry.npmjs.org/
lark-cli --version
```

If that fails, allow access to the official GitHub Release download or configure
the corporate binary mirror/proxy described by the installer. Avoid disabling
TLS certificate verification. macOS environments that require every binary to
be notarized may need an exception or an upstream notarized lark-cli release.

## Development

```bash
npm ci
npm run check
npm test
npm run test:dependency
npm run pack:check
```

Tests use a fake lark-cli process. They do not start a real OAuth flow and do
not access Lark or Feishu.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md) for the
contribution and npm release workflows.

## License

[MIT](LICENSE)
