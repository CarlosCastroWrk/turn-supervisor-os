import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ERROR_LOG_MAX_ENTRIES,
  ERROR_LOG_STORAGE_KEY,
  buildProblemReport,
  clearErrorLog,
  logError,
  readErrorLog,
} from '../src/lib/errorLog.ts';

const withFakeWindow = (run: (store: Map<string, string>) => void) => {
  const store = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    },
  });
  try {
    run(store);
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  }
};

test('problems are kept newest first, capped, and a tight repeat collapses', () => {
  withFakeWindow((store) => {
    clearErrorLog();
    logError('save', new Error('quota'), 'Save refused');
    logError('sync', 'Upload failed for 1 table(s)');
    const log = readErrorLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].kind, 'sync');
    assert.equal(log[1].message, 'Save refused — Error: quota');
    assert.ok(log[1].detail?.includes('quota'), 'Error stack is kept as detail');

    logError('sync', 'Upload failed for 1 table(s)');
    assert.equal(readErrorLog().length, 2, 'identical back-to-back problem collapses into one line');

    for (let index = 0; index < ERROR_LOG_MAX_ENTRIES + 10; index += 1) {
      logError('error', `boom ${index}`);
    }
    assert.equal(readErrorLog().length, ERROR_LOG_MAX_ENTRIES, 'log never grows past the cap');
    assert.ok(store.has(ERROR_LOG_STORAGE_KEY));

    clearErrorLog();
    assert.deepEqual(readErrorLog(), []);
    assert.equal(store.has(ERROR_LOG_STORAGE_KEY), false);
  });
});

test('logging never throws when storage is missing or broken', () => {
  Reflect.deleteProperty(globalThis, 'window');
  assert.doesNotThrow(() => logError('crash', new Error('no window')));
  assert.deepEqual(readErrorLog(), []);
  withFakeWindow((store) => {
    store.set(ERROR_LOG_STORAGE_KEY, '{not json');
    assert.deepEqual(readErrorLog(), [], 'a corrupt log reads as empty, never crashes');
    assert.doesNotThrow(() => logError('error', 'after corrupt'));
    assert.equal(readErrorLog().length, 1, 'a corrupt log is replaced, not fatal');
  });
});

test('the problem report is plain text with build, device shape, and every entry', () => {
  withFakeWindow(() => {
    clearErrorLog();
    logError('crash', new Error('Cannot read properties of undefined'), 'Root crash');
    const report = buildProblemReport({
      build: 'abc1234',
      counts: { units: 168, events: 5200 },
      saveStatus: 'Saved',
      storage: { approxMb: 3.1, percentUsed: 62 },
    });
    assert.match(report, /^Turn OS problem report/u);
    assert.match(report, /Build: abc1234/u);
    assert.match(report, /Storage: 62% \(~3.1 MB\)/u);
    assert.match(report, /Records: units 168 · events 5200/u);
    assert.match(report, /1\. \[crash\] .* — Root crash — Error: Cannot read properties of undefined/u);
    const empty = buildProblemReport({ build: 'dev' }, []);
    assert.match(empty, /No problems recorded\./u);
  });
});
