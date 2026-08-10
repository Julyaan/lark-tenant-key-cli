# Contributing

Thank you for helping improve `lark-tenant-key-cli`.

## Development setup

Use Node.js 22 or newer. Installation downloads the official lark-cli binary,
so GitHub Releases or a configured binary mirror must be reachable.

```bash
npm ci
npm run check
npm test
npm run test:dependency
npm run pack:check
```

Tests use an isolated fake CLI and must not read or modify a contributor's real
lark-cli profiles. Do not add real app IDs, secrets, access tokens, tenant keys,
customer names, internal URLs, or private registry configuration to fixtures.

## Pull requests

- Keep the wrapper small and delegate OAuth/token handling to `@larksuite/cli`.
- Preserve the stdout contract: only the tenant key or requested JSON belongs
  on stdout; prompts and diagnostics belong on stderr.
- Add tests for behavior changes on Linux, macOS, and Windows where relevant.
- Update both READMEs for user-facing changes.
- Run `npm pack --dry-run --json` and inspect the public file list.

Use a private security report instead of a pull request for vulnerabilities;
see [SECURITY.md](SECURITY.md).
