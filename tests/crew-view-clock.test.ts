import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The Crews tab is where Tony's numbers are read. Its payroll memo used to
// depend on `state.events` only and freeze `new Date()` at first render, so a
// task-type edit or the Saturday→Sunday rollover left stale tallies on screen
// (the linter flagged it for weeks). Every clock read on that page now comes
// from one ticking `useNow()` and the memo depends on the whole state.

const source = () => readFile(new URL('../src/features/wave2a2-track-c/CrewView.tsx', import.meta.url), 'utf8');

test('CrewView never reads the wall clock directly', async () => {
  const text = await source();
  assert.doesNotMatch(text, /new Date\(\)/, 'use the `now` from useNow() instead');
  assert.match(text, /import \{ useNow \} from '\.\.\/\.\.\/hooks\/useNow'/);
});

test('the payroll memo re-runs on any state change and on the clock', async () => {
  const text = await source();
  assert.match(
    text,
    /buildAllCrewPayroll\(state, now\),\s*\[state, now\],/,
    'payroll memo deps are [state, now]',
  );
});

test('useNow ticks and re-reads the clock when the app comes back to the foreground', async () => {
  const hook = await readFile(new URL('../src/hooks/useNow.ts', import.meta.url), 'utf8');
  assert.match(hook, /setInterval\(tick, everyMs\)/);
  assert.match(hook, /addEventListener\('visibilitychange', tick\)/);
  assert.match(hook, /clearInterval\(id\)/);
});
