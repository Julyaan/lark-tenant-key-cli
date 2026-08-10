# Changelog

All notable changes to this project will be documented in this file. This
project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-10

### Changed

- Interactive terminal output now prefixes the result with
  `您当前飞书应用的 tenant key 是：`; piped and JSON output remain
  machine-readable.

## [0.1.0] - 2026-08-10

### Added

- Initial `lark-tenant-key`, `feishu-tenant-key`, and `lark-tenant-key-cli`
  commands.
- Explicit Feishu/Lark profile setup using the official `@larksuite/cli`.
- Minimal `offline_access` user authorization and filtered `tenant_key` output.
- Cross-platform tests and npm Trusted Publishing workflow.
