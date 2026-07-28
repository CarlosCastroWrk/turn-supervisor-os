import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getThemePreferenceStorageKey,
  resolveTurnTheme,
} from '../src/features/wave2a2-track-a/theme.ts';

const shellSource = readFileSync(
  new URL('../src/features/wave2a2-track-a/UnifiedShell.tsx', import.meta.url),
  'utf8',
);
const overlaySource = readFileSync(
  new URL('../src/features/wave2a2-track-a/OverlayBoundary.tsx', import.meta.url),
  'utf8',
);
const themeStyles = readFileSync(
  new URL('../src/features/wave2a2-track-a/trackA.css', import.meta.url),
  'utf8',
);

test('theme resolution keeps System device-driven and forced modes deterministic', () => {
  assert.equal(resolveTurnTheme('system', false), 'light');
  assert.equal(resolveTurnTheme('system', true), 'dark');
  assert.equal(resolveTurnTheme('light', true), 'light');
  assert.equal(resolveTurnTheme('dark', false), 'dark');
});

test('theme preference keys are device-safe and account-scoped', () => {
  assert.equal(
    getThemePreferenceStorageKey(),
    'turn-os:appearance:v1:device',
  );
  assert.equal(
    getThemePreferenceStorageKey('los@example.test'),
    'turn-os:appearance:v1:account:los-example.test',
  );
  assert.equal(
    getThemePreferenceStorageKey('local-unconfigured-device'),
    'turn-os:appearance:v1:device',
  );
});

test('Track A declares the complete semantic token contract', () => {
  for (const token of [
    '--turn-color-page',
    '--turn-color-elevated',
    '--turn-color-grouped',
    '--turn-color-header',
    '--turn-color-bottom-nav',
    '--turn-color-divider',
    '--turn-color-primary',
    '--turn-color-secondary',
    '--turn-color-disabled',
    '--turn-color-input-background',
    '--turn-color-input-border',
    '--turn-color-brand',
    '--turn-color-on-brand',
    '--turn-color-waiting',
    '--turn-color-working',
    '--turn-color-callback',
    '--turn-color-ready',
    '--turn-color-destructive',
    '--turn-color-on-destructive',
    '--turn-color-focus',
    '--turn-color-sheet-backdrop',
  ]) {
    assert.match(themeStyles, new RegExp(token, 'u'));
  }
  assert.match(themeStyles, /prefers-reduced-motion:\s*reduce/u);
  assert.match(themeStyles, /safe-area-inset-bottom/u);
});

test('unified shell owns only the approved primary hierarchy', () => {
  const order = ['Home', 'TurnBoard', 'Plus', 'Activity', 'More'];
  let previousIndex = -1;
  for (const label of order) {
    const index = shellSource.indexOf(`label: '${label}'`);
    assert.ok(index > previousIndex, `${label} is missing or out of order.`);
    previousIndex = index;
  }
  assert.doesNotMatch(shellSource, /Payroll|Client approval|PDS approval/u);
  assert.match(shellSource, /Intelligence unavailable until a later reviewed release/u);
});

test('detail routes retain the shared shell without creating a second main landmark', () => {
  assert.match(shellSource, /detailMode\?: boolean/u);
  assert.match(shellSource, /hidden=\{detailMode\}/u);
  assert.match(shellSource, /detailMode \? \(\s*<div/u);
  assert.match(shellSource, /:\s*\(\s*<main/u);
});

test('overlay state cannot reset route scroll history', () => {
  const scrollEffectStart = shellSource.indexOf('const scrollPositions = scrollPositionsRef.current');
  const focusEffectStart = shellSource.indexOf('if (backgroundInert) return undefined');
  assert.ok(scrollEffectStart >= 0 && focusEffectStart > scrollEffectStart);
  const scrollEffect = shellSource.slice(scrollEffectStart, focusEffectStart);
  assert.doesNotMatch(scrollEffect, /backgroundInert/u);
  assert.match(scrollEffect, /rememberPosition/u);
  assert.match(scrollEffect, /addEventListener\('scroll'/u);
  assert.match(shellSource, /\.w1r-unit-detail__body/u);
});

test('host-owned overlays inherit the same theme without moving dialog ownership', () => {
  assert.match(overlaySource, /data-wave2a2-overlay-boundary="true"/u);
  assert.doesNotMatch(overlaySource, /useState|role="dialog"|AppData/u);
  assert.match(themeStyles, /\.w2a2-overlay-boundary/u);
  assert.match(themeStyles, /\.capture-workspace/u);
  assert.match(themeStyles, /\.tc-sheet-backdrop/u);
});

test('legacy surfaces are contained without importing AppData or persistence modules', () => {
  assert.match(themeStyles, /\.w2a2-shell \.app-shell/u);
  assert.doesNotMatch(
    shellSource,
    /AppData|storage|supabase|serviceWorker|migration/u,
  );
});
