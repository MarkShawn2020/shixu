import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stagingRoot = join(tmpdir(), 'shougongchuan-scan-ios-build');
const expectedPrefix = `${resolve(tmpdir())}${sep}`;

if (!resolve(stagingRoot).startsWith(expectedPrefix)) {
  throw new Error(`Refusing to use an iOS staging directory outside ${resolve(tmpdir())}`);
}

mkdirSync(stagingRoot, { recursive: true });

const syncResult = spawnSync(
  'rsync',
  [
    '-a',
    '--delete',
    '--exclude',
    '/.git',
    '--exclude',
    '/.expo',
    '--exclude',
    '/artifacts',
    '--exclude',
    '/dist',
    '--exclude',
    '/ios',
    '--exclude',
    '/android',
    `${projectRoot}/`,
    `${stagingRoot}/`,
  ],
  { stdio: 'inherit' },
);

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

console.log(`iOS build staging directory: ${stagingRoot}`);

const buildResult = spawnSync('npx', ['expo', 'run:ios', ...process.argv.slice(2)], {
  cwd: stagingRoot,
  env: {
    ...process.env,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
  },
  stdio: 'inherit',
});

process.exit(buildResult.status ?? 1);
