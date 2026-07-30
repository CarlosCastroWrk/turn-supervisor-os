import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, repoRoot), 'utf8');

const rejectedCommits = [
  '05400b7',
  '1c8f96d',
  '0340218',
  'ecaa6006',
];

test('rejected Track D commits are not ancestors of the accepted-core candidate', () => {
  for (const commit of rejectedCommits) {
    const result = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', commit, 'HEAD'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(
      result.status,
      1,
      `${commit} unexpectedly entered candidate ancestry: ${result.stderr}`,
    );
  }
});

test('active host imports accepted A/B/C and preserves the existing Import route without Track D', async () => {
  const host = await read('src/features/launch-command-center/LaunchIntegratedApp.tsx');

  assert.match(host, /from '\.\.\/wave2a2-track-a'/u);
  assert.match(host, /from '\.\.\/wave2a2-track-b'/u);
  assert.match(host, /from '\.\.\/wave2a2-track-c'/u);
  assert.match(host, /import \{ AssignmentsView \}/u);
  assert.match(host, /route\.view === 'assignments'/u);
  assert.match(host, /<AssignmentsView data=\{data\} setData=\{setData\}/u);
  assert.doesNotMatch(host, /wave2a2-track-d|SourceFirstImport/u);
  assert.equal((host.match(/<Wave2A2OverlayBoundary\b/gu) ?? []).length, 1);
  assert.equal((host.match(/presentation="overlay"/gu) ?? []).length, 1);
});

test('manual release is an explicit roster-only fallback with no extraction or hidden receipt claim', async () => {
  const manualRelease = await read(
    'src/features/wave2a2-core/ManualReleaseReview.tsx',
  );
  const adapters = await read(
    'src/features/wave2a2-core/appDataAdapters.ts',
  );
  const host = await read(
    'src/features/launch-command-center/LaunchIntegratedApp.tsx',
  );
  const combined = `${manualRelease}\n${adapters}\n${host}`;

  assert.match(manualRelease, /does not read a file, photo, paper mark, or official system/u);
  assert.match(manualRelease, /Paper remains authoritative/u);
  assert.match(manualRelease, /submittingRef\.current/u);
  assert.match(
    host,
    /commitDataNow\(\(current\) =>\s+appendManualReleaseBatchToActiveDay\(current, batch\)/u,
  );
  assert.match(adapters, /appendManualReleaseBatchToActiveDay/u);
  assert.match(adapters, /fieldEvents: upsertById\(data\.fieldEvents, event\)/u);
  assert.doesNotMatch(
    combined,
    /wave2a2-track-d|SourceFirstImport|source-first import|extraction succeeded|OCR succeeded|AI extracted|partial import saved/u,
  );
  assert.doesNotMatch(combined, /track-d-write-receipt|source-first-receipt/u);
});

test('official links require an explicit external tap and perform no form submission or logging', async () => {
  const forms = await read('src/features/wave2a2-core/OfficialPdsFormsPage.tsx');

  assert.match(forms, /target="_blank"/u);
  assert.match(forms, /rel="noreferrer noopener"/u);
  assert.match(forms, /does not prefill, submit, validate, track, or store/u);
  assert.doesNotMatch(forms, /fetch\(|onSubmit=|FormData|activityLogs|fieldEvents/u);
});
