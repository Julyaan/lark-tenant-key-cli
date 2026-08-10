import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
);
const require = createRequire(import.meta.url);
const runner = require.resolve('@larksuite/cli/scripts/run.js');

function run(args) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    },
    timeout: 30_000,
  });

  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `lark-cli ${args.join(' ')} failed:\n${result.stderr}`,
  );
  return `${result.stdout}\n${result.stderr}`;
}

const version = run(['--version']);
const expectedVersion = packageJson.dependencies['@larksuite/cli'].replaceAll(
  '.',
  '\\.',
);
assert.match(version, new RegExp(`\\b${expectedVersion}\\b`));

const configHelp = run(['config', 'init', '--help']);
for (const flag of ['--new', '--brand', '--name']) {
  assert.match(configHelp, new RegExp(flag));
}

const authHelp = run(['auth', 'login', '--help']);
assert.match(authHelp, /--scope/);

const apiHelp = run(['api', '--help']);
for (const flag of ['--as', '--jq']) {
  assert.match(apiHelp, new RegExp(flag));
}

process.stdout.write(
  `Verified @larksuite/cli ${packageJson.dependencies['@larksuite/cli']} command contract.\n`,
);
