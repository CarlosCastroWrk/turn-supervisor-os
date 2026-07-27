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
const repositoryPath = resolve(repoRoot, 'src/features/jul28-turnboard/syntheticRepository.ts');
const syntheticUnitCount = 300;
const assignmentConflictCount = 75;
const maxInitialRenderMs = 4_000;
const maxInteractionMs = 1_000;
const maxMemoizedOpenRatio = 0.65;

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
import { jul28SyntheticTurnBoardRepository } from ${JSON.stringify(repositoryPath)};
import ${JSON.stringify(stylesPath)};

const templates = jul28SyntheticTurnBoardRepository.listUnits();
const units = Array.from({ length: ${syntheticUnitCount} }, (_, index) => {
  const template = structuredClone(templates[index % templates.length]);
  const unitId = \`jul28-scale-unit-\${index + 1}\`;
  const unitNumber = String(1001 + index);
  return {
    ...template,
    id: unitId,
    unitNumber,
    buildingLabel: \`Building \${String.fromCharCode(65 + Math.floor(index / 100))}\`,
    floorLabel: \`Level \${String(Math.floor(index / 20) + 1).padStart(2, '0')}\`,
    records: template.records.map((record, recordIndex) => ({
      ...record,
      id: \`\${unitId}:\${record.trade}:\${record.section}\`,
      unitId,
      assignmentEpisodes: record.assignmentEpisodes.map((episode, episodeIndex) => ({
        ...episode,
        id: \`\${unitId}:episode:\${recordIndex}:\${episodeIndex}\`,
      })),
      history: record.history.map((event, eventIndex) => ({
        ...event,
        id: \`\${unitId}:history:\${recordIndex}:\${eventIndex}\`,
      })),
    })),
  };
});
const byId = new Map(units.map((unit) => [unit.id, unit]));
const repository = {
  source: 'synthetic-jul28-pattern-candidate',
  listUnits: () => units,
  getUnit: (unitId) => byId.get(unitId),
};

Object.assign(jul28SyntheticTurnBoardRepository, repository);
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
  (count) => document.querySelectorAll('[data-testid="wave1r-unit-row"]').length === count,
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
  await warmupPage.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
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
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    const loadMs = Math.round(performance.now() - startedAt);
    assert.equal(await page.getByTestId('wave1r-unit-row').count(), syntheticUnitCount);
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

    const search = page.getByPlaceholder('Search units or crew');
    await search.click();
    const searchStartedAt = performance.now();
    await search.type('1300');
    await waitForUnitRowCount(page, 1);
    const searchTypingMs = Math.round(performance.now() - searchStartedAt);
    assert.ok(
      searchTypingMs < maxInteractionMs,
      `${target.name} search typing needed ${searchTypingMs}ms (limit ${maxInteractionMs}ms).`,
    );

    await search.fill('');
    await waitForUnitRowCount(page, syntheticUnitCount);
    const conflictFilter = page.getByRole('button', {
      name: `Assignment conflict ${assignmentConflictCount}`,
      exact: true,
    });
    const filterStartedAt = performance.now();
    await conflictFilter.click();
    await waitForUnitRowCount(page, assignmentConflictCount);
    const filterResponseMs = Math.round(performance.now() - filterStartedAt);
    assert.ok(
      filterResponseMs < maxInteractionMs,
      `${target.name} filter response needed ${filterResponseMs}ms (limit ${maxInteractionMs}ms).`,
    );

    await page.getByRole('button', { name: /^All\b/ }).click();
    await waitForUnitRowCount(page, syntheticUnitCount);
    await page.evaluate(() => {
      globalThis.__pdsScaleProfileEvents.length = 0;
    });
    const unitOpenStartedAt = performance.now();
    await page.getByRole('button', { name: 'Open Unit 1001', exact: true }).click();
    await page.getByRole('heading', { name: 'Unit 1001', exact: true }).waitFor();
    const unitOpenMs = Math.round(performance.now() - unitOpenStartedAt);
    assert.ok(
      unitOpenMs < maxInteractionMs,
      `${target.name} Unit opening needed ${unitOpenMs}ms (limit ${maxInteractionMs}ms).`,
    );
    assert.equal(
      await page.evaluate(() => window.location.hash),
      '#/units/jul28-scale-unit-1',
      `${target.name} did not exercise the integrated App route callback.`,
    );
    assert.equal(
      await page.getByTestId('wave1r-unit-row').count(),
      syntheticUnitCount,
      `${target.name} did not keep the full synthetic board mounted while opening a Unit.`,
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
    assert.ok(
      memoProfile.ratio < maxMemoizedOpenRatio,
      `${target.name} Unit-open render used ${(memoProfile.ratio * 100).toFixed(1)}% of the full-board render estimate `
        + `(limit ${(maxMemoizedOpenRatio * 100).toFixed(0)}%).`,
    );
    await page.getByText('Paper remains authoritative · synthetic read-only candidate', { exact: true }).waitFor();
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
      memoizedOpenRatio: maxMemoizedOpenRatio,
    },
    results,
  }));
} finally {
  await browser?.close();
  await server.close();
  await rm(harnessRoot, { recursive: true, force: true });
}
