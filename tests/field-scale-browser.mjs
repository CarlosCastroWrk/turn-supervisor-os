import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path, { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4178;
const baseUrl = `http://${host}:${port}`;
const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const harnessRoot = await mkdtemp('/private/tmp/pds-jul28-scale-');
const screenshotDirectory = await mkdtemp('/private/tmp/pds-jul28-scale-shots-');
const appPath = resolve(repoRoot, 'src/App.tsx');
const stylesPath = resolve(repoRoot, 'src/styles.css');
const toastProviderPath = resolve(repoRoot, 'src/components/ToastProvider.tsx');
const actionsPath = resolve(repoRoot, 'src/lib/actions.ts');
const seedPath = resolve(repoRoot, 'src/data/seed.ts');
const syntheticUnitCount = 300;
const maxInitialRenderMs = 4_000;
const maxInteractionMs = 1_000;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>July 28 Field Scale</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`;

const main = `
import React, { Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from ${JSON.stringify(toastProviderPath)};
import { createRealTurnProject } from ${JSON.stringify(actionsPath)};
import { seedData } from ${JSON.stringify(seedPath)};
import ${JSON.stringify(stylesPath)};

const scaleData = createRealTurnProject(structuredClone(seedData), {
  projectName: 'QA 300 Unit Launch Turn',
  propertyName: 'Synthetic Scale Property',
  location: 'Synthetic browser test',
  startDate: '2026-07-27',
  endDate: '2026-08-15',
  supervisorName: 'QA Los',
  projectManagerName: 'QA Manager',
  buildingNames: ['Building A'],
  buildingCount: 1,
  floorsPerBuilding: 15,
  unitsPerFloor: 20,
  firstUnitNumber: 101,
  bedCount: 4,
  bathroomCount: 4,
  hasCommonArea: true,
  notes: 'Synthetic 300-Unit browser fixture.',
});
localStorage.setItem('turn-supervisor-os:v0.1', JSON.stringify(scaleData));
const { default: App } = await import(${JSON.stringify(appPath)});
const profileEvents = [];
globalThis.__pdsScaleProfileEvents = profileEvents;

const recordProfile = (_id, phase, actualDuration, baseDuration) => {
  profileEvents.push({ phase, actualDuration, baseDuration });
};

createRoot(document.getElementById('root')).render(
  <Profiler id="scale-app" onRender={recordProfile}>
    <ToastProvider>
      <App />
    </ToastProvider>
  </Profiler>
);
`;

await writeFile(join(harnessRoot, 'index.html'), html);
await writeFile(join(harnessRoot, 'main.tsx'), main);

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
    `${label} document overflowed: ${dimensions.documentScrollWidth}px > ${dimensions.documentClientWidth}px.`,
  );
};

const waitForUnitRowCount = (page, expectedCount) => page.waitForFunction(
  (count) => document.querySelectorAll('[data-testid="track-c-unit-row"]').length === count,
  expectedCount,
);

const server = await createServer({
  root: harnessRoot,
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
  server: {
    host,
    port,
    strictPort: true,
    fs: { allow: [harnessRoot, repoRoot] },
  },
});

let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const warmupContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const warmupPage = await warmupContext.newPage();
  await warmupPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await warmupPage.getByTestId('track-c-field-ops').waitFor();
  await warmupContext.close();

  const results = {};

  for (const target of [
    { name: 'mac-300', viewport: { width: 1440, height: 900 } },
    { name: 'ipad-300', viewport: { width: 1024, height: 768 } },
    { name: 'iphone-300', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);
    const startedAt = performance.now();

    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByTestId('track-c-field-ops').waitFor();
    const loadMs = Math.round(performance.now() - startedAt);
    assert.equal(await page.getByTestId('track-c-unit-row').count(), syntheticUnitCount);
    assert.ok(
      loadMs < maxInitialRenderMs,
      `${target.name} needed ${loadMs}ms to render ${syntheticUnitCount} synthetic Units (limit ${maxInitialRenderMs}ms).`,
    );
    assert.equal(
      await page.getByRole('button', { name: /property accepted|property rejected|PDS Approved|mark done/i }).count(),
      0,
      `${target.name} exposed an unauthorized operational mutation.`,
    );
    await assertNoHorizontalOverflow(page, target.name);

    const search = page.getByPlaceholder('Search Units or crews');
    await search.click();
    const searchStartedAt = performance.now();
    await search.type('1301');
    await waitForUnitRowCount(page, 1);
    const searchTypingMs = Math.round(performance.now() - searchStartedAt);
    assert.ok(
      searchTypingMs < maxInteractionMs,
      `${target.name} search typing needed ${searchTypingMs}ms (limit ${maxInteractionMs}ms).`,
    );

    const filterStartedAt = performance.now();
    await search.fill('unit-not-found');
    await waitForUnitRowCount(page, 0);
    const filterResponseMs = Math.round(performance.now() - filterStartedAt);
    assert.ok(
      filterResponseMs < maxInteractionMs,
      `${target.name} no-match search response needed ${filterResponseMs}ms (limit ${maxInteractionMs}ms).`,
    );

    await search.fill('');
    await waitForUnitRowCount(page, syntheticUnitCount);
    await page.evaluate(() => {
      globalThis.__pdsScaleProfileEvents.length = 0;
    });
    const unitButton = page.getByRole('button', { name: 'Open Unit 101', exact: true });
    const unitId = await unitButton.getAttribute('data-unit-id');
    assert.ok(unitId, `${target.name} could not resolve the active AppData Unit identity.`);
    const unitOpenStartedAt = performance.now();
    await unitButton.click();
    await page.getByRole('heading', { name: 'Unit 101', exact: true }).waitFor();
    const unitOpenMs = Math.round(performance.now() - unitOpenStartedAt);
    assert.ok(
      unitOpenMs < maxInteractionMs,
      `${target.name} Unit opening needed ${unitOpenMs}ms (limit ${maxInteractionMs}ms).`,
    );
    assert.equal(
      await page.evaluate(() => window.location.hash),
      '#/units',
      `${target.name} changed the host route while opening the embedded Unit workspace.`,
    );
    assert.equal(
      await page.getByTestId('track-c-unit-row').count(),
      0,
      `${target.name} kept the full synthetic board mounted beneath the Unit workspace.`,
    );
    const memoProfile = await page.evaluate(() => {
      const updates = globalThis.__pdsScaleProfileEvents
        .filter((event) => event.phase === 'update' || event.phase === 'nested-update');
      const actualDurationMs = updates.reduce((total, event) => total + event.actualDuration, 0);
      const baseDurationMs = Math.max(...updates.map((event) => event.baseDuration), 0);
      return {
        updateCount: updates.length,
        actualDurationMs,
        baseDurationMs,
        ratio: baseDurationMs > 0 ? actualDurationMs / baseDurationMs : 1,
      };
    });
    assert.ok(memoProfile.updateCount > 0, `${target.name} did not record the Unit-open render.`);
    await page.getByText(
      'Release, crew report, Los inspection, property acceptance, and paper mirror remain separate.',
      { exact: true },
    ).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} selected workspace`);

    const screenshot = path.join(screenshotDirectory, `${target.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    results[target.name] = {
      loadMs,
      searchTypingMs,
      filterResponseMs,
      unitOpenMs,
      memoProfile: {
        updateCount: memoProfile.updateCount,
        actualDurationMs: Math.round(memoProfile.actualDurationMs),
        baseDurationMs: Math.round(memoProfile.baseDurationMs),
        ratio: Number(memoProfile.ratio.toFixed(3)),
      },
      screenshot,
    };
    await context.close();
  }

  console.log(JSON.stringify({
    unitCount: syntheticUnitCount,
    thresholdsMs: {
      initialRender: maxInitialRenderMs,
      interaction: maxInteractionMs,
    },
    results,
  }));
} finally {
  await browser?.close();
  await server.close();
  await rm(harnessRoot, { recursive: true, force: true });
}
