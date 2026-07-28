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

const assertSeveralRowsVisible = async (page, label, minimumRows) => {
  const visibleRows = await page.locator('[data-testid="wave1r-unit-row"]').evaluateAll((rows) =>
    rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      return visibleHeight >= 44;
    }).length,
  );
  assert.ok(
    visibleRows >= minimumRows,
    `${label} showed only ${visibleRows} meaningfully visible Unit rows; expected ${minimumRows}.`,
  );
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-small-320x568', minimumRows: 1, viewport: { width: 320, height: 568 } },
    { name: 'iphone-390x844', minimumRows: 3, viewport: { width: 390, height: 844 } },
    { name: 'iphone-landscape-844x390', minimumRows: 2, viewport: { width: 844, height: 390 } },
    { name: 'ipad-landscape', minimumRows: 3, viewport: { width: 1024, height: 768 } },
    { name: 'mac', minimumRows: 3, viewport: { width: 1440, height: 900 } },
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
    for (const secondaryLabel of ['Training', 'Daily', 'Issues', 'Assignments']) {
      assert.equal(
        await navigation.getByRole('button', { name: secondaryLabel, exact: true }).count(),
        0,
      );
    }
    assert.equal(await page.locator('[data-testid="wave1r-unit-row"]').count(), 4);
    await assertSeveralRowsVisible(page, target.name, target.minimumRows);
    await assertNoHorizontalOverflow(page, `${target.name} default board`);
    await assertCriticalTargets(page, `${target.name} default board`);

    const screenshot = `/private/tmp/wave1r-board-first-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    if (target.viewport.width === 320) {
      await page.getByRole('button', { name: 'Expand Turn OS assistant' }).click();
      const plusTrigger = page.getByRole('button', { name: 'Open Turn OS add menu' });
      await plusTrigger.click();
      const tinyDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
      await tinyDialog.waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);
      await page.waitForFunction(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog && getComputedStyle(dialog).transform === 'none';
      });
      const bounds = await tinyDialog.boundingBox();
      assert.ok(bounds);
      assert.ok(
        bounds.y >= -0.5 && bounds.y + bounds.height <= target.viewport.height + 0.5,
        `${target.name} Plus sheet bounds ${JSON.stringify(bounds)} exceeded ${target.viewport.height}px.`,
      );
      await assertCriticalTargets(page, `${target.name} open Plus sheet`);
      await page.keyboard.press('Escape');
      await tinyDialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-assistant-plus');
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await interactionContext.newPage();
  const interactionFindings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
  const navigation = page.getByRole('navigation', { name: 'Primary' });

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

  const plusTrigger = page.getByRole('button', { name: 'Open Turn OS add menu' });
  await plusTrigger.click();
  const plusDialog = page.getByRole('dialog', { name: 'Add to Turn OS' });
  await plusDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  for (const label of ['Note', 'Photo or File', 'Assignment Intake', 'Add Blocker']) {
    assert.equal(await plusDialog.getByRole('button', { name: label, exact: true }).count(), 1);
  }
  await plusDialog.getByRole('button', { name: 'Photo or File', exact: true }).click();
  await plusDialog.waitFor({ state: 'hidden' });
  await page.getByText(
    'Photo or File was not accepted. Nothing was handed off or saved.',
    { exact: true },
  ).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-assistant-plus');
  assert.deepEqual(
    await page.evaluate(() => ({
      dialogCount: window.__wave1rEvents.captureDialogCounts.at(-1),
      request: window.__wave1rEvents.capture.at(-1),
    })),
    {
      dialogCount: 0,
      request: {
        kind: 'photo-file',
        origin: 'plus-sheet',
        requestId: 'wave1r-capture-1',
        returnFocus: { triggerId: 'w1r-assistant-plus' },
      },
    },
  );

  await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
  assert.equal(await page.getByText('Accepted preview note receipt', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Capture handoff accepted', { exact: true }).count(), 0);
  await navigation.getByRole('button', { name: 'TurnBoard', exact: true }).click();

  await plusTrigger.click();
  await plusDialog.waitFor();
  await plusDialog.getByRole('button', { name: 'Note', exact: true }).click();
  await plusDialog.waitFor({ state: 'hidden' });
  await page.getByText(
    'Capture accepted the note request and returned a synthetic item.',
    { exact: true },
  ).waitFor();
  assert.equal(
    await page.evaluate(() => window.__wave1rEvents.captureDialogCounts.at(-1)),
    0,
  );

  const row603 = page.locator('[data-unit-id="jul28-unit-603"]');
  await row603.getByRole('button', { name: 'Open Unit 603', exact: true }).click();
  const sectionTrigger = page.locator(
    '#w1r-detail-section-jul28-unit-603-paint-common',
  );
  await sectionTrigger.click();
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
  assert.equal(
    await page.locator(':focus').getAttribute('id'),
    'w1r-detail-section-jul28-unit-603-paint-common',
  );

  await sectionTrigger.click();
  await sectionDialog.waitFor();
  await sectionDialog.getByRole('button', { name: /^Inspection Blocked/ }).click();
  await sectionDialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__wave1rEvents.capture.length === 3);
  assert.deepEqual(
    await page.evaluate(() => ({
      dialogCount: window.__wave1rEvents.captureDialogCounts.at(-1),
      request: window.__wave1rEvents.capture.at(-1),
    })),
    {
      dialogCount: 0,
      request: {
        kind: 'blocker',
        origin: 'section-sheet',
        requestId: 'wave1r-capture-3',
        returnFocus: {
          triggerId: 'w1r-detail-section-jul28-unit-603-paint-common',
          unitId: 'jul28-unit-603',
        },
        section: 'common',
        trade: 'paint',
        unitId: 'jul28-unit-603',
        unitNumber: '603',
      },
    },
  );

  await page.getByRole('button', { name: 'Back to TurnBoard', exact: true }).click();
  const row602 = page.locator('[data-unit-id="jul28-unit-602"]');
  await row602.getByRole('button', { name: 'Open Unit 602', exact: true }).click();
  const crew602Trigger = page.locator('#w1r-detail-crew-jul28-unit-602-paint');
  await crew602Trigger.click();
  const assignmentDialog = page.getByRole('dialog', { name: 'Unit 602 crew' });
  await assignmentDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.deepEqual(
    await assignmentDialog.getByLabel('Select synthetic crew').locator('option').allTextContents(),
    ['Atlas Paint', 'Bluebird Paint', 'Northline Paint'],
  );
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
  assert.equal(
    await page.locator(':focus').getAttribute('id'),
    'w1r-detail-crew-jul28-unit-602-paint',
  );

  await page.getByRole('button', { name: 'Back to TurnBoard', exact: true }).click();
  const row604 = page.locator('[data-unit-id="jul28-unit-604"]');
  await row604.getByRole('button', { name: 'Open Unit 604', exact: true }).click();
  const crew604Trigger = page.locator('#w1r-detail-crew-jul28-unit-604-paint');
  await crew604Trigger.click();
  const assignment604 = page.getByRole('dialog', { name: 'Unit 604 crew' });
  await assignment604.waitFor();
  assert.deepEqual(
    await assignment604.getByLabel('Select synthetic crew').locator('option').allTextContents(),
    ['Atlas Paint', 'Bluebird Paint', 'Northline Paint'],
  );
  assert.deepEqual(
    await assignment604.getByRole('checkbox').evaluateAll((checkboxes) =>
      checkboxes.map((checkbox) => checkbox.parentElement?.textContent?.trim())),
    ['D'],
  );
  assert.equal(await assignment604.getByText('Common', { exact: true }).count(), 0);
  assert.equal(await assignment604.getByText('A', { exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await assignment604.waitFor({ state: 'hidden' });
  assert.equal(
    await page.locator(':focus').getAttribute('id'),
    'w1r-detail-crew-jul28-unit-604-paint',
  );

  await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
  await page.getByText('Accepted preview note receipt', { exact: true }).waitFor();
  await page.getByText('Pass My Inspection proposed', { exact: true }).waitFor();
  await page.getByText('Inspection Blocked proposed', { exact: true }).waitFor();
  await page.getByText('Assignment proposal confirmed', { exact: true }).waitFor();
  assert.ok(await page.getByText('Capture handoff accepted', { exact: true }).count() >= 1);

  await page.getByRole('listitem')
    .filter({ hasText: 'Pass My Inspection proposed' })
    .getByRole('button', { name: 'Unit 603 · Paint · Common', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Unit 603', exact: true }).waitFor();
  const tabs = page.getByRole('tablist', { name: 'Unit 603 detail' });
  const paintTab = tabs.getByRole('tab', { name: 'Paint', exact: true });
  await paintTab.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab', { name: 'Clean', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-tab-jul28-unit-603-clean');
  await page.keyboard.press('End');
  const historyTab = tabs.getByRole('tab', { name: 'Notes & History', exact: true });
  assert.equal(await historyTab.getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-tab-jul28-unit-603-history');
  const panel = page.getByRole('tabpanel');
  assert.equal(await historyTab.getAttribute('aria-controls'), 'w1r-panel-jul28-unit-603');
  assert.equal(await panel.getAttribute('id'), 'w1r-panel-jul28-unit-603');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'w1r-tab-jul28-unit-603-history');
  await page.keyboard.press('Home');
  assert.equal(await paintTab.getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await historyTab.getAttribute('aria-selected'), 'true');
  await panel.getByText('Pass My Inspection proposed', { exact: true }).waitFor();
  await panel.getByText('Inspection Blocked proposed', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Request voice entry from existing Capture owner' }).click();
  await page.waitForFunction(() => window.__wave1rEvents.capture.length === 4);
  assert.deepEqual(
    await page.evaluate(() => {
      const request = window.__wave1rEvents.capture.at(-1);
      return request && {
        kind: request.kind,
        origin: request.origin,
        returnFocus: request.returnFocus,
        unitId: request.unitId,
        unitNumber: request.unitNumber,
      };
    }),
    {
      kind: 'voice',
      origin: 'assistant',
      returnFocus: {
        triggerId: 'w1r-assistant-voice',
        unitId: 'jul28-unit-603',
      },
      unitId: 'jul28-unit-603',
      unitNumber: '603',
    },
  );

  await page.getByRole('button', { name: 'Back to TurnBoard' }).click();
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-unit-open-jul28-unit-603');

  await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('listitem')
    .filter({ hasText: 'Assignment proposal confirmed' })
    .getByRole('button', { name: 'Unit 602 · Paint', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Notes & History', exact: true }).click();
  await page.getByRole('tabpanel')
    .getByText('Assignment proposal confirmed', { exact: true })
    .waitFor();

  await navigation.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
  await page.getByText('Advanced / Legacy', { exact: true }).waitFor();
  for (const label of ['Crews', 'Reports', 'Setup', 'Backup', 'Sync']) {
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${label}`) }).count(), 1);
  }
  await page.getByRole('button', { name: /^Crews/ }).click();
  await page.getByText('crews navigation was accepted by the preview host.', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Sync/ }).click();
  await page.getByText(
    'Sync is unavailable in the standalone preview. No navigation occurred.',
    { exact: true },
  ).waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__wave1rEvents.hostNavigation),
    [
      {
        destination: 'crews',
        origin: 'more',
        returnFocus: { triggerId: 'w1r-more-crews' },
      },
      {
        destination: 'sync',
        origin: 'more',
        returnFocus: { triggerId: 'w1r-more-sync' },
      },
    ],
  );

  const needsTrigger = page.getByRole('button', { name: /Open the same personal attention list/ });
  await needsTrigger.click();
  const needsDialog = page.getByRole('dialog', { name: 'Needs Me' });
  await needsDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.ok(await needsDialog.getByRole('button', { name: /Unit 602/ }).count() >= 1);
  await page.keyboard.press('Escape');
  await needsDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator(':focus').getAttribute('id'), 'w1r-more-needs-me');

  await assertNoHorizontalOverflow(page, 'iphone interaction flow');
  await assertCriticalTargets(page, 'iphone interaction flow');
  assert.deepEqual(
    interactionFindings,
    [],
    `iphone interaction runtime findings:\n${interactionFindings.join('\n')}`,
  );
  await interactionContext.close();

  const keyboardContext = await browser.newContext({ viewport: { width: 390, height: 420 } });
  const keyboardPage = await keyboardContext.newPage();
  const keyboardFindings = attachRuntimeChecks(keyboardPage);
  await keyboardPage.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
  await keyboardPage.getByRole('button', { name: 'Expand Turn OS assistant' }).click();
  const keyboardInput = keyboardPage.getByLabel('Ask or update Turn OS');
  await keyboardInput.fill('Keyboard-safe draft');
  await keyboardInput.focus();
  await assertNoHorizontalOverflow(keyboardPage, 'keyboard-height viewport');
  const keyboardLayout = await keyboardPage.evaluate(() => {
    const shell = document.querySelector('[data-testid="wave1r-shell"]')?.getBoundingClientRect();
    const assistant = document.querySelector('.w1r-assistant')?.getBoundingClientRect();
    const input = document.querySelector('[aria-label="Ask or update Turn OS"]')?.getBoundingClientRect();
    return {
      height: window.innerHeight,
      shellBottom: shell?.bottom ?? Number.NaN,
      assistantTop: assistant?.top ?? Number.NaN,
      assistantBottom: assistant?.bottom ?? Number.NaN,
      inputTop: input?.top ?? Number.NaN,
      inputBottom: input?.bottom ?? Number.NaN,
    };
  });
  assert.ok(keyboardLayout.shellBottom <= keyboardLayout.height + 0.5);
  assert.ok(keyboardLayout.assistantTop >= -0.5);
  assert.ok(keyboardLayout.assistantBottom <= keyboardLayout.height + 0.5);
  assert.ok(keyboardLayout.inputTop >= -0.5);
  assert.ok(keyboardLayout.inputBottom <= keyboardLayout.height + 0.5);
  assert.deepEqual(keyboardFindings, []);
  await keyboardContext.close();

  const reducedMotionContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reducedMotionPage = await reducedMotionContext.newPage();
  await reducedMotionPage.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
  await reducedMotionPage.locator('[data-unit-id="jul28-unit-603"]')
    .getByRole('button', { name: 'Open Unit 603', exact: true })
    .click();
  await reducedMotionPage
    .locator('#w1r-detail-section-jul28-unit-603-paint-common')
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
