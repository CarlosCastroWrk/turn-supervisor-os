import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = process.cwd();
const testPathPattern = /\btests\/[A-Za-z0-9._-]+\.test\.ts\b/g;

test('the standard deterministic suite includes every committed test manifest entry', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { scripts?: Record<string, string> };
  const standardSuite = packageJson.scripts?.['test:sync'] ?? '';
  const listedTests = standardSuite.match(testPathPattern) ?? [];
  const committedTests = execFileSync(
    'git',
    ['ls-files', '--', 'tests/*.test.ts'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .sort();

  const duplicateEntries = listedTests.filter(
    (testPath, index) => listedTests.indexOf(testPath) !== index,
  );
  const omittedTests = committedTests.filter((testPath) => !listedTests.includes(testPath));

  assert.deepEqual(
    duplicateEntries,
    [],
    `test:sync lists duplicate deterministic tests: ${duplicateEntries.join(', ')}`,
  );
  assert.deepEqual(
    omittedTests,
    [],
    `test:sync omits committed deterministic tests: ${omittedTests.join(', ')}`,
  );
});
