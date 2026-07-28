import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL(
  '../node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift',
  import.meta.url,
);
const sourcePath = fileURLToPath(sourceUrl);

if (!existsSync(sourcePath)) {
  console.log('[postinstall] expo-modules-jsi is not installed; Swift compatibility patch skipped.');
  process.exit(0);
}

const ambiguousExpression =
  '  guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {';
const explicitDoubleExpression = [
  '  let absoluteMilliseconds: Double = Swift.abs(milliseconds)',
  '  guard milliseconds.isFinite, absoluteMilliseconds <= maxJavaScriptDateMilliseconds else {',
].join('\n');

const source = readFileSync(sourcePath, 'utf8');

if (source.includes(explicitDoubleExpression)) {
  console.log('[postinstall] expo-modules-jsi Swift compatibility patch is already applied.');
  process.exit(0);
}

if (!source.includes(ambiguousExpression)) {
  console.log('[postinstall] expo-modules-jsi no longer needs the Swift compatibility patch.');
  process.exit(0);
}

writeFileSync(sourcePath, source.replace(ambiguousExpression, explicitDoubleExpression));
console.log('[postinstall] patched expo-modules-jsi for Xcode 26.3 / Swift 6.');
