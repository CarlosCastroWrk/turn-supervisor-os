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
const featurePath = resolve(repoRoot, 'src/features/jul28-turnboard/TurnBoardFeature.tsx');
const repositoryPath = resolve(repoRoot, 'src/features/jul28-turnboard/syntheticRepository.ts');

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
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TurnBoardFeature } from ${JSON.stringify(featurePath)};
import { jul28SyntheticTurnBoardRepository } from ${JSON.stringify(repositoryPath)};

const templates = jul28SyntheticTurnBoardRepository.listUnits();
const units = Array.from({ length: 300 }, (_, index) => {
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

createRoot(document.getElementById('root')).render(
  <TurnBoardFeature repository={repository} />
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
    featureClientWidth: document.querySelector('.jul28-turnboard')?.clientWidth ?? 0,
    featureScrollWidth: document.querySelector('.jul28-turnboard')?.scrollWidth ?? 0,
  }));
  assert.ok(
    dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
    `${label} document overflowed: ${dimensions.documentScrollWidth}px > ${dimensions.documentClientWidth}px.`,
  );
  assert.ok(
    dimensions.featureScrollWidth <= dimensions.featureClientWidth + 1,
    `${label} feature overflowed: ${dimensions.featureScrollWidth}px > ${dimensions.featureClientWidth}px.`,
  );
};

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

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    const loadMs = Math.round(performance.now() - startedAt);
    assert.equal(await page.locator('.jul28-unit-card').count(), 300);
    assert.ok(loadMs < 15_000, `${target.name} needed ${loadMs}ms to render 300 synthetic Units.`);
    assert.equal(
      await page.getByRole('button', { name: /property accepted|property rejected|PDS Approved|mark done/i }).count(),
      0,
      `${target.name} exposed an unauthorized operational mutation.`,
    );
    await assertNoHorizontalOverflow(page, target.name);

    const search = page.getByPlaceholder('Search units or crew');
    await search.fill('1300');
    assert.equal(await page.locator('.jul28-unit-card').count(), 1);
    await page.getByRole('button', { name: 'Open Unit 1300 workspace', exact: true }).click();
    await page.getByRole('complementary', { name: 'Selected Unit workspace' })
      .getByRole('heading', { name: 'Unit 1300', exact: true })
      .waitFor();
    await page.getByText('Paper TurnBoard remains authoritative.', { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} selected workspace`);

    const screenshot = path.join(screenshotDirectory, `${target.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    results[target.name] = { loadMs, screenshot };
    await context.close();
  }

  console.log(JSON.stringify({ unitCount: 300, results }));
} finally {
  await browser?.close();
  await server.close();
  await rm(harnessRoot, { recursive: true, force: true });
}
