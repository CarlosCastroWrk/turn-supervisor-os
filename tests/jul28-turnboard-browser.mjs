import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4198;
const baseUrl = `http://${host}:${port}`;
const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const harnessRoot = await mkdtemp('/private/tmp/jul28-turnboard-browser-');
const featurePath = resolve(repoRoot, 'src/features/jul28-turnboard/TurnBoardFeature.tsx');

const html = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Track B Wave 1</title></head>
  <body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>`;

const main = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TurnBoardFeature } from ${JSON.stringify(featurePath)};

window.__jul28Events = { selected: [], closed: [] };
createRoot(document.getElementById('root')).render(
  <TurnBoardFeature
    onUnitSelected={(unitId) => window.__jul28Events.selected.push(unitId)}
    onUnitClose={(unitId) => window.__jul28Events.closed.push(unitId)}
  />
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
  page.on('requestfailed', (request) => findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
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
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-320', viewport: { width: 320, height: 760 } },
    { name: 'iphone-390', viewport: { width: 390, height: 844 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.equal(await page.locator('.jul28-unit-card').count(), 4, `${target.name} did not render four synthetic Units.`);
    assert.equal(await page.locator('.jul28-filter-icon').count(), 0, `${target.name} retained the inert funnel.`);
    assert.equal(await page.getByLabel('Building / floor', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Crew', { exact: true }).count(), 1);
    const unit602Card = page.locator('[data-unit-id="jul28-unit-602"]');
    const open602 = unit602Card.getByRole('button', { name: 'Open Unit 602 workspace', exact: true });
    assert.equal(
      await unit602Card.locator('.jul28-trade-summary').count(),
      2,
      `${target.name} did not show compact Paint and Clean summaries on the phone card.`,
    );
    assert.equal(await unit602Card.getByRole('heading', { name: 'Unit 602', exact: true }).count(), 1);
    assert.equal(await unit602Card.locator('dl.jul28-layer-rail').count(), 1);
    assert.equal(
      await open602.locator(
        '.jul28-trade-summary, .jul28-unit-card__crew, .jul28-unit-card__warning, .jul28-unit-card__added-scope, .jul28-unit-card__maintenance, .jul28-layer-rail, dl',
      ).count(),
      0,
      `${target.name} wrapped semantic Unit facts inside the Open Unit button.`,
    );
    assert.equal(await open602.getByText('Open Unit workspace', { exact: true }).count(), 1);
    for (const label of ['Authorization', 'Assignment evidence', 'Crew report', 'My inspection', 'Property walk', 'Paper review']) {
      assert.equal(
        await page.locator('.jul28-layer-rail dt').filter({ hasText: label }).first().isVisible(),
        true,
        `${target.name} hid the readable ${label} layer label.`,
      );
    }
    assert.equal(await page.getByText(/\bDone\b/, { exact: true }).count(), 0, `${target.name} exposed generic Done copy.`);
    assert.equal(
      await page.getByRole('button', { name: /property accepted|property rejected|PDS Approved/i }).count(),
      0,
      `${target.name} exposed a deferred property/PDS approval action.`,
    );
    const openButtonMetrics = await open602.evaluate((element) => ({
      display: getComputedStyle(element).display,
      height: element.getBoundingClientRect().height,
    }));
    assert.equal(
      openButtonMetrics.display,
      'flex',
      `${target.name} Unit card action was not a dedicated flex button.`,
    );
    assert.ok(openButtonMetrics.height >= 44, `${target.name} Open Unit action was smaller than 44px.`);
    await assertNoHorizontalOverflow(page, target.name);

    if (target.name === 'iphone-390') {
      await page.getByLabel('Building / floor', { exact: true }).selectOption('Building B · Level 13');
      assert.equal(await page.locator('.jul28-unit-card').count(), 1);
      assert.equal(await page.getByRole('button', { name: /Open Unit 1305 workspace/ }).count(), 1);
      await page.getByLabel('Building / floor', { exact: true }).selectOption('all');

      await page.getByLabel('Crew', { exact: true }).selectOption('Bluebird Paint');
      assert.equal(await page.getByRole('button', { name: /Open Unit 602 workspace/ }).count(), 1);
      await page.getByLabel('Crew', { exact: true }).selectOption('all');

      await page.getByRole('button', { name: /Assignment conflict/ }).click();
      assert.deepEqual(
        await page.locator('.jul28-unit-card__number').allTextContents(),
        ['Unit 604'],
        'Assignment conflict filter did not isolate the conflicting Unit.',
      );
      await page.getByRole('button', { name: /^All / }).click();

      await page.getByRole('button', { name: /Access blocked/ }).click();
      assert.equal(await page.getByRole('button', { name: /Open Unit 1305 workspace/ }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /Open Unit 602 workspace/ }).count(), 0);
      await page.getByRole('button', { name: /^All / }).click();

      const open603 = page.getByRole('button', { name: /Open Unit 603 workspace/ });
      await open603.click();
      await page.getByRole('heading', { name: 'Unit 603', exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'jul28-unit-workspace-title',
        'Opening a Unit did not focus the workspace heading.',
      );
      assert.equal(await page.locator('.jul28-workspace-trades .jul28-trade-summary').count(), 2);
      assert.equal(
        await page.evaluate(() => {
          const tradeCards = document.querySelector('.jul28-workspace-trades');
          const sectionDetails = document.querySelector('.jul28-selected-trade');
          return Boolean(
            tradeCards &&
            sectionDetails &&
            (tradeCards.compareDocumentPosition(sectionDetails) & Node.DOCUMENT_POSITION_FOLLOWING),
          );
        }),
        true,
        'Paint and Clean cards did not precede selected-section details.',
      );
      await page.locator('.jul28-selected-trade').getByText('4 of 5 sections ready for my walk', { exact: true }).waitFor();
      await page.getByRole('button', { name: /C, occupied or restricted/ }).click();
      await page.getByText('Occupied / restricted — do not enter', { exact: true }).waitFor();
      await page.getByText('Property contact / Tony', { exact: true }).waitFor();
      assert.ok(await page.getByText(/^Source: /).count() >= 7, 'Fact-level provenance was not rendered.');
      assert.equal(
        await page.getByRole('button', { name: /property accepted|property rejected|PDS Approved/i }).count(),
        0,
      );

      await page.getByRole('button', { name: 'Close Unit workspace and return to TurnBoard list', exact: true }).click();
      await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('aria-label') === 'Open Unit 603 workspace',
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
        'Open Unit 603 workspace',
        'Closing a Unit did not return focus to its originating card.',
      );
      assert.deepEqual(
        await page.evaluate(() => window.__jul28Events),
        { selected: ['jul28-unit-603'], closed: ['jul28-unit-603'] },
        'Feature-local open/close callbacks did not preserve the originating Unit.',
      );
      await assertNoHorizontalOverflow(page, `${target.name} after workspace close`);
    }

    const screenshot = join('/private/tmp', `jul28-turnboard-${target.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log(`Track B responsive browser checks passed. Screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser?.close();
  await server.close();
  await rm(harnessRoot, { recursive: true, force: true });
}
