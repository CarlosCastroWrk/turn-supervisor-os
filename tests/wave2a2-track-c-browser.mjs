import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4214;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave2a2-track-c/preview.html';
const dependencyRoot = process.env.PDS_DEPENDENCY_ROOT ?? process.cwd();
const playwrightRoot = process.env.PDS_PLAYWRIGHT_ROOT ?? dependencyRoot;
const viteRoot = process.env.PDS_VITE_ROOT ?? dependencyRoot;
const uiDependencyRoot = process.env.PDS_UI_DEPENDENCY_ROOT ?? viteRoot;
const playwrightRequire = createRequire(resolve(playwrightRoot, 'package.json'));
const viteRequire = createRequire(resolve(viteRoot, 'package.json'));
const uiRequire = createRequire(resolve(uiDependencyRoot, 'package.json'));
const playwrightEntry = resolve(
  dirname(playwrightRequire.resolve('playwright')),
  'index.mjs',
);
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(
  pathToFileURL(viteRequire.resolve('vite')).href
);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a2-track-c-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [
      resolve(
        process.cwd(),
        'src/features/wave2a2-track-c/preview.html',
      ),
    ],
  },
  resolve: {
    alias: [
      {
        find: 'react/jsx-dev-runtime',
        replacement: uiRequire.resolve('react/jsx-dev-runtime'),
      },
      {
        find: 'react/jsx-runtime',
        replacement: uiRequire.resolve('react/jsx-runtime'),
      },
      {
        find: 'react-dom/client',
        replacement: uiRequire.resolve('react-dom/client'),
      },
      { find: 'lucide-react', replacement: uiRequire.resolve('lucide-react') },
      { find: 'react', replacement: uiRequire.resolve('react') },
    ],
  },
  server: { host, port, strictPort: true },
});

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) =>
    findings.push(`pageerror: ${error.message}`)
  );
  page.on('requestfailed', (request) => {
    findings.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
  });
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="track-c-field-ops"]');
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      shellClientWidth: shell?.clientWidth ?? 0,
      shellScrollWidth: shell?.scrollWidth ?? 0,
    };
  });
  assert.ok(
    dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
    `${label} document overflowed: ${dimensions.documentScrollWidth}px > ${dimensions.documentClientWidth}px.`,
  );
  assert.ok(
    dimensions.shellScrollWidth <= dimensions.shellClientWidth + 1,
    `${label} feature overflowed: ${dimensions.shellScrollWidth}px > ${dimensions.shellClientWidth}px.`,
  );
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-track-c-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} rendered no critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no bounds.`);
    assert.ok(
      box.height >= 43.5 && box.width >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertInputFontSize = async (page, label) => {
  const inputs = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):visible, select:visible, textarea:visible',
  );
  const count = await inputs.count();
  for (let index = 0; index < count; index += 1) {
    const size = await inputs.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    assert.ok(size >= 16, `${label} input ${index} used ${size}px text.`);
  }
};

const assertSeveralRowsVisible = async (page, label, minimumRows) => {
  const visibleRows = await page
    .locator('[data-testid="track-c-unit-row"]')
    .evaluateAll((rows) =>
      rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        const visibleHeight =
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        return visibleHeight >= 44;
      }).length
    );
  assert.ok(
    visibleRows >= minimumRows,
    `${label} showed ${visibleRows} meaningful rows; expected ${minimumRows}.`,
  );
};

const performanceMetrics = async (client) => {
  const response = await client.send('Performance.getMetrics');
  return Object.fromEntries(
    response.metrics.map((metric) => [metric.name, metric.value]),
  );
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    {
      name: 'iphone-320',
      minimumRows: 2,
      viewport: { width: 320, height: 568 },
      colorScheme: 'dark',
    },
    {
      name: 'iphone-390',
      minimumRows: 3,
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    },
    {
      name: 'iphone-430',
      minimumRows: 4,
      viewport: { width: 430, height: 932 },
      colorScheme: 'dark',
    },
    {
      name: 'ipad-landscape',
      minimumRows: 5,
      viewport: { width: 1024, height: 768 },
      colorScheme: 'light',
    },
    {
      name: 'mac',
      minimumRows: 7,
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    },
  ]) {
    const context = await browser.newContext({
      viewport: target.viewport,
      colorScheme: target.colorScheme,
    });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard companion' }).waitFor();
    assert.equal(await page.locator('[data-testid="track-c-unit-row"]').count(), 8);
    assert.equal(
      await page.locator('[data-unit-id="unit-301"] strong').first().textContent(),
      '301',
    );
    assert.equal(
      await page.locator('[data-unit-id="unit-301"]').getByText('Paint', { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.locator('[data-unit-id="unit-301"]').getByText('Clean', { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('button', { name: /Approve Unit|Unit Done/i }).count(),
      0,
    );
    await assertSeveralRowsVisible(page, target.name, target.minimumRows);
    await assertNoHorizontalOverflow(page, `${target.name} compact board`);
    await assertCriticalTargets(page, `${target.name} compact board`);
    await assertInputFontSize(page, `${target.name} compact board`);

    const screenshot = `/private/tmp/wave2a2-track-c-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    assert.deepEqual(
      findings,
      [],
      `${target.name} runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  const scaleContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const scalePage = await scaleContext.newPage();
  const scaleFindings = attachRuntimeChecks(scalePage);
  const scaleClient = await scaleContext.newCDPSession(scalePage);
  await scaleClient.send('Performance.enable');
  await scaleClient.send('HeapProfiler.enable');

  const scaleRenderStartedAt = performance.now();
  await scalePage.goto(`${baseUrl}${previewPath}?scale=500`, {
    waitUntil: 'networkidle',
  });
  await scalePage
    .getByRole('heading', { name: 'TurnBoard companion' })
    .waitFor();
  const scaleRenderMs = performance.now() - scaleRenderStartedAt;
  assert.equal(
    await scalePage.locator('[data-testid="track-c-unit-row"]').count(),
    500,
    'The scale gate must render the complete 500-Unit board.',
  );
  assert.ok(
    scaleRenderMs < 10_000,
    `500-Unit board rendered in ${scaleRenderMs.toFixed(0)}ms.`,
  );

  const scaleList = scalePage.locator('.track-c-unit-list');
  const scrollDimensions = await scaleList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert.ok(
    scrollDimensions.scrollHeight > scrollDimensions.clientHeight * 20,
    'The 500-Unit board did not expose a meaningfully scrollable list.',
  );
  await scaleList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await scalePage.getByRole('button', { name: 'Open Unit 1500' }).waitFor();
  assert.equal(
    await scalePage
      .getByRole('button', { name: 'Open Unit 1500' })
      .isVisible(),
    true,
  );

  const scaleSearch = scalePage.getByPlaceholder('Search Units or crews');
  const searchStartedAt = performance.now();
  await scaleSearch.fill('1499');
  await scalePage.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="track-c-unit-row"]').length === 1,
  );
  const searchMs = performance.now() - searchStartedAt;
  assert.equal(
    await scalePage.locator('[data-testid="track-c-unit-row"]').count(),
    1,
  );
  assert.equal(
    await scalePage.getByRole('button', { name: 'Open Unit 1499' }).count(),
    1,
  );
  assert.ok(
    searchMs < 4_000,
    `500-Unit search completed in ${searchMs.toFixed(0)}ms.`,
  );
  await scaleSearch.fill('');
  await scalePage.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="track-c-unit-row"]').length ===
      500,
  );

  await scaleClient.send('HeapProfiler.collectGarbage');
  const beforeRepeatMetrics = await performanceMetrics(scaleClient);
  for (const query of ['1001', '1250', '1499', 'unit-not-found', '']) {
    await scaleSearch.fill(query);
  }
  await scalePage.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="track-c-unit-row"]').length ===
      500,
  );
  await scaleClient.send('HeapProfiler.collectGarbage');
  const afterRepeatMetrics = await performanceMetrics(scaleClient);
  const heapUsed = afterRepeatMetrics.JSHeapUsedSize ?? Number.POSITIVE_INFINITY;
  const heapGrowth =
    heapUsed - (beforeRepeatMetrics.JSHeapUsedSize ?? heapUsed);
  assert.ok(
    heapUsed < 128 * 1024 * 1024,
    `500-Unit board retained ${(heapUsed / 1024 / 1024).toFixed(1)} MB of JS heap.`,
  );
  assert.ok(
    heapGrowth < 32 * 1024 * 1024,
    `Repeated 500-Unit search retained ${(heapGrowth / 1024 / 1024).toFixed(1)} MB of additional JS heap.`,
  );
  assert.ok(
    (afterRepeatMetrics.Nodes ?? Number.POSITIVE_INFINITY) < 50_000,
    `500-Unit board rendered ${afterRepeatMetrics.Nodes} DOM nodes.`,
  );
  await assertNoHorizontalOverflow(scalePage, '500-Unit compact board');
  await assertInputFontSize(scalePage, '500-Unit compact board');

  const scaleScreenshot = '/private/tmp/wave2a2-track-c-500-unit.png';
  await scalePage.screenshot({ path: scaleScreenshot, fullPage: false });
  screenshots.push(scaleScreenshot);
  assert.deepEqual(
    scaleFindings,
    [],
    `500-Unit runtime findings:\n${scaleFindings.join('\n')}`,
  );
  await scaleContext.close();

  const zeroContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const zeroPage = await zeroContext.newPage();
  const zeroFindings = attachRuntimeChecks(zeroPage);
  await zeroPage.goto(`${baseUrl}${previewPath}?scenario=walk-zero#/walk`, {
    waitUntil: 'networkidle',
  });
  await zeroPage
    .getByRole('heading', { name: 'No work is ready to walk.' })
    .waitFor();
  assert.equal(
    await zeroPage.getByText(
      'Work appears here after Los passes the relevant Paint or Clean inspection.',
      { exact: true },
    ).count(),
    1,
  );
  assert.equal(
    await zeroPage.getByRole('button', { name: 'Return to TurnBoard' }).count(),
    1,
  );
  assert.equal(
    await zeroPage
      .getByRole('button', { name: 'View work needing inspection' })
      .count(),
    1,
  );
  assert.equal(
    await zeroPage.locator('.track-c-form-stack').count(),
    0,
    'The zero state must not render the long Start Walk form.',
  );
  await assertNoHorizontalOverflow(zeroPage, 'Walk zero state');
  await assertCriticalTargets(zeroPage, 'Walk zero state');
  assert.deepEqual(
    zeroFindings,
    [],
    `Walk zero-state runtime findings:\n${zeroFindings.join('\n')}`,
  );
  await zeroContext.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Open Unit 707' }).click();
  const unitDetail = page.locator('[data-testid="track-c-unit-detail"]');
  await unitDetail.getByRole('heading', { name: 'Unit 707' }).waitFor();
  assert.equal(
    await unitDetail.locator('.track-c-trade-panel.is-paint .track-c-section-row').count(),
    3,
  );
  assert.equal(
    await unitDetail.locator('.track-c-trade-panel.is-clean .track-c-section-row').count(),
    3,
  );
  assert.equal(
    await unitDetail
      .locator('.track-c-section-row__section')
      .filter({ hasText: /^C$/ })
      .count(),
    0,
  );
  await assertNoHorizontalOverflow(page, 'Unit 707 detail');
  await unitDetail.getByRole('button', { name: 'Back to compact TurnBoard' }).click();

  await page.getByRole('button', { name: 'Open Unit 401' }).click();
  await unitDetail.getByRole('heading', { name: 'Unit 401' }).waitFor();
  const blockedCleanSection = unitDetail
    .locator('.track-c-trade-panel.is-clean .track-c-section-row')
    .filter({
      has: page.locator('.track-c-section-row__section', { hasText: /^B$/ }),
    });
  await blockedCleanSection.locator('.track-c-section-row__trigger').click();
  await blockedCleanSection.getByText(/Do not enter or inspect/i).waitFor();
  const recordBlockedCrewReport = blockedCleanSection.getByRole('button', {
    name: 'Record crew completion report',
  });
  assert.equal(await recordBlockedCrewReport.count(), 1);
  assert.equal(
    await blockedCleanSection.getByRole('button', { name: /Los pass/i }).count(),
    0,
  );
  await recordBlockedCrewReport.click();
  await page
    .getByText(/Personal section record saved/i)
    .waitFor();
  assert.equal(
    await blockedCleanSection.getByText('Needs Los inspection', {
      exact: true,
    }).count(),
    1,
  );
  assert.equal(
    await blockedCleanSection.getByRole('button', { name: /Los pass/i }).count(),
    0,
    'Blocked access must still prevent Los inspection after recording crew evidence.',
  );
  await unitDetail.getByRole('button', { name: 'Back to compact TurnBoard' }).click();

  const navigation = page.getByRole('navigation', {
    name: 'Track C field operations',
  });
  await navigation.getByRole('button', { name: 'Crews' }).click();
  assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Open Bluebird Paint detail' }).click();
  await page.getByRole('heading', { name: 'Bluebird Paint' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 1);
  assert.equal(await page.getByText(/ranking|payroll|payment eligibility/i).count() >= 1, true);
  await assertNoHorizontalOverflow(page, 'Crew detail');

  await navigation.getByRole('button', { name: 'Assign' }).click();
  await page.getByLabel('Compatible crew').selectOption('crew-bluebird-paint');
  const unitChoice = page
    .locator('fieldset.track-c-choice-list label')
    .filter({ hasText: 'Unit 707' })
    .first();
  await unitChoice.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Review personal proposal' }).click();
  const proposal = page.getByRole('region', {
    name: 'Assignment proposal review',
  });
  await proposal.waitFor();
  assert.equal(await proposal.getByText(/3 eligible/).count(), 1);
  await proposal.getByRole('button', { name: 'Confirm personal assignment' }).click();
  await page.getByText(/3 personal assignment records saved/).waitFor();

  await navigation.getByRole('button', { name: 'Walk' }).click();
  await page
    .getByLabel('Property Contact')
    .selectOption('contact-jordan-lee');
  const candidateRows = page.locator('.track-c-walk-candidates > label');
  assert.ok((await candidateRows.count()) >= 2);
  const paintCandidate = candidateRows.filter({ hasText: 'Paint' }).first();
  const cleanCandidate = candidateRows.filter({ hasText: 'Clean' }).first();
  await paintCandidate.locator('input').check();
  await cleanCandidate.locator('input').check();
  await page.locator('.track-c-confirm-row input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Review Walk' }).click();
  await page.getByRole('heading', { name: 'Review Walk' }).waitFor();
  assert.equal(
    await page.getByText('Jordan Lee', { exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Start Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Active Walk' }).waitFor();
  assert.match(page.url(), /#\/walk\/track-c-walk[_-]/u);
  assert.equal(
    await page.evaluate(() =>
      window.__trackCPreview?.walkLifecycleEvents[0]?.type),
    'started',
  );
  const walkItems = page.locator('.track-c-walk-items > section');
  assert.equal(await walkItems.count(), 2);
  await walkItems.nth(0).getByRole('button', { name: 'Accepted' }).click();
  await walkItems
    .nth(0)
    .getByLabel('Optional note')
    .fill('Accepted during the walkthrough.');
  await walkItems
    .nth(1)
    .getByRole('button', { name: 'Correction requested' })
    .click();
  await walkItems
    .nth(1)
    .getByLabel('Optional note')
    .fill('Touch-up requested behind the door.');
  await navigation.getByRole('button', { name: 'TurnBoard' }).click();
  await page.getByRole('heading', { name: 'TurnBoard companion' }).waitFor();
  await navigation.getByRole('button', { name: 'Walk' }).click();
  await page.getByRole('heading', { name: 'Active Walk' }).waitFor();
  assert.match(page.url(), /#\/walk\/track-c-walk[_-]/u);
  assert.equal(
    await walkItems
      .nth(0)
      .getByRole('button', { name: 'Accepted' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await walkItems
      .nth(1)
      .getByRole('button', { name: 'Correction requested' })
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Active Walk' }).waitFor();
  assert.match(page.url(), /#\/walk\/track-c-walk[_-]/u);
  assert.equal(
    await walkItems
      .nth(0)
      .getByRole('button', { name: 'Accepted' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await walkItems.nth(0).getByLabel('Optional note').inputValue(),
    'Accepted during the walkthrough.',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Review End Walk' })
      .isEnabled(),
    true,
  );
  await page.getByRole('button', { name: 'Review End Walk' }).click();
  await page.getByRole('heading', { name: 'Review End Walk' }).waitFor();
  assert.equal(
    await page.getByText('Open callbacks after End Walk').count(),
    1,
  );
  assert.equal(
    await page.getByText('Accepted during the walkthrough.').count(),
    1,
  );
  await page
    .getByRole('button', { name: 'Open official Turn Sign-Off' })
    .click();
  assert.equal(
    await page.evaluate(() => window.__trackCPreview?.signOffRequests.length),
    1,
  );
  await page.getByRole('button', { name: 'Continue Walk' }).click();
  await page.getByRole('heading', { name: 'Active Walk' }).waitFor();
  await page.getByRole('button', { name: 'Review End Walk' }).click();
  await page.getByRole('button', { name: 'End Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Latest walk' }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      window.__trackCPreview?.walkLifecycleEvents.at(-1)?.type),
    'ended',
  );
  assert.equal(await page.getByText('Eligible personal paper mirrors').count(), 1);
  const mirrorButton = page.locator('.track-c-mirror-list button').first();
  await mirrorButton.click();
  const mirrorDialog = page.getByRole('dialog', {
    name: 'Confirm personal mirror',
  });
  await mirrorDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  const cancelMirror = mirrorDialog.getByRole('button', { name: 'Cancel' });
  const confirmMirror = mirrorDialog.getByRole('button', {
    name: 'Confirm personal mirror',
  });
  assert.equal(
    await cancelMirror.evaluate((element) => element === document.activeElement),
    true,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        '.track-c-shell__header',
        '.track-c-shell__main',
        '.track-c-nav',
      ].map((selector) => {
        const element = document.querySelector(selector);
        return {
          ariaHidden: element?.getAttribute('aria-hidden'),
          inert: element?.inert,
        };
      })
    ),
    [
      { ariaHidden: 'true', inert: true },
      { ariaHidden: 'true', inert: true },
      { ariaHidden: 'true', inert: true },
    ],
  );
  await page.locator('.track-c-nav button').first().evaluate((element) => {
    element.focus();
  });
  assert.equal(
    await cancelMirror.evaluate((element) => element === document.activeElement),
    true,
    'An inert background control must not take focus.',
  );
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await confirmMirror.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await cancelMirror.evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Escape');
  await mirrorDialog.waitFor({ state: 'detached' });
  await page.waitForFunction(
    (selector) => document.activeElement?.matches(selector),
    '.track-c-mirror-list button',
  );
  assert.equal(
    await mirrorButton.evaluate((element) => element === document.activeElement),
    true,
    'Escape must close and restore focus to the invoking control.',
  );

  await mirrorButton.click();
  await mirrorDialog.waitFor();
  await cancelMirror.click();
  await page.waitForFunction(
    (selector) => document.activeElement?.matches(selector),
    '.track-c-mirror-list button',
  );
  assert.equal(
    await mirrorButton.evaluate((element) => element === document.activeElement),
    true,
  );
  await mirrorButton.click();
  await mirrorDialog.waitFor();
  await confirmMirror.click();
  await page.getByText(/Personal PDS Approved paper mirror recorded/).waitFor();
  assert.equal(
    await page.getByText(/paper TurnBoard/).count() >= 1,
    true,
  );

  await assertNoHorizontalOverflow(page, 'interactive flow');
  await assertCriticalTargets(page, 'interactive flow');
  await assertInputFontSize(page, 'interactive flow');
  assert.deepEqual(
    findings,
    [],
    `interactive runtime findings:\n${findings.join('\n')}`,
  );
  await context.close();

  console.log(
    `Wave 2A.2 Track C browser gate passed. Screenshots: ${screenshots.join(', ')}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
