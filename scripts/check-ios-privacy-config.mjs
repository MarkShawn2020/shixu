import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');
const result = spawnSync(
  process.execPath,
  [expoCli, 'config', '--type', 'introspect', '--json'],
  { encoding: 'utf8' },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const config = JSON.parse(result.stdout);
const infoPlist = config.ios?.infoPlist ?? {};
const problems = [];

if ('NSMicrophoneUsageDescription' in infoPlist) {
  problems.push('拾序不录制音频，Info.plist 中不应包含麦克风权限说明');
}

for (const [key, value] of Object.entries(infoPlist)) {
  if (!key.endsWith('UsageDescription')) continue;
  if (typeof value !== 'string' || value.trim().length < 12) {
    problems.push(`${key} 的用途说明过短`);
  }
  if (/^Allow .* to access your /i.test(String(value))) {
    problems.push(`${key} 仍是 Expo 默认占位文案`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}

console.log('✓ iOS 权限用途说明已通过上架前检查');
