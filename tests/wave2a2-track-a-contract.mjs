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
const hostSource = readFileSync(
  new URL(
    '../src/features/launch-command-center/LaunchIntegratedApp.tsx',
    import.meta.url,
  ),
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

const lightThemeBlock = themeStyles.match(/^:root\s*\{(?<tokens>[\s\S]*?)^\}/mu)
  ?.groups?.tokens;

const readLightThemeHex = (token) => {
  assert.ok(lightThemeBlock, 'Light theme tokens were unavailable.');
  const value = lightThemeBlock.match(
    new RegExp(`${token}:\\s*(#[\\da-f]{6})`, 'iu'),
  )?.[1];
  assert.ok(value, `${token} did not expose a six-digit hex color.`);
  return value;
};

const hexChannels = (value) => [1, 3, 5]
  .map((index) => Number.parseInt(value.slice(index, index + 2), 16));

const relativeLuminance = (value) => hexChannels(value)
  .map((channel) => channel / 255)
  .map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ))
  .reduce(
    (sum, channel, index) =>
      sum + channel * [0.2126, 0.7152, 0.0722][index],
    0,
  );

const contrastRatio = (foreground, background) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    Math.max(foregroundLuminance, backgroundLuminance) + 0.05
  ) / (
    Math.min(foregroundLuminance, backgroundLuminance) + 0.05
  );
};

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

test('light on-brand content meets AA contrast through the shared brand token', () => {
  const ratio = contrastRatio(
    readLightThemeHex('--turn-color-on-brand'),
    readLightThemeHex('--turn-color-brand'),
  );
  assert.ok(
    ratio >= 4.5,
    `Light on-brand contrast was ${ratio.toFixed(4)}:1.`,
  );
});

test('unified shell owns only the approved primary hierarchy', () => {
  const order = ['Home', 'TurnBoard', 'Plus', 'Crews', 'More'];
  let previousIndex = -1;
  for (const label of order) {
    const index = shellSource.indexOf(`label: '${label}'`);
    assert.ok(index > previousIndex, `${label} is missing or out of order.`);
    previousIndex = index;
  }
  assert.doesNotMatch(shellSource, /Payroll|Client approval|PDS approval/u);
  assert.match(shellSource, /Intelligence unavailable until a later reviewed release/u);
});

test('focused routes keep one main while pages that own main remain singular', () => {
  assert.match(shellSource, /detailMode\?: boolean/u);
  assert.match(shellSource, /contentOwnsMain\?: boolean/u);
  assert.match(shellSource, /hidden=\{detailMode \|\| onboarding\}/u);
  assert.match(shellSource, /contentOwnsMain \? \(\s*<div/u);
  assert.match(shellSource, /:\s*\(\s*<main/u);
  assert.match(
    hostSource,
    /contentOwnsMain=\{route\.view === 'search' \|\| route\.view === 'notifications'\}/u,
  );
});

test('overlay state cannot reset route scroll history', () => {
  const scrollEffectStart = shellSource.indexOf('const scrollPositions = scrollPositionsRef.current');
  const focusEffectStart = shellSource.indexOf('const routeChanged =');
  assert.ok(scrollEffectStart >= 0 && focusEffectStart > scrollEffectStart);
  const scrollEffect = shellSource.slice(scrollEffectStart, focusEffectStart);
  assert.doesNotMatch(scrollEffect, /backgroundInert/u);
  assert.match(scrollEffect, /rememberPosition/u);
  assert.match(scrollEffect, /addEventListener\('scroll'/u);
  assert.match(shellSource, /\.w1r-unit-detail__body/u);
});

test('route focus cannot override focus restored after a same-route sheet closes', () => {
  assert.match(
    shellSource,
    /previousContentFocusKeyRef\.current !== contentFocusKey/u,
  );
  assert.match(
    shellSource,
    /pendingContentFocusKeyRef\.current = contentFocusKey/u,
  );
  assert.match(
    shellSource,
    /pendingContentFocusKeyRef\.current !== contentFocusKey/u,
  );
  assert.match(
    shellSource,
    /pendingContentFocusKeyRef\.current = null/u,
  );
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
