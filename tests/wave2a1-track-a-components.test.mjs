import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const featureUrl = new URL('../src/features/wave2a1-native/track-a/', import.meta.url);

const readFeatureFile = (name) => readFile(new URL(name, featureUrl), 'utf8');

test('Search is a full-page, autofocus, no-mutation surface with iPhone-safe input sizing', async () => {
  const [source, css] = await Promise.all([
    readFeatureFile('NativeSearch.tsx'),
    readFeatureFile('trackA.css'),
  ]);

  assert.match(source, /<main[\s\S]*data-testid="wave2a1-native-search"/u);
  assert.match(source, /autoFocus/u);
  assert.match(source, /inputRef\.current\?\.focus/u);
  assert.match(source, /Search checks Units, crews, and Activity without changing any record\./u);
  assert.match(css, /\.w2a1-a-search-field input[\s\S]*font-size:\s*16px/u);
  assert.match(css, /\.w2a1-a-search-field input[\s\S]*min-width:\s*0/u);
});

test('Notifications are a full-page route surface, not a modal', async () => {
  const [source, model] = await Promise.all([
    readFeatureFile('NativeNotifications.tsx'),
    readFeatureFile('model.ts'),
  ]);

  assert.match(source, /<main[\s\S]*data-testid="wave2a1-native-notifications"/u);
  assert.match(model, /\{ id: 'all', label: 'All' \}/u);
  assert.match(model, /\{ id: 'inspections', label: 'Inspections' \}/u);
  assert.match(model, /\{ id: 'callbacks', label: 'Callbacks' \}/u);
  assert.match(model, /\{ id: 'conflicts', label: 'Conflicts' \}/u);
  assert.doesNotMatch(source, /role="dialog"/u);
  assert.doesNotMatch(source, /aria-modal/u);
});

test('Home exposes Set today’s goal, Waiting, exact summaries, and paper safety copy', async () => {
  const source = await readFeatureFile('NativeHome.tsx');

  assert.match(source, /Set today(?:\\u2019|&apos;|')s goal/u);
  assert.match(source, /selectNativeHomeSummary\(records, summary\.id\)/u);
  assert.match(source, /Paper remains authoritative\. Home is a personal working view\./u);
  assert.match(source, /does not change the paper TurnBoard or any official status/u);
  assert.doesNotMatch(source, />Blocked</u);
});

test('Track A meets native target, overflow, and reduced-motion contracts', async () => {
  const css = await readFeatureFile('trackA.css');

  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /overflow-x:\s*hidden/u);
  assert.match(css, /overscroll-behavior-x:\s*none/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /--w2a1-a-transition-duration,\s*210ms/u);
});
