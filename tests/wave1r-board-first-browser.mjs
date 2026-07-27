import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4206;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave1r-board-first/preview.html';
const dependencyRoot = process.env.PDS_DEPENDENCY_ROOT ?? process.cwd();
const playwrightRoot = process.env.PDS_PLAYWRIGHT_ROOT ?? dependencyRoot;
const viteRoot = process.env.PDS_VITE_ROOT ?? dependencyRoot;
const uiDependencyRoot = process.env.PDS_UI_DEPENDENCY_ROOT ?? viteRoot;
const playwrightRequire = createRequire(resolve(playwrightRoot, 'package.json'));
const viteRequire = createRequire(resolve(viteRoot, 'package.json'));
const uiRequire = createRequire(resolve(uiDependencyRoot, 'package.json'));
const playwrightEntry = resolve(dirname(playwrightRequire.resolve('playwright')), 'index.mjs');
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave1r-board-first-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), 'src/features/wave1r-board-first/preview.html')],
  },
  resolve: {
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: uiRequire.resolve('react/jsx-dev-runtime') },
      { find: 'react/jsx-runtime', replacement: uiRequire.resolve('react/jsx-runtime') },
      { find: 'react-dom/client', replacement: uiRequire.resolve('react-dom/client') },
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
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="wave1r-shell"]');
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
    `${label} shell overflowed: ${dimensions.shellScrollWidth}px > ${dimensions.shellClientWidth}px.`,
  );
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-w1r-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} rendered no critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} critical target ${index} had no box.`);
    assert.ok(
      box.height >= 43.5 && box.width >= 43.5,
      `${label} critical target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertSeveralRowsVisible = async (page, label) => {
  const visibleRows = await page.locator('[data-testid="wave1r-unit-row"]').evaluateAll((rows) =>
    rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      return visibleHeight >= 44;
    }).length,
  );
  assert.ok(visibleRows >= 3, `${label} showed only ${visibleRows} meaningfully visible Unit rows.`);
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-390x844', viewport: { width: 390, height: 844 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'Wave 1R Board-First Shell');
    try {
      await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    } catch (error) {
      await page.screenshot({ path: `/private/tmp/wave1r-board-first-${target.name}-failure.png`, fullPage: false });
      throw new Error(
        `${target.name} did not render TurnBoard.\nRuntime findings:\n${findings.join('\n')}\n${String(error)}`,
      );
    }
    await page.getByText('Moon Tower · Synthetic', { exact: true }).waitFor();
    assert.equal(await page.getByText('Supervisor', { exact: true }).count(), 0);
    assert.ok(await page.getByText(/Paper remains authoritative/).count() >= 1);

    const navigation = page.getByRole('navigation', { name: 'Primary' });
    assert.deepEqual(
      await navigation.getByRole('button').allTextContents(),
      ['TurnBoard', 'Activity', 'More'],
    );
    assert.equal(
      await navigation.getByRole('button', { name: 'TurnBoard', exact: true }).getAttribute('aria-current'),
      'page',
    );
    assert.equal(await page.locator('[data-testid="wave1r-unit-row"]').count(), 4);
    await assertSeveralRowsVisible(page, target.name);
    await assertNoHorizontalOverflow(page, `${target.name} default board`);
    await assertCriticalTargets(page, `${target.name} default board`);

    const screenshot = `/private/tmp/wave1r-board-first-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    assert.equal(await page.getByRole('button', { name: 'Expand Turn OS assistant' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Open Turn OS add menu' }).count(), 0);
    assert.equal(await page.getByLabel('Ask or update Turn OS').count(), 0);
    await page.getByRole('button', { name: 'Expand Turn OS assistant' }).click();
    await page.getByLabel('Ask or update Turn OS').fill('Unit 602 Paint Common needs a note');
    await page.getByRole('button', { name: 'Collapse Turn OS assistant' }).click();
    assert.equal(await page.getByLabel('Ask or update Turn OS').count(), 0);
    await page.getByRole('button', { name: 'Expand Turn OS assistant' }).click();
    assert.equal(
      await page.getByLabel('Ask or update Turn OS').inputValue(),
      'Unit 602 Paint Common needs a note',
    );

    await page.getByRole('button', { name: 'Open Turn OS add menu' }).click();
    const plusDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
    await plusDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    for (const label of ['Note', 'Photo or File', 'Assignment Intake', 'Add Blocker']) {
      assert.equal(await plusDialog.getByRole('button', { name: label, exact: true }).count(), 1);
    }
    await page.keyboard.press('Escape');
    await plusDialog.waitFor({ state: 'hidden' });

    await page.getByRole('button', { name: 'Request voice entry from existing Capture owner' }).click();
    await page.getByText('Voice requested from the existing Capture owner. This shell is not recording.', { exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.__wave1rEvents.capture.at(-1)),
      { kind: 'voice', origin: 'assistant' },
    );
    await page.getByRole('button', { name: 'Collapse Turn OS assistant' }).click();

    const row603 = page.locator('[data-unit-id="jul28-unit-603"]');
    await row603.getByRole('button', { name: /Unit 603 Paint Common ready for my inspection/ }).click();
    const sectionDialog = page.getByRole('dialog', { name: 'Unit 603' });
    await sectionDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    for (const label of ['Pass My Inspection', 'Create Callback', 'Inspection Blocked', 'Add Note or Photo']) {
      assert.equal(await sectionDialog.getByRole('button', { name: new RegExp(`^${label}`) }).count(), 1);
    }
    assert.equal(await sectionDialog.getByRole('button', { name: /Assign Crew/ }).count(), 0);
    await sectionDialog.getByRole('button', { name: /^Pass My Inspection/ }).click();
    await sectionDialog.getByText(/No official, persisted, or paper state changed/).waitFor();
    assert.deepEqual(
      await page.evaluate(() => {
        const proposal = window.__wave1rEvents.actions.at(-1);
        return proposal && {
          id: proposal.action.id,
          officialStateChanged: proposal.officialStateChanged,
          paperStateChanged: proposal.paperStateChanged,
          unitId: proposal.unitId,
        };
      }),
      {
        id: 'pass-inspection',
        officialStateChanged: false,
        paperStateChanged: false,
        unitId: 'jul28-unit-603',
      },
    );
    await page.keyboard.press('Escape');
    await sectionDialog.waitFor({ state: 'hidden' });

    const row602 = page.locator('[data-unit-id="jul28-unit-602"]');
    await row602.getByRole('button', { name: /Paint crew for Unit 602/ }).click();
    const assignmentDialog = page.getByRole('dialog', { name: 'Unit 602 crew' });
    await assignmentDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await assignmentDialog.getByLabel('Select synthetic crew').selectOption('Atlas Paint');
    await assignmentDialog.getByText('Existing responsibility detected', { exact: true }).waitFor();
    await assignmentDialog.getByRole('button', { name: 'Confirm synthetic proposal', exact: true }).click();
    await assignmentDialog.getByText(/No official or persisted assignment was created/).waitFor();
    assert.deepEqual(
      await page.evaluate(() => {
        const proposal = window.__wave1rEvents.assignments.at(-1);
        return proposal && {
          officialAssignmentCreated: proposal.officialAssignmentCreated,
          paperStateChanged: proposal.paperStateChanged,
          persisted: proposal.persisted,
          unitId: proposal.unitId,
        };
      }),
      {
        officialAssignmentCreated: false,
        paperStateChanged: false,
        persisted: false,
        unitId: 'jul28-unit-602',
      },
    );
    await page.keyboard.press('Escape');
    await assignmentDialog.waitFor({ state: 'hidden' });

    await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
    await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
    await page.getByText('Paint walkthrough note', { exact: true }).waitFor();
    await page.getByText('Voice transcript draft', { exact: true }).waitFor();
    await page.getByRole('listitem')
      .filter({ hasText: 'Paint walkthrough note' })
      .getByRole('button', { name: 'Unit 602 · Paint · Common', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Notes & History', exact: true }).click();
    await page.getByText('Paint walkthrough note', { exact: true }).waitFor();

    if (target.viewport.width >= 900) {
      const panes = await page.evaluate(() => {
        const board = document.querySelector('.w1r-main__surface')?.getBoundingClientRect();
        const detail = document.querySelector('.w1r-unit-detail')?.getBoundingClientRect();
        return board && detail
          ? { boardRight: board.right, detailLeft: detail.left, boardWidth: board.width, detailWidth: detail.width }
          : null;
      });
      assert.ok(panes, `${target.name} did not render both panes.`);
      assert.ok(panes.boardWidth > 0 && panes.detailWidth > 0);
      assert.ok(panes.boardRight <= panes.detailLeft + 1, `${target.name} panes overlapped.`);
    } else {
      assert.equal(await page.locator('.w1r-main__surface').isVisible(), false);
      assert.equal(await page.locator('.w1r-unit-detail').isVisible(), true);
    }

    await navigation.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
    await page.getByText('Advanced / Legacy', { exact: true }).waitFor();
    await page.getByText(/Unavailable in isolated Track A/).waitFor();

    await page.getByRole('button', { name: /Open Needs Me/ }).click();
    const needsDialog = page.getByRole('dialog', { name: 'Needs Me' });
    await needsDialog.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.ok(await needsDialog.getByRole('button', { name: /Unit 602/ }).count() >= 1);
    await page.keyboard.press('Escape');
    await needsDialog.waitFor({ state: 'hidden' });

    await assertNoHorizontalOverflow(page, `${target.name} after interaction flow`);
    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const reducedMotionContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reducedMotionPage = await reducedMotionContext.newPage();
  await reducedMotionPage.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
  await reducedMotionPage.locator('[data-unit-id="jul28-unit-603"]')
    .getByRole('button', { name: /Unit 603 Paint Common ready for my inspection/ })
    .click();
  const animationDuration = await reducedMotionPage.getByRole('dialog', { name: 'Unit 603' })
    .evaluate((element) => getComputedStyle(element).animationDuration);
  assert.ok(Number.parseFloat(animationDuration) <= 0.001, `Reduced motion duration was ${animationDuration}.`);
  await reducedMotionContext.close();

  console.log(`Wave 1R board-first browser gate passed. Screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser?.close();
  await server.close();
}
