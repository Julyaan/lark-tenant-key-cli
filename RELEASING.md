# Releasing

This repository is prepared for `Julyaan/lark-tenant-key-cli` on GitHub and the
unscoped `lark-tenant-key-cli` package on the public npm registry. Recheck both
names immediately before the first publication; neither name is reserved until
you create/publish it.

## 1. Create and push the public GitHub repository

From this repository:

```bash
gh auth status
gh repo create Julyaan/lark-tenant-key-cli --public --source=. --remote=origin --push
```

Review the complete Git history and GitHub file list before making it public.
Enable branch protection, GitHub Private Vulnerability Reporting, and the
`npm` deployment environment. Add required reviewers to that environment if
desired.

## 2. First npm publication

npm requires the package to exist before a Trusted Publisher can be attached,
so the first version is published manually with the maintainer's npm account
and 2FA. This repository pins both local and publish registries to npmjs to
avoid accidentally publishing to a corporate registry.

```bash
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
git status --short
npm ci --registry=https://registry.npmjs.org/
npm run check
npm test
npm run test:dependency
npm run pack:check
npm publish --access public --registry=https://registry.npmjs.org/
```

`git status --short` must be empty. Publish from the exact commit that will be
tagged `v0.1.0`; npm records that Git commit and the release workflow verifies
it before treating an existing first version as idempotent.

Confirm the owner and package contents on npmjs immediately after publication.
Never commit an npm token or add one to the publish workflow.

## 3. Configure npm Trusted Publishing

In the npm package settings, add a GitHub Actions Trusted Publisher with:

- Organization/user: `Julyaan`
- Repository: `lark-tenant-key-cli`
- Workflow filename: `publish.yml`
- GitHub environment: `npm`
- Allowed action: `npm publish`

The names and filename are case-sensitive. Keep
`.github/workflows/publish.yml` stable after configuring it. The workflow uses
OIDC (`id-token: write`) and does not use `NPM_TOKEN`.

After one trusted release succeeds, set npm **Publishing access** to “Require
two-factor authentication and disallow tokens”, then revoke any obsolete npm
automation tokens. Trusted OIDC publishing continues to work.

After the publisher is configured, create the `v0.1.0` tag and GitHub Release.
The idempotent workflow will verify the release and skip publishing if the
manual first version already exists.

## 4. Later releases

Update the changelog, commit the change, and create a version/tag:

```bash
npm version patch
git push origin main --follow-tags
gh release create "$(git describe --tags --abbrev=0)" --generate-notes
```

The GitHub Release triggers the trusted publish workflow. It checks that the tag
matches `package.json`, installs from the lockfile, reruns tests, and publishes
only when that exact version is absent from npm.

Use `npm version minor` or `npm version major` when the semantic-versioning
change requires it. Do not reuse, overwrite, or unpublish a public version.
