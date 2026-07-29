import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4241;
const baseUrl = `http://${host}:${port}`;
const shellPort = 4242;
const shellBaseUrl = `http://${host}:${shellPort}`;
const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const shellHarnessRoot = await mkdtemp('/private/tmp/pds-wave2a21-track-c-shell-');
const unifiedShellPath = resolve(
  repoRoot,
  'src/features/wave2a2-track-a/UnifiedShell.tsx',
);
const tabRouteMemoryPath = resolve(
  repoRoot,
  'src/features/wave2a21-track-c/tabRouteMemory.ts',
);
const viewports = [
  { height: 700, name: 'iPhone-320', width: 320 },
  { height: 844, name: 'iPhone-390', width: 390 },
  { height: 932, name: 'iPhone-430', width: 430 },
  { height: 768, name: 'iPad-landscape', width: 1024 },
  { height: 900, name: 'Mac', width: 1440 },
];

const createPage = async (
  browser,
  viewport,
  colorScheme = 'light',
  reducedMotion = 'no-preference',
) => {
  const context = await browser.newContext({
    colorScheme,
    reducedMotion,
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();
  const findings = [];
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  return { context, findings, page };
};

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

const assertNoOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const shellHarnessHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Track C shell regression</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`;

const shellHarnessMain = `
import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Wave2A2UnifiedShell } from ${JSON.stringify(unifiedShellPath)};
import {
  captureTrackCTransientOrigin,
  createTrackCTabRouteMemory,
  getTrackCCurrentTabRoute,
  rememberTrackCTabRoute,
  rememberTrackCTabScroll,
  restoreTrackCTransientOrigin,
  selectTrackCPrimaryTab,
} from ${JSON.stringify(tabRouteMemoryPath)};

const roots = {
  activity: 'activity:root',
  home: 'home:root',
  more: 'more:root',
  turnboard: 'turnboard:root',
};

const routeLabel = (routeKey) => routeKey
  .split(':')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

function ScrollRoute({ routeKey, onOpenDetail }) {
  return (
    <section aria-label={routeLabel(routeKey)}>
      <h1>{routeLabel(routeKey)}</h1>
      {routeKey.endsWith(':root') ? (
        <button onClick={onOpenDetail} type="button">Open current tab detail</button>
      ) : null}
      <div
        data-route-scroll={routeKey}
        data-turn-scroll-region="primary"
        style={{ blockSize: 180, overflowY: 'auto' }}
      >
        <div style={{ blockSize: 1400, paddingBlockStart: 8 }}>
          Scroll fixture for {routeLabel(routeKey)}
        </div>
      </div>
    </section>
  );
}

function ShellRegressionHarness() {
  const [memory, setMemory] = useState(() => createTrackCTabRouteMemory(roots));
  const [requestToken, setRequestToken] = useState(0);
  const [surface, setSurface] = useState(null);
  const transientOriginRef = useRef(null);
  const currentRoute = getTrackCCurrentTabRoute(memory);
  const routeKey = surface ?? currentRoute.routeKey;

  const rememberScroll = useCallback((scrollTop) => {
    if (surface) return;
    setMemory((state) => rememberTrackCTabScroll(
      state,
      memory.activeTab,
      currentRoute.routeKey,
      scrollTop,
    ));
  }, [currentRoute.routeKey, memory.activeTab, surface]);

  const navigate = (tab) => {
    const decision = selectTrackCPrimaryTab(memory, tab);
    setMemory(decision.state);
    setSurface(null);
    setRequestToken((token) => token + 1);
  };

  const openDetail = () => {
    setMemory((state) => rememberTrackCTabRoute(
      state,
      state.activeTab,
      state.activeTab + ':detail',
    ));
  };

  const openTransient = (nextSurface) => {
    transientOriginRef.current = captureTrackCTransientOrigin(memory, nextSurface);
    setSurface(nextSurface);
  };

  const closeTransient = () => {
    const snapshot = transientOriginRef.current;
    if (!snapshot) return;
    const decision = restoreTrackCTransientOrigin(memory, snapshot);
    setMemory(decision.state);
    setSurface(null);
    setRequestToken((token) => token + 1);
    transientOriginRef.current = null;
  };

  const content = surface ? (
    <section>
      <h1>{surface === 'search' ? 'Search' : 'Notifications'}</h1>
      <button onClick={closeTransient} type="button">
        Return from {surface}
      </button>
    </section>
  ) : (
    <ScrollRoute onOpenDetail={openDetail} routeKey={currentRoute.routeKey} />
  );

  return (
    <>
      <Wave2A2UnifiedShell
        activeDestination={memory.activeTab}
        contentFocusKey={routeKey}
        contentScrollRestoration={{
          key: routeKey,
          onScrollTopChange: surface ? undefined : rememberScroll,
          requestToken,
          restore: true,
          scrollTop: surface ? 0 : currentRoute.scrollTop,
        }}
        contentTitle={routeLabel(routeKey)}
        dateLabel="Synthetic QA"
        detailMode={Boolean(surface)}
        notificationCount={2}
        onNavigate={navigate}
        onOpenHome={() => navigate('home')}
        onOpenIntelligence={() => undefined}
        onOpenNotifications={() => openTransient('notifications')}
        onOpenPlus={() => undefined}
        onOpenSearch={() => openTransient('search')}
        propertyName="Synthetic shell"
        theme={{ reducedMotion: false, resolvedTheme: 'light' }}
      >
        {content}
      </Wave2A2UnifiedShell>
      <output
        aria-hidden="true"
        data-testid="shell-route-state"
        style={{ display: 'none' }}
      >
        {JSON.stringify({
          activeTab: memory.activeTab,
          requestToken,
          routeKey,
          scrollTop: surface ? 0 : currentRoute.scrollTop,
        })}
      </output>
    </>
  );
}

createRoot(document.getElementById('root')).render(<ShellRegressionHarness />);
`;

await writeFile(join(shellHarnessRoot, 'index.html'), shellHarnessHtml);
await writeFile(join(shellHarnessRoot, 'main.tsx'), shellHarnessMain);

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a21-track-c-vite',
  configLoader: 'runner',
  envFile: false,
  logLevel: 'error',
  root: process.cwd(),
  server: { host, port, strictPort: true },
});
const shellServer = await createServer({
  logLevel: 'error',
  resolve: {
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: require.resolve('react/jsx-dev-runtime') },
      { find: 'react/jsx-runtime', replacement: require.resolve('react/jsx-runtime') },
      { find: 'react-dom/client', replacement: require.resolve('react-dom/client') },
      { find: 'lucide-react', replacement: require.resolve('lucide-react') },
      { find: 'react', replacement: require.resolve('react') },
    ],
  },
  root: shellHarnessRoot,
  server: {
    fs: { allow: [shellHarnessRoot, repoRoot] },
    host,
    port: shellPort,
    strictPort: true,
  },
});
let browser;

try {
  await server.listen();
  await shellServer.listen();
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const { context, findings, page } = await createPage(browser, viewport);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();

    const homeControl = page.getByRole('button', {
      name: 'Open Home — Turn OS Supervisor',
    });
    assert.equal(await homeControl.count(), 1);

    await primaryNavigation(page)
      .getByRole('button', { exact: true, name: 'TurnBoard' })
      .click();
    await page.locator('[data-testid="track-c-field-ops"]').waitFor();
    assert.equal(
      await page.getByRole('navigation', { name: 'Track C field operations' }).count(),
      0,
      `${viewport.name} rendered a second Field Operations navigator.`,
    );
    assert.equal(
      await page.locator('[data-navigation-owner="host"]').count(),
      1,
    );
    await assertNoOverflow(page, `${viewport.name} TurnBoard`);
    if (viewport.name === 'iPhone-390') {
      await page.screenshot({
        fullPage: true,
        path: '/private/tmp/turn-os-wave2a21-track-c-turnboard-390.png',
      });
    }

    await homeControl.click();
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');
    await page.waitForFunction(() =>
      document.activeElement?.id === 'launch-command-center-main');

    await page.goBack();
    await page.locator('[data-testid="track-c-field-ops"]').waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/units');
    await page.goForward();
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();
    assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');

    assert.deepEqual(
      findings,
      [],
      `${viewport.name} runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  {
    const { context, findings, page } = await createPage(
      browser,
      { height: 844, width: 390 },
      'dark',
      'reduce',
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { exact: true, name: 'Home' }).waitFor();

    const plus = page.getByRole('button', { name: 'Open central Plus menu' });
    await plus.focus();
    await plus.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
    await dialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(
      await dialog.getByRole('button', { name: /^Note(?:\s|$)/u }).isEnabled(),
      true,
    );
    assert.equal(await page.getByText('Field Copilot', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Create Assignment', { exact: true }).count(), 0);
    await page.screenshot({
      fullPage: true,
      path: '/private/tmp/turn-os-wave2a21-track-c-plus-390.png',
    });

    await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await plus.evaluate((element) => document.activeElement === element), true);
    await plus.press('Enter');
    await page.getByRole('dialog', { name: 'Add to Turn OS' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();

    assert.equal(
      await page.locator('[data-testid="launch-command-center-shell"]').getAttribute('data-theme'),
      'dark',
    );
    assert.equal(
      await page.locator('[data-testid="launch-command-center-shell"]')
        .getAttribute('data-reduced-motion'),
      'true',
    );
    await assertNoOverflow(page, 'iPhone-390 dark Plus');
    assert.deepEqual(findings, [], `dark-mode runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  {
    const { context, findings, page } = await createPage(
      browser,
      { height: 844, width: 390 },
    );
    await page.goto(shellBaseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { exact: true, name: 'Home Root' }).waitFor();

    const routeScroll = () => page.locator('[data-turn-scroll-region="primary"]');
    const setScrollTop = async (scrollTop) => {
      await page.evaluate(() => new Promise((resolveFrame) => {
        window.requestAnimationFrame(() => resolveFrame());
      }));
      await routeScroll().evaluate((element, nextScrollTop) => {
        element.scrollTop = nextScrollTop;
        element.dispatchEvent(new Event('scroll'));
      }, scrollTop);
      await page.waitForFunction(
        (expected) =>
          document.querySelector('[data-turn-scroll-region="primary"]')?.scrollTop
            === expected,
        scrollTop,
      );
      await page.waitForFunction(
        (expected) => JSON.parse(
          document.querySelector('[data-testid="shell-route-state"]').textContent,
        ).scrollTop === expected,
        scrollTop,
      );
    };
    const assertScrollTop = async (expected, label) => {
      await page.waitForFunction(
        (expectedScrollTop) =>
          document.querySelector('[data-turn-scroll-region="primary"]')?.scrollTop
            === expectedScrollTop,
        expected,
      );
      assert.equal(
        await routeScroll().evaluate((element) => element.scrollTop),
        expected,
        label,
      );
    };
    const primary = primaryNavigation(page);

    await page.getByRole('button', { name: 'Open current tab detail' }).click();
    await page.getByRole('heading', { exact: true, name: 'Home Detail' }).waitFor();
    await setScrollTop(420);

    await primary.getByRole('button', { exact: true, name: 'Activity' }).click();
    await page.getByRole('heading', { exact: true, name: 'Activity Root' }).waitFor();
    await page.waitForFunction(() =>
      document.activeElement?.id === 'launch-command-center-main');
    await page.getByRole('button', { name: 'Open current tab detail' }).click();
    await page.getByRole('heading', { exact: true, name: 'Activity Detail' }).waitFor();
    await setScrollTop(260);

    await primary.getByRole('button', { exact: true, name: 'Home' }).click();
    await page.getByRole('heading', { exact: true, name: 'Home Detail' }).waitFor();
    await assertScrollTop(420, 'Tab A did not restore its exact scroll position.');

    await page.getByRole('button', { name: 'Open Search' }).click();
    await page.getByRole('heading', { exact: true, name: 'Search' }).waitFor();
    await page.getByRole('button', { name: 'Return from search' }).click();
    await page.getByRole('heading', { exact: true, name: 'Home Detail' }).waitFor();
    await assertScrollTop(420, 'Search did not return to the exact origin scroll.');

    await page.getByRole('button', { name: /Open notifications/u }).click();
    await page.getByRole('heading', { exact: true, name: 'Notifications' }).waitFor();
    await page.getByRole('button', { name: 'Return from notifications' }).click();
    await page.getByRole('heading', { exact: true, name: 'Home Detail' }).waitFor();
    await assertScrollTop(
      420,
      'Notifications did not return to the exact origin scroll.',
    );

    await primary.getByRole('button', { exact: true, name: 'Home' }).click();
    await page.getByRole('heading', { exact: true, name: 'Home Root' }).waitFor();
    await assertScrollTop(0, 'Active-tab detail retap did not return to the root top.');
    await setScrollTop(180);
    const tokenBeforeRetap = JSON.parse(
      await page.getByTestId('shell-route-state').textContent(),
    ).requestToken;
    await primary.getByRole('button', { exact: true, name: 'Home' }).click();
    await page.waitForFunction(
      (previousToken) => JSON.parse(
        document.querySelector('[data-testid="shell-route-state"]').textContent,
      ).requestToken > previousToken,
      tokenBeforeRetap,
    );
    await assertScrollTop(
      0,
      'Same-tab root retap did not rerun zero-scroll restoration.',
    );
    await page.waitForFunction(() => JSON.parse(
      document.querySelector('[data-testid="shell-route-state"]').textContent,
    ).scrollTop === 0);

    await page.screenshot({
      fullPage: false,
      path: '/private/tmp/turn-os-wave2a21-track-c-shell-regression-390.png',
    });
    assert.deepEqual(
      findings,
      [],
      `shell regression runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  console.log('Wave 2A.2.1 Track C browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
  await shellServer.close();
  await rm(shellHarnessRoot, { force: true, recursive: true });
}
