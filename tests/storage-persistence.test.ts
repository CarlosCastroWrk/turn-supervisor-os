import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoalescedWriter, type CoalescedTimer } from '../src/lib/coalescedWriter.ts';
import { seedData } from '../src/data/seed.ts';
import {
  commitAppDataUpdateNow,
  getAppDataSaveStatus,
  loadAppData,
  persistAppDataNow,
} from '../src/lib/storage.ts';
import { applyDayTaskStateChange } from '../src/features/wave2a2-core/appDataAdapters.ts';
import { createSyntheticActiveSession } from '../src/features/wave2a2-track-b/fixtures.ts';

const fakeTimer = () => {
  let callback: (() => void) | undefined;
  let handle = 0;
  let scheduledDelay = 0;
  let scheduleCount = 0;
  let cancelCount = 0;

  const timer: CoalescedTimer = {
    schedule(nextCallback, delayMs) {
      callback = nextCallback;
      scheduledDelay = delayMs;
      scheduleCount += 1;
      handle += 1;
      return handle;
    },
    cancel(cancelledHandle) {
      if (cancelledHandle === handle) {
        callback = undefined;
      }
      cancelCount += 1;
    },
  };

  return {
    timer,
    fire() {
      const nextCallback = callback;
      callback = undefined;
      nextCallback?.();
    },
    get scheduledDelay() {
      return scheduledDelay;
    },
    get scheduleCount() {
      return scheduleCount;
    },
    get cancelCount() {
      return cancelCount;
    },
  };
};

test('coalesced writer persists only the latest value in a rapid update window', () => {
  const writes: string[] = [];
  const clock = fakeTimer();
  const writer = createCoalescedWriter((value: string) => {
    writes.push(value);
    return true;
  }, 500, clock.timer);

  writer.schedule('first');
  writer.schedule('second');
  writer.schedule('latest');

  assert.equal(clock.scheduleCount, 1);
  assert.equal(clock.scheduledDelay, 500);
  assert.equal(writer.hasPending(), true);
  assert.deepEqual(writes, []);

  clock.fire();

  assert.deepEqual(writes, ['latest']);
  assert.equal(writer.hasPending(), false);
});

test('flush immediately persists the latest value and clears the scheduled timer', () => {
  const writes: number[] = [];
  const clock = fakeTimer();
  const writer = createCoalescedWriter((value: number) => {
    writes.push(value);
    return true;
  }, 500, clock.timer);

  writer.schedule(1);
  writer.schedule(2);

  assert.equal(writer.flush(), true);
  assert.equal(clock.cancelCount, 1);
  assert.deepEqual(writes, [2]);
  assert.equal(writer.flush(), false);

  clock.fire();
  assert.deepEqual(writes, [2]);
});

test('cancel discards a pending value so reset cannot rewrite cleared data', () => {
  const writes: string[] = [];
  const clock = fakeTimer();
  const writer = createCoalescedWriter((value: string) => {
    writes.push(value);
    return true;
  }, 500, clock.timer);

  writer.schedule('stale pre-reset data');
  writer.cancel();
  clock.fire();

  assert.equal(clock.cancelCount, 1);
  assert.equal(writer.hasPending(), false);
  assert.deepEqual(writes, []);
});

test('failed delayed writes retain the latest value and clear only after a successful retry', () => {
  const attempts: string[] = [];
  const states: string[] = [];
  const clock = fakeTimer();
  let storageAvailable = false;
  const writer = createCoalescedWriter(
    (value: string) => {
      attempts.push(value);
      return storageAvailable;
    },
    500,
    clock.timer,
    (state) => states.push(state),
  );

  writer.schedule('first');
  writer.schedule('latest');
  clock.fire();

  assert.deepEqual(attempts, ['latest']);
  assert.equal(writer.hasPending(), true);
  assert.deepEqual(states, ['pending', 'pending', 'failed']);
  assert.equal(writer.flush(), false);
  assert.equal(writer.hasPending(), true);

  storageAvailable = true;
  assert.equal(writer.flush(), true);
  assert.equal(writer.hasPending(), false);
  assert.deepEqual(attempts, ['latest', 'latest', 'latest']);
  assert.deepEqual(states, ['pending', 'pending', 'failed', 'failed', 'saved']);
});

test('immediate persistence reports quota failure so a large import can fail closed', () => {
  const originalWindow = globalThis.window;
  const originalWarn = console.warn;
  const writes: string[] = [];

  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          setItem: (_key: string, value: string) => writes.push(value),
        },
      },
    });
    assert.equal(persistAppDataNow(structuredClone(seedData)), true);
    assert.equal(writes.length, 1);

    console.warn = () => undefined;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          setItem: () => {
            throw new DOMException('Storage full', 'QuotaExceededError');
          },
        },
      },
    });
    assert.equal(persistAppDataNow(structuredClone(seedData)), false);
    assert.deepEqual(getAppDataSaveStatus(), { state: 'failed', canRetry: false });

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          setItem: (_key: string, value: string) => writes.push(value),
        },
      },
    });
    assert.equal(persistAppDataNow(structuredClone(seedData)), true);
    assert.deepEqual(getAppDataSaveStatus(), { state: 'saved', canRetry: false });
  } finally {
    console.warn = originalWarn;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  }
});

test('Start Day state and success remain atomic across failure, retry, and rapid duplicate confirmation', () => {
  const initial = structuredClone(seedData);
  const started = createSyntheticActiveSession();
  assert.equal(started.errors.length, 0);
  assert.ok(started.session);
  assert.ok(started.startEvent);
  if (!started.session || !started.startEvent) return;

  const change = {
    event: started.startEvent,
    reason: 'day-started' as const,
    recordedAt: started.session.startedAt ?? '2026-08-03T12:15:00.000Z',
    session: started.session,
  };
  const update = (current: typeof initial) => applyDayTaskStateChange(current, change);
  let persistedCandidate: typeof initial | undefined;

  const failed = commitAppDataUpdateNow(initial, update, (candidate) => {
    persistedCandidate = candidate;
    return false;
  });
  assert.equal(failed.ok, false);
  assert.strictEqual(failed.data, initial);
  assert.ok(persistedCandidate?.daySessions.some(
    (session) => session.id === started.session?.daySessionId,
  ));
  assert.equal(initial.daySessions.some(
    (session) => session.id === started.session?.daySessionId,
  ), false);
  assert.equal(initial.fieldEvents.some(
    (event) => event.id === started.startEvent?.eventId,
  ), false);

  const retried = commitAppDataUpdateNow(initial, update, () => true);
  assert.equal(retried.ok, true);
  assert.equal(retried.data.daySessions.filter(
    (session) => session.id === started.session?.daySessionId,
  ).length, 1);
  assert.equal(retried.data.fieldEvents.filter(
    (event) => event.id === started.startEvent?.eventId,
  ).length, 1);

  const duplicate = commitAppDataUpdateNow(retried.data, update, () => true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.data.daySessions.filter(
    (session) => session.id === started.session?.daySessionId,
  ).length, 1);
  assert.equal(duplicate.data.fieldEvents.filter(
    (event) => event.id === started.startEvent?.eventId,
  ).length, 1);

  const thrown = commitAppDataUpdateNow(initial, update, () => {
    throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
  });
  assert.equal(thrown.ok, false);
  assert.strictEqual(thrown.data, initial);
});

test('malformed local field arrays fail safely on reopen without replacing stored data', () => {
  const originalWindow = globalThis.window;
  const originalWarn = console.warn;
  const storageKey = 'turn-supervisor-os:v0.1';
  const corruptStorageKey = `${storageKey}:corrupt`;
  const localFieldKeys = [
    'daySessions',
    'dailyReleaseBatches',
    'todayTasks',
    'fieldEvents',
    'walkSessions',
  ] as const;
  const storage = new Map<string, string>();

  try {
    console.warn = () => undefined;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => storage.delete(key),
          setItem: (key: string, value: string) => storage.set(key, value),
        },
      },
    });

    for (const key of localFieldKeys) {
      const malformed = JSON.stringify({ ...structuredClone(seedData), [key]: { id: 'not-an-array' } });
      storage.clear();
      storage.set(storageKey, malformed);

      const fallback = loadAppData();

      assert.equal(fallback.activeProjectId, seedData.activeProjectId);
      assert.equal(storage.get(storageKey), malformed);
      assert.equal(storage.get(corruptStorageKey), malformed);
      assert.deepEqual(getAppDataSaveStatus(), { state: 'failed', canRetry: false });
      assert.equal(persistAppDataNow(structuredClone(seedData)), false);
      assert.equal(storage.get(storageKey), malformed);

      storage.set(storageKey, JSON.stringify(seedData));
      assert.equal(loadAppData().activeProjectId, seedData.activeProjectId);
      assert.deepEqual(getAppDataSaveStatus(), { state: 'saved', canRetry: false });
    }
  } finally {
    console.warn = originalWarn;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  }
});
