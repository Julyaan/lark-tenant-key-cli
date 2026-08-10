import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = resolve(repositoryRoot, 'bin', 'lark-tenant-key.mjs');

const fakeCliSource = `
const fs = require('node:fs');

const args = process.argv.slice(2);
const mode = process.env.FAKE_LARK_MODE;
const stateFile = process.env.FAKE_LARK_STATE;
const configFile = process.env.FAKE_LARK_CONFIG;
const logFile = process.env.FAKE_LARK_LOG;
fs.appendFileSync(logFile, JSON.stringify(args) + '\\n');

const commandIndex = args.findIndex((arg) =>
  arg === 'api' || arg === 'auth' || arg === 'config',
);
const command = args[commandIndex];
const authorized = fs.existsSync(stateFile);

function authError() {
  if (mode === 'login-needed-warning') {
    process.stderr.write('proxy warning before structured output\\n');
  }
  process.stderr.write(JSON.stringify({
    ok: false,
    identity: 'user',
    error: {
      type: 'authentication',
      subtype: 'token_missing',
      message: 'need_user_authorization',
      hint: 'run lark-cli auth login',
    },
  }));
  process.exit(3);
}

if (command === 'config' && args[commandIndex + 1] === 'init') {
  fs.writeFileSync(configFile, 'configured');
  process.stderr.write('fake setup completed\\n');
  process.exit(0);
}

if (command === 'auth' && args[commandIndex + 1] === 'login') {
  if (mode === 'login-fails') {
    process.stderr.write('authorization cancelled\\n');
    process.exit(3);
  }
  fs.writeFileSync(stateFile, 'authorized');
  process.stderr.write('fake login completed\\n');
  process.exit(0);
}

if (command !== 'api') {
  process.stderr.write('unexpected command');
  process.exit(2);
}

if (mode === 'config-missing' || (mode === 'setup-flow' && !fs.existsSync(configFile))) {
  process.stderr.write(JSON.stringify({
    ok: false,
    identity: 'none',
    error: {
      type: 'config',
      subtype: 'not_configured',
      message: 'configuration not found',
    },
  }));
  process.exit(2);
}

if (mode === 'login-needed' || mode === 'login-needed-warning' || mode === 'login-fails' || mode === 'setup-flow') {
  if (!authorized) authError();
}

const responses = {
  'format-tenant': 'tenant\\u202evalue\\n',
  'missing-tenant': 'null\\n',
  'unsafe-tenant': 'tenant\\u001b[31m\\n',
  'whitespace-tenant': 'tenant key\\n',
};
process.stdout.write(
  mode === 'long-tenant'
    ? 't'.repeat(257) + '\\n'
    : (responses[mode] ?? 'tenant_key_for_test\\n'),
);
`;

async function makeHarness(mode) {
  const directory = await mkdtemp(join(tmpdir(), 'lark-tenant-key-'));
  const fakeCli = join(directory, 'fake-lark-cli.cjs');
  const stateFile = join(directory, 'state');
  const configFile = join(directory, 'config');
  const logFile = join(directory, 'calls.ndjson');
  await writeFile(fakeCli, fakeCliSource);

  return { configFile, fakeCli, logFile, mode, stateFile };
}

function runScript(harness, args = [], environment = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_LARK_CONFIG: harness.configFile,
      FAKE_LARK_LOG: harness.logFile,
      FAKE_LARK_MODE: harness.mode,
      FAKE_LARK_STATE: harness.stateFile,
      LARK_TENANT_KEY_TEST_CLI: harness.fakeCli,
      LARK_TENANT_KEY_TEST_INTERACTIVE: '1',
      NODE_ENV: 'test',
      ...environment,
    },
  });
}

async function readCalls(harness) {
  const content = await readFile(harness.logFile, 'utf8');
  return content.trim().split('\n').map((line) => JSON.parse(line));
}

test('uses an existing user authorization without logging in again', async () => {
  const harness = await makeHarness('existing');
  const result = runScript(harness);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'tenant_key_for_test\n');
  assert.deepEqual(await readCalls(harness), [[
    'api',
    'GET',
    '/open-apis/authen/v1/user_info',
    '--as',
    'user',
    '--jq',
    '.data.tenant_key',
  ]]);
});

test('requests only offline_access when user authorization is missing', async () => {
  const harness = await makeHarness('login-needed');
  const result = runScript(harness);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'tenant_key_for_test\n');
  assert.match(result.stderr, /adds only offline_access/);

  const calls = await readCalls(harness);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], [
    'auth',
    'login',
    '--scope',
    'offline_access',
  ]);
  assert.equal(calls[1].includes('--recommend'), false);
  assert.equal(calls[1].includes('--domain'), false);
});

test('--setup configures lark-cli, authorizes the user, and returns tenant_key', async () => {
  const harness = await makeHarness('setup-flow');
  const result = runScript(harness, ['--setup', '--brand', 'feishu']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'tenant_key_for_test\n');

  const calls = await readCalls(harness);
  assert.deepEqual(calls[0], [
    'config',
    'init',
    '--new',
    '--brand',
    'feishu',
  ]);
  assert.deepEqual(calls[2], [
    'auth',
    'login',
    '--scope',
    'offline_access',
  ]);
  assert.equal(calls.length, 4);
});

test('creates a named Lark profile without passing a nonexistent global profile', async () => {
  const harness = await makeHarness('setup-flow');
  const result = runScript(harness, [
    '--setup',
    '--brand',
    'lark',
    '--profile',
    'customer one',
  ]);

  assert.equal(result.status, 0);
  const calls = await readCalls(harness);
  assert.deepEqual(calls[0], [
    'config',
    'init',
    '--new',
    '--brand',
    'lark',
    '--name',
    'customer one',
  ]);
  assert.deepEqual(calls[1].slice(0, 2), ['--profile', 'customer one']);
});

test('supports JSON output and lark-cli profiles', async () => {
  const harness = await makeHarness('existing');
  const result = runScript(harness, ['--json', '--profile', 'work']);

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    tenant_key: 'tenant_key_for_test',
  });

  const calls = await readCalls(harness);
  assert.deepEqual(calls[0].slice(0, 2), ['--profile', 'work']);
});

test('prints package version without invoking lark-cli', async () => {
  const harness = await makeHarness('existing');
  const result = runScript(harness, ['--version']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '0.1.0\n');
  await assert.rejects(readFile(harness.logFile, 'utf8'), { code: 'ENOENT' });
});

test('explains how to configure lark-cli instead of starting setup implicitly', async () => {
  const harness = await makeHarness('config-missing');
  const result = runScript(harness);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /--setup --brand feishu/);
  assert.equal((await readCalls(harness)).length, 1);
});

test('requires an explicit brand before starting setup', async () => {
  const harness = await makeHarness('setup-flow');
  const result = runScript(harness, ['--setup']);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires an explicit brand/);
  await assert.rejects(readFile(harness.logFile, 'utf8'), { code: 'ENOENT' });
});

test('rejects unsupported brands before starting setup', async () => {
  const harness = await makeHarness('setup-flow');
  const result = runScript(harness, ['--setup', '--brand', 'other']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported brand/);
  await assert.rejects(readFile(harness.logFile, 'utf8'), { code: 'ENOENT' });
});

test('does not start browser authorization from a non-interactive process', async () => {
  const harness = await makeHarness('login-needed');
  const result = runScript(harness, [], {
    LARK_TENANT_KEY_TEST_INTERACTIVE: '0',
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /needs an interactive terminal/);
  assert.equal((await readCalls(harness)).length, 1);
});

test('finds a structured auth error after a harmless warning', async () => {
  const harness = await makeHarness('login-needed-warning');
  const result = runScript(harness);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'tenant_key_for_test\n');
  assert.equal((await readCalls(harness)).length, 3);
});

test('does not invent a tenant_key when authorization is cancelled', async () => {
  const harness = await makeHarness('login-fails');
  const result = runScript(harness);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /User authorization did not complete/);
  assert.equal((await readCalls(harness)).length, 2);
});

test('rejects an empty tenant_key response', async () => {
  const harness = await makeHarness('missing-tenant');
  const result = runScript(harness);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /returned no valid tenant_key/);
  assert.equal((await readCalls(harness)).length, 1);
});

test('rejects control characters instead of writing them to the terminal', async () => {
  const harness = await makeHarness('unsafe-tenant');
  const result = runScript(harness);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /\u001b\[31m/u);
  assert.match(result.stderr, /returned no valid tenant_key/);
});

for (const mode of ['whitespace-tenant', 'long-tenant', 'format-tenant']) {
  test(`rejects an invalid ${mode}`, async () => {
    const harness = await makeHarness(mode);
    const result = runScript(harness);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /returned no valid tenant_key/);
  });
}

test('reports an actionable error when an explicit lark-cli binary is missing', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LARK_CLI_BIN: resolve(repositoryRoot, 'definitely-not-installed'),
    },
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Reinstall this package/);
});
