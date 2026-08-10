#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8'),
);
const USER_INFO_PATH = '/open-apis/authen/v1/user_info';
const MIN_NODE_MAJOR = 22;
const MAX_TENANT_KEY_LENGTH = 256;
const UNSAFE_UNICODE_CHARACTER = /[\p{Cc}\p{Cf}]/u;
const WHITESPACE = /\s/u;
const BRANDS = new Set(['feishu', 'lark']);
const TOKEN_RECOVERY_SUBTYPES = new Set([
  'token_missing',
  'token_invalid',
  'token_expired',
  'refresh_token_invalid',
  'refresh_token_expired',
  'refresh_token_revoked',
  'refresh_token_reused',
  'user_unauthorized',
]);

function printHelp() {
  process.stdout.write(`Retrieve the tenant_key for the current Lark/Feishu user.

Usage:
  lark-tenant-key [options]

Options:
  --setup            Create/configure a lark-cli app before authorization
  --brand <brand>    Required with --setup: feishu or lark
  --force-login      Authorize again, useful when switching Lark/Feishu accounts
  --profile <name>   Use a specific lark-cli profile
  --json             Output {"tenant_key":"..."}
  -v, --version      Print this package version
  -h, --help         Show this help

Interactive terminals show a human-readable label before tenant_key.
Piped/captured stdout remains the raw tenant_key (or JSON with --json).
Prompts, progress, and errors are written to stderr.
`);
}

function parseOptions(argv) {
  const options = {
    brand: '',
    forceLogin: false,
    help: false,
    json: false,
    profile: '',
    setup: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--setup':
        options.setup = true;
        break;
      case '--brand': {
        const brand = argv[index + 1];
        if (!brand || brand.startsWith('-')) {
          throw new Error('--brand requires feishu or lark');
        }
        if (!BRANDS.has(brand)) {
          throw new Error(`Unsupported brand: ${brand}. Use feishu or lark.`);
        }
        options.brand = brand;
        index += 1;
        break;
      }
      case '--force-login':
        options.forceLogin = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--profile': {
        const profile = argv[index + 1];
        if (!profile || profile.startsWith('-')) {
          throw new Error('--profile requires a profile name');
        }
        options.profile = profile;
        index += 1;
        break;
      }
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.setup && !options.brand) {
    throw new Error(
      '--setup requires an explicit brand. Use --brand feishu or --brand lark.',
    );
  }
  if (options.brand && !options.setup) {
    throw new Error('--brand is only used together with --setup.');
  }

  return options;
}

function resolveBundledRunner() {
  try {
    return require.resolve('@larksuite/cli/scripts/run.js');
  } catch {
    return '';
  }
}

function resolveLarkCli() {
  const testRunner = process.env.LARK_TENANT_KEY_TEST_CLI;
  if (process.env.NODE_ENV === 'test' && testRunner) {
    return { command: process.execPath, prefix: [testRunner] };
  }

  if (process.env.LARK_CLI_BIN) {
    return { command: process.env.LARK_CLI_BIN, prefix: [] };
  }

  const bundledRunner = resolveBundledRunner();
  if (bundledRunner) {
    return { command: process.execPath, prefix: [bundledRunner] };
  }

  return { command: 'lark-cli', prefix: [] };
}

function commandArgs(invocation, options, args) {
  const profileArgs = options.profile
    ? ['--profile', options.profile]
    : [];
  return [...invocation.prefix, ...profileArgs, ...args];
}

function larkEnvironment() {
  return {
    ...process.env,
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
  };
}

function runCaptured(invocation, options, args) {
  return spawnSync(
    invocation.command,
    commandArgs(invocation, options, args),
    {
      encoding: 'utf8',
      env: larkEnvironment(),
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    },
  );
}

function runInteractive(invocation, options, args) {
  // Route the child stdout to our stderr so stdout remains safe for shell use.
  return spawnSync(
    invocation.command,
    commandArgs(invocation, options, args),
    {
      env: larkEnvironment(),
      stdio: [0, 2, 2],
    },
  );
}

function parseErrorEnvelope(value) {
  const text = value?.trim();
  if (!text) return null;

  let depth = 0;
  let escaped = false;
  let inString = false;
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start === -1) {
      if (character === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth !== 0) continue;

      try {
        const candidate = JSON.parse(text.slice(start, index + 1));
        if (candidate?.error?.type && candidate?.error?.subtype) {
          return candidate;
        }
      } catch {
        // Ignore non-JSON warning text enclosed in braces.
      }
      start = -1;
      escaped = false;
      inString = false;
    }
  }

  return null;
}

function parseTenantKey(stdout) {
  const value = stdout.endsWith('\r\n')
    ? stdout.slice(0, -2)
    : stdout.endsWith('\n')
      ? stdout.slice(0, -1)
      : stdout;

  if (
    !value ||
    value === 'null' ||
    value.length > MAX_TENANT_KEY_LENGTH ||
    UNSAFE_UNICODE_CHARACTER.test(value) ||
    WHITESPACE.test(value)
  ) {
    return '';
  }
  return value;
}

function inspectUserInfo(result) {
  if (result.error) {
    return { kind: 'spawn', error: result.error, status: result.status };
  }

  if (result.status === 0) {
    const tenantKey = parseTenantKey(result.stdout);
    if (tenantKey) {
      return { kind: 'success', tenantKey };
    }
    return { kind: 'invalid_response', status: result.status };
  }

  return {
    kind: 'cli_error',
    envelope: parseErrorEnvelope(result.stderr),
    status: result.status,
  };
}

function shouldLogin(attempt) {
  const error = attempt.envelope?.error;
  if (!error) return false;

  if (TOKEN_RECOVERY_SUBTYPES.has(error.subtype)) return true;

  const recoveryText = `${error.message ?? ''} ${error.hint ?? ''}`;
  return (
    error.type !== 'config' &&
    error.subtype !== 'missing_scope' &&
    /need_user_authorization|auth login/i.test(recoveryText)
  );
}

function errorDetails(attempt) {
  const error = attempt.envelope?.error;
  if (!error) return `lark-cli exit code: ${attempt.status ?? 'unknown'}`;
  const type = String(error.type).replace(/[^a-z0-9_-]/giu, '').slice(0, 64);
  const subtype = String(error.subtype)
    .replace(/[^a-z0-9_-]/giu, '')
    .slice(0, 64);
  return `lark-cli error: ${type || 'unknown'}/${subtype || 'unknown'}`;
}

function failForAttempt(attempt) {
  if (attempt.kind === 'spawn' && attempt.error?.code === 'ENOENT') {
    throw new Error(
      'Could not start the official lark-cli. Reinstall this package and make sure @larksuite/cli is present.',
    );
  }
  if (attempt.kind === 'spawn' && attempt.error?.code === 'ETIMEDOUT') {
    throw new Error('The Lark/Feishu request timed out. Check your network and retry.');
  }
  if (attempt.kind === 'invalid_response') {
    throw new Error(
      'lark-cli succeeded but returned no valid tenant_key. Upgrade and retry.',
    );
  }
  if (attempt.envelope?.error?.type === 'config') {
    throw new Error(
      'lark-cli is not configured. Run one of:\n' +
        '  lark-tenant-key --setup --brand feishu\n' +
        '  lark-tenant-key --setup --brand lark\n' +
        errorDetails(attempt),
    );
  }
  throw new Error(`Failed to get tenant_key.\n${errorDetails(attempt)}`);
}

function getTenantKey(invocation, options) {
  const result = runCaptured(invocation, options, [
    'api',
    'GET',
    USER_INFO_PATH,
    '--as',
    'user',
    '--jq',
    '.data.tenant_key',
  ]);
  return inspectUserInfo(result);
}

function ensureInteractiveSuccess(result, action) {
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      'Could not start the official lark-cli. Reinstall this package and retry.',
    );
  }
  if (result.error) {
    throw new Error(`${action} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${action} did not complete (lark-cli exit code: ${result.status ?? 'unknown'}).`,
    );
  }
}

function ensureInteractiveTerminal(action) {
  const testTerminal =
    process.env.NODE_ENV === 'test' &&
    process.env.LARK_TENANT_KEY_TEST_INTERACTIVE === '1';
  if (!testTerminal && (!process.stdin.isTTY || !process.stderr.isTTY)) {
    throw new Error(
      `${action} needs an interactive terminal. Run the command directly in a terminal, not from CI or a background job.`,
    );
  }
}

function setup(invocation, options) {
  ensureInteractiveTerminal('lark-cli setup');
  process.stderr.write('Starting the official lark-cli setup flow...\n\n');
  const setupArgs = [
    'config',
    'init',
    '--new',
    '--brand',
    options.brand,
  ];
  if (options.profile) setupArgs.push('--name', options.profile);

  // The profile does not exist yet, so config init uses --name rather than the
  // global --profile flag.
  const result = runInteractive(invocation, { ...options, profile: '' }, setupArgs);
  ensureInteractiveSuccess(result, 'lark-cli setup');
}

function login(invocation, options) {
  ensureInteractiveTerminal('User authorization');
  process.stderr.write(
    'User authorization is required. Open the URL shown by lark-cli and approve it in your browser.\n',
  );
  process.stderr.write(
    'This request adds only offline_access (persistent access); no Contacts, Messages, or Docs scope is requested.\n\n',
  );

  const result = runInteractive(invocation, options, [
    'auth',
    'login',
    '--scope',
    'offline_access',
  ]);
  ensureInteractiveSuccess(result, 'User authorization');
}

function printTenantKey(tenantKey, options) {
  const testTerminal =
    process.env.NODE_ENV === 'test' &&
    process.env.LARK_TENANT_KEY_TEST_STDOUT_TTY === '1';
  const humanTerminal = process.stdout.isTTY || testTerminal;
  const output = options.json
    ? JSON.stringify({ tenant_key: tenantKey })
    : humanTerminal
      ? `您当前飞书应用的 tenant key 是： ${tenantKey}`
      : tenantKey;
  process.stdout.write(`${output}\n`);
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.version) {
    process.stdout.write(`${PACKAGE_JSON.version}\n`);
    return;
  }

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isInteger(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
    throw new Error(`Node.js ${MIN_NODE_MAJOR} or newer is required.`);
  }

  const invocation = resolveLarkCli();
  if (options.setup) setup(invocation, options);

  let attempt;
  if (!options.forceLogin) {
    attempt = getTenantKey(invocation, options);
    if (attempt.kind === 'success') {
      printTenantKey(attempt.tenantKey, options);
      return;
    }
    if (!shouldLogin(attempt)) failForAttempt(attempt);
  }

  login(invocation, options);
  attempt = getTenantKey(invocation, options);
  if (attempt.kind !== 'success') failForAttempt(attempt);
  printTenantKey(attempt.tenantKey, options);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
