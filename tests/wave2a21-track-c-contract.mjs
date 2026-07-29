import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TRACK_C_LEGACY_ROUTE_QUARANTINE,
  TRACK_C_OFFICIAL_FORMS_AVAILABILITY,
  TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS,
  TRACK_C_SECTION_14_ROUTE_INVENTORY,
  canExposeTrackCPrimaryRoute,
  captureTrackCTransientOrigin,
  createTrackCTabRouteMemory,
  getTrackCCurrentTabRoute,
  isTrackCLegacyPrimaryRoute,
  rememberTrackCTabRoute,
  rememberTrackCTabScroll,
  restoreTrackCTabBack,
  restoreTrackCTransientOrigin,
  selectTrackCPrimaryTab,
} from '../src/features/wave2a21-track-c/index.ts';

const shellSource = readFileSync(
  new URL('../src/features/wave2a2-track-a/UnifiedShell.tsx', import.meta.url),
  'utf8',
);
const shellStyles = readFileSync(
  new URL('../src/features/wave2a2-track-a/trackA.css', import.meta.url),
  'utf8',
);
const plusSource = readFileSync(
  new URL('../src/features/wave2a1-native/track-c/TrackCNativeFlow.tsx', import.meta.url),
  'utf8',
);
const fieldOpsSource = readFileSync(
  new URL('../src/features/wave2a2-track-c/TrackCFieldOps.tsx', import.meta.url),
  'utf8',
);
const fieldOpsStyles = readFileSync(
  new URL('../src/features/wave2a2-track-c/trackCFieldOps.css', import.meta.url),
  'utf8',
);

const roots = {
  activity: '#/activity',
  home: '#/dashboard',
  more: '#/more',
  turnboard: '#/units',
};

test('tab route memory restores nested routes and scroll per primary tab', () => {
  let state = createTrackCTabRouteMemory(roots);
  state = rememberTrackCTabRoute(state, 'home', 'home:start-day');
  state = rememberTrackCTabScroll(state, 'home', 'home:start-day', 418);

  const turnboard = selectTrackCPrimaryTab(state, 'turnboard');
  assert.equal(turnboard.reason, 'switch-tab');
  assert.equal(turnboard.target.routeKey, '#/units');

  state = rememberTrackCTabRoute(
    turnboard.state,
    'turnboard',
    'turnboard:assign',
  );
  const home = selectTrackCPrimaryTab(state, 'home');
  assert.deepEqual(home.target, {
    routeKey: 'home:start-day',
    scrollTop: 418,
  });
});

test('active-tab retap returns to the tab root and top', () => {
  let state = createTrackCTabRouteMemory(roots, 'turnboard');
  state = rememberTrackCTabRoute(
    state,
    'turnboard',
    'turnboard:unit:synthetic-101',
    { scrollTop: 250 },
  );

  const decision = selectTrackCPrimaryTab(state, 'turnboard');
  assert.equal(decision.reason, 'active-tab-retap');
  assert.equal(decision.historyMode, 'replace');
  assert.deepEqual(decision.target, {
    routeKey: '#/units',
    scrollTop: 0,
  });
  assert.equal(decision.state.tabs.turnboard.entries.length, 1);
});

test('tab-local Back restores the preceding route without changing tabs', () => {
  let state = createTrackCTabRouteMemory(roots, 'more');
  state = rememberTrackCTabRoute(state, 'more', 'more:profile');
  state = rememberTrackCTabRoute(state, 'more', 'more:privacy');

  const decision = restoreTrackCTabBack(state);
  assert.equal(decision?.reason, 'back');
  assert.equal(decision?.state.activeTab, 'more');
  assert.equal(decision?.target.routeKey, 'more:profile');
});

test('bounded tab history retains a reachable root', () => {
  let state = createTrackCTabRouteMemory(roots, 'home');
  for (let index = 0; index < 40; index += 1) {
    state = rememberTrackCTabRoute(state, 'home', `home:synthetic:${index}`);
  }
  assert.equal(state.tabs.home.entries.length, 32);
  assert.equal(state.tabs.home.entries[0].routeKey, '#/dashboard');

  while (restoreTrackCTabBack(state)) {
    state = restoreTrackCTabBack(state).state;
  }
  assert.equal(getTrackCCurrentTabRoute(state).routeKey, '#/dashboard');
});

test('Search and Notifications preserve the exact origin stack and scroll', () => {
  let state = createTrackCTabRouteMemory(roots, 'turnboard');
  state = rememberTrackCTabRoute(
    state,
    'turnboard',
    'turnboard:unit:synthetic-202',
    { scrollTop: 612 },
  );
  const snapshot = captureTrackCTransientOrigin(state, 'search');
  const changed = selectTrackCPrimaryTab(state, 'activity').state;
  const restored = restoreTrackCTransientOrigin(changed, snapshot);

  assert.equal(restored.state.activeTab, 'turnboard');
  assert.deepEqual(restored.target, {
    routeKey: 'turnboard:unit:synthetic-202',
    scrollTop: 612,
  });
});

test('Section 14 inventory is complete and quarantines legacy primary entries', () => {
  assert.equal(TRACK_C_SECTION_14_ROUTE_INVENTORY.length, 30);
  assert.equal(canExposeTrackCPrimaryRoute('home'), true);
  assert.equal(canExposeTrackCPrimaryRoute('notes'), true);
  assert.equal(canExposeTrackCPrimaryRoute('official-forms'), true);
  assert.equal(canExposeTrackCPrimaryRoute('photos'), false);
  assert.equal(canExposeTrackCPrimaryRoute('paste-text'), false);
  assert.equal(canExposeTrackCPrimaryRoute('import-work'), false);
  assert.equal(canExposeTrackCPrimaryRoute('unknown-route'), false);
  assert.deepEqual(TRACK_C_OFFICIAL_FORMS_AVAILABILITY, {
    available: true,
    externalOnly: true,
    prefill: false,
    submit: false,
  });
  assert.equal(TRACK_C_LEGACY_ROUTE_QUARANTINE.length, 3);
  assert.equal(isTrackCLegacyPrimaryRoute('#/copilot'), true);
  assert.equal(isTrackCLegacyPrimaryRoute('#/unit/synthetic-101'), true);
  assert.equal(isTrackCLegacyPrimaryRoute('#/assignments'), true);
  assert.equal(isTrackCLegacyPrimaryRoute('#/units/synthetic-101'), false);
});

test('shell exposes a Home control and scroll restoration without weakening route focus', () => {
  assert.match(shellSource, /data-w2a21-home-control="true"/u);
  assert.match(shellSource, /onOpenHome \?\? \(\(\) => onNavigate\('home'\)\)/u);
  assert.match(shellSource, /contentScrollRestorationRef/u);
  assert.match(shellSource, /const routeScrollRestoration = contentScrollRestorationRef\.current/u);
  assert.match(shellSource, /scrollRequestToken/u);
  assert.doesNotMatch(
    shellSource,
    /contentScrollRestorationRef\.current\s*\?\.onScrollTopChange/u,
  );
  assert.match(shellSource, /previousContentFocusKeyRef/u);
  assert.match(shellSource, /pendingContentFocusKeyRef/u);
  assert.doesNotMatch(
    shellSource,
    /setTimeout\([^)]*focus|focus\([^)]*setTimeout/u,
  );
});

test('embedded Field Operations delegates navigation to the unified host', () => {
  assert.match(fieldOpsSource, /data-navigation-owner=\{embedded \? 'host' : 'track-c'\}/u);
  assert.match(fieldOpsSource, /\{embedded \? null : \(\s*<nav/u);
  assert.match(fieldOpsStyles, /\.track-c-shell\.is-embedded \.track-c-nav/u);
  assert.match(fieldOpsStyles, /display:\s*none/u);
});

test('primary Plus disposition keeps Note native and blocks unaccepted legacy handoffs', () => {
  assert.equal(TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS.note.availability, 'available');
  for (const action of ['camera', 'photos', 'files', 'paste-text', 'import-work']) {
    assert.equal(
      TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS[action].availability,
      'unavailable',
      `${action} must not enter a legacy primary route.`,
    );
  }
  assert.match(plusSource, /actionAvailability\?\.\[action\]/u);
  assert.match(plusSource, /disabled=\{unavailable\}/u);
  assert.match(plusSource, /Unavailable in this candidate/u);
});

test('safe-area, theme, target, input and detail-scroll contracts remain explicit', () => {
  assert.match(shellStyles, /min-block-size:\s*44px/u);
  assert.match(shellStyles, /min-inline-size:\s*44px/u);
  assert.match(shellStyles, /font-size:\s*max\(16px,\s*1em\)/u);
  assert.match(shellStyles, /data-turn-profile-scroll/u);
  assert.match(shellStyles, /data-turn-privacy-scroll/u);
  assert.match(shellStyles, /safe-area-inset-bottom/u);
  assert.match(fieldOpsStyles, /overflow-x:\s*clip/u);
  assert.match(fieldOpsStyles, /safe-area-inset-bottom/u);
  assert.match(fieldOpsStyles, /font-size:\s*max\(16px,\s*1em\)/u);
});
