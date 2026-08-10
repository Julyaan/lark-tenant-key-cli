# Privacy

`lark-tenant-key-cli` is a local wrapper with no project-operated backend and
no telemetry of its own.

## Data flow

1. The wrapper starts the official `@larksuite/cli` process installed with this
   package.
2. During setup and login, lark-cli communicates with Lark/Feishu, may open a
   browser, and locally manages app configuration, identity information, access
   tokens, and refresh tokens.
3. The wrapper asks lark-cli to call the user-info API with a `--jq` filter. The
   normal value received by this wrapper is only `data.tenant_key`.
4. The wrapper writes that value to stdout. Prompts and diagnostics go to
   stderr.

For non-interactive API failures, the wrapper reports only the structured error
type/subtype rather than forwarding the official CLI's raw response.

This project does not receive, operate, or control Lark/Feishu infrastructure.
The official CLI and service remain subject to their own terms and privacy
policies.

The official lark-cli documentation states that it sends a limited operating
system type and hardware-model signal to official endpoints for risk control by
default. Its documented `lark-cli config risk-control` setting controls that
behavior. See the official
[security notes](https://github.com/larksuite/cli#security--risk-warnings-read-before-use)
before changing the default.

## Local storage and logs

This wrapper does not create a credential store. Profiles and OAuth credentials
are stored by lark-cli according to its configuration. A tenant key is an
organization identifier rather than an access token, but it can still identify
a customer; avoid putting it in source control, screenshots, support tickets,
or public CI logs.

`lark-cli auth logout` removes local login state. It does not necessarily revoke
the server-side grant; use Lark/Feishu authorization management when revocation
is required.

Do not send real tokens, app secrets, tenant keys, or personal data in bug or
security reports.
