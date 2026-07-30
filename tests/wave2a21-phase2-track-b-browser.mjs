import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4397;
const baseUrl = `http://${host}:${port}`;
const previewPath =
  '/src/features/wave2a2-track-c/phase2-track-b/preview.html';
const storageKey = 'turn-supervisor-os:v0.1';
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
const viteEntry = resolve(
  dirname(viteRequire.resolve('vite/package.json')),
  'dist',
  'node',
  'index.js',
);
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(
  pathToFileURL(viteEntry).href
);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a21-phase2-track-b-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), previewPath.slice(1))],
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

const runtimeFindings = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    findings.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`,
    ),
  );
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    shellClientWidth:
      document.querySelector('.track-c-shell')?.clientWidth ?? 0,
    shellScrollWidth:
      document.querySelector('.track-c-shell')?.scrollWidth ?? 0,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} document overflowed horizontally.`,
  );
  assert.ok(
    dimensions.shellScrollWidth <= dimensions.shellClientWidth + 1,
    `${label} shell overflowed horizontally.`,
  );
};

const assertInputFontSize = async (page, label) => {
  const inputs = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):visible, select:visible, textarea:visible',
  );
  for (let index = 0; index < (await inputs.count()); index += 1) {
    const size = await inputs.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    assert.ok(size >= 16, `${label} input ${index} used ${size}px text.`);
  }
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-track-c-critical-target="true"]:visible');
  for (let index = 0; index < (await targets.count()); index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no bounds.`);
    assert.ok(
      box.width >= 43.5 && box.height >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

const waitForLocalPersistence = (page) => page.waitForTimeout(750);

const activateSyntheticHostProject = async (page) => {
  await page.addInitScript(() => {
    const initializationKey = 'wave2a21-phase2-track-b-actual-host-initialized';
    if (window.sessionStorage.getItem(initializationKey) === 'true') return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(initializationKey, 'true');
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await primaryNavigation(page)
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('button', { name: /^Setup/u }).click();
  await page.getByRole('heading', { name: 'Activate project', exact: true }).waitFor();

  await page.getByLabel('Project name', { exact: true }).fill('Synthetic host assignment proof');
  await page.getByLabel('Property name', { exact: true }).fill('Synthetic Moon Tower');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('textbox', { name: 'Working hours', exact: true })
    .fill('Synthetic occupied-area window: 10 AM–5 PM.');
  await page.getByRole('textbox', { name: 'Daily walkthrough', exact: true })
    .fill('Synthetic daily walkthrough at noon.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Property Contact');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(
    'Replace the saved personal setup for this existing project.',
    { exact: true },
  ).check();
  await page.getByRole('button', {
    name: 'Activate personal project',
    exact: true,
  }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  const fixture = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const activeProjectId = data?.activeProjectId;
    const unit = data?.units?.find((candidate) => candidate.projectId === activeProjectId);
    const paintCrew = data?.crewMembers?.find((candidate) =>
      (!candidate.projectId || candidate.projectId === activeProjectId)
      && candidate.trade === 'Painter');
    const cleanCrew = data?.crewMembers?.find((candidate) =>
      (!candidate.projectId || candidate.projectId === activeProjectId)
      && candidate.trade === 'Cleaner');
    return unit && paintCrew && cleanCrew
      ? {
          cleanCrewId: cleanCrew.id,
          cleanCrewName: cleanCrew.name,
          paintCrewId: paintCrew.id,
          paintCrewName: paintCrew.name,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
        }
      : null;
  }, storageKey);
  assert.ok(fixture, 'actual-host synthetic roster did not expose Paint, Clean, and Unit fixtures.');

  await page.getByRole('button', { name: /^Import today’s released work/u })
    .first()
    .click();
  const manualRelease = page.getByTestId('manual-release-review');
  await manualRelease.waitFor();
  const inputs = manualRelease.locator('input');
  await inputs.nth(0).fill('Synthetic Property Contact');
  await inputs.nth(1).fill(fixture.unitNumber);
  const selectedUnit = manualRelease
    .locator('.w2a2-core-release__unit')
    .filter({ hasText: `Unit ${fixture.unitNumber}` });
  await selectedUnit.waitFor();
  const paintCommon = selectedUnit
    .locator('.w2a2-core-release__sections label')
    .filter({ hasText: 'Common' })
    .filter({ hasText: 'Paint' });
  const cleanCommon = selectedUnit
    .locator('.w2a2-core-release__sections label')
    .filter({ hasText: 'Common' })
    .filter({ hasText: 'Clean' });
  assert.equal(await paintCommon.count(), 1, 'expected exactly one synthetic Common Paint release option.');
  assert.equal(await cleanCommon.count(), 1, 'expected exactly one synthetic Common Clean release option.');
  await paintCommon.locator('input').check();
  await cleanCommon.locator('input').check();
  await manualRelease.locator('.w2a2-core-confirm input').check();
  await manualRelease.getByRole('button', {
    name: 'Confirm personal release',
    exact: true,
  }).click();
  await page.getByTestId('track-b-home').waitFor();
  await waitForLocalPersistence(page);

  const release = await page.evaluate(({ key, unitId }) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const batch = [...(data?.dailyReleaseBatches ?? [])]
      .filter((candidate) => candidate.projectId === data.activeProjectId && candidate.status === 'confirmed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const items = batch?.items?.filter((item) => item.unitId === unitId) ?? [];
    return batch
      ? {
          clean: items.filter((item) => item.trade === 'clean' && item.section === 'common').length,
          date: batch.date,
          paint: items.filter((item) => item.trade === 'paint' && item.section === 'common').length,
          releaseId: batch.id,
        }
      : null;
  }, { key: storageKey, unitId: fixture.unitId });
  assert.deepEqual(release?.paint, 1, 'actual host did not durably retain one released Paint target.');
  assert.deepEqual(release?.clean, 1, 'actual host did not durably retain one released Clean target.');

  await page.getByRole('button', { name: 'Start Day', exact: true }).first().click();
  await page.getByTestId('track-b-start-day').waitFor();
  for (let step = 1; step <= 7; step += 1) {
    await page.getByText(`Step ${step} of 8`, { exact: true }).waitFor();
    if (step === 4) {
      await page.getByTestId('track-b-start-day').locator('textarea').first().fill(
        'Synthetic evidence reviewed for the actual-host assignment proof.',
      );
    }
    if (step === 6) {
      const wordingFields = page.getByTestId('track-b-start-day').locator('textarea');
      await wordingFields.nth(0).fill('Synthetic occupied-area window: 10 AM–5 PM.');
      await wordingFields.nth(1).fill('Synthetic daily walkthrough at noon.');
    }
    if (step === 7) {
      await page.getByTestId('track-b-start-day').locator('textarea').first().fill(
        'Synthetic Start Day review for Paint and Clean assignment proof.',
      );
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByText('I reviewed the Start Day details.', { exact: true }).click();
  await page.getByRole('button', { name: 'Start Day', exact: true }).click();
  await page.getByTestId('track-b-home').waitFor();
  await page.getByText('Active', { exact: true }).waitFor();
  await waitForLocalPersistence(page);
  return fixture;
};

const assignmentEventSummary = async (page, fixture, trade) =>
  page.evaluate(({ key, trade: expectedTrade, unitId }) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const assignments = (data?.fieldEvents ?? []).filter((event) =>
      event.projectId === data.activeProjectId
      && event.eventType === 'assignment-confirmed'
      && event.unitId === unitId
      && event.trade === expectedTrade);
    return {
      assignmentCount: assignments.length,
      assignmentIds: assignments.map((event) => event.id),
      activityEquivalentCount: assignments.length,
    };
  }, { key: storageKey, trade, unitId: fixture.unitId });

const proveActualHostAssignment = async (page, fixture, input) => {
  const { crewId, crewName, trade } = input;
  const tradeLabel = trade === 'paint' ? 'Paint' : 'Clean';
  const oppositeTradeLabel = trade === 'paint' ? 'Clean' : 'Paint';
  const crewRoute = `${baseUrl}/#/crews/${encodeURIComponent(crewId)}`;
  const assignmentRoute = `${baseUrl}/#/assignments/${encodeURIComponent(crewId)}`;

  // This is the real host route, not the Track B preview or a component harness.
  await page.goto(crewRoute, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: crewName, exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Confirmed crew event stats').count(),
    1,
    `${tradeLabel} must open Crew Detail before its edit flow.`,
  );
  const assign = page.getByRole('button', { name: 'Assign work', exact: true });
  assert.equal(await assign.isDisabled(), false, `${tradeLabel} Assign work should be enabled only after the real release.`);
  await assign.click();
  await page.getByRole('heading', { name: 'Assign work', exact: true }).waitFor();
  assert.equal(page.url(), assignmentRoute, `${tradeLabel} assignment must use its durable host route.`);
  assert.equal(await page.getByLabel('Compatible crew').inputValue(), crewId);
  assert.equal(
    await page.getByRole('button', { name: tradeLabel, exact: true }).getAttribute('aria-pressed'),
    'true',
    `${tradeLabel} crew must retain its compatible trade.`,
  );
  assert.equal(
    await page.getByRole('button', { name: oppositeTradeLabel, exact: true }).getAttribute('aria-pressed'),
    'false',
    `${tradeLabel} crew must not silently enter ${oppositeTradeLabel} assignment mode.`,
  );
  const eligibleUnits = page.locator('.phase2-track-b-unit-list > label');
  assert.equal(await eligibleUnits.count(), 1, `only the confirmed released ${tradeLabel} Unit may be offered.`);
  const eligibleUnit = eligibleUnits.filter({ hasText: `Unit ${fixture.unitNumber}` });
  assert.equal(await eligibleUnit.count(), 1);
  await eligibleUnit.locator('input').check();
  await page.getByRole('button', { name: 'Review personal proposal', exact: true }).click();
  const review = page.getByRole('region', { name: 'Assignment proposal review' });
  await review.waitFor();
  assert.equal(await review.getByText(`Unit ${fixture.unitNumber}`, { exact: true }).count(), 1);
  await review.getByRole('button', { name: 'Confirm personal assignment', exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await page.getByText(/1 Unit assigned across 1 released section\./iu).waitFor();
  await waitForLocalPersistence(page);
  const persisted = await assignmentEventSummary(page, fixture, trade);
  assert.equal(
    persisted.assignmentCount,
    1,
    `${tradeLabel} must persist exactly one assignment after rapid double confirmation.`,
  );
  assert.equal(
    persisted.activityEquivalentCount,
    1,
    `${tradeLabel} must produce exactly one canonical Activity event after rapid double confirmation.`,
  );
  assert.equal(persisted.assignmentIds.length, 1);

  await page.goBack({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: crewName, exact: true }).waitFor();
  await page.getByText('Assigned Units', { exact: true }).waitFor();
  await page.getByText(`Unit ${fixture.unitNumber}`, { exact: true }).waitFor();
  await page.getByText(`${tradeLabel} · Common`, { exact: true }).waitFor();

  await page.goForward({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assign work', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Compatible crew').inputValue(), crewId);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assign work', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Compatible crew').inputValue(), crewId);
  assert.deepEqual(await assignmentEventSummary(page, fixture, trade), persisted);

  await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `Open Unit ${fixture.unitNumber}` }).click();
  await page.getByText(crewName, { exact: true }).waitFor();
  await page.getByText('Assigned', { exact: true }).waitFor();

  await primaryNavigation(page)
    .getByRole('button', { name: 'Activity', exact: true })
    .click();
  await page.getByText('Crew assignment confirmed', { exact: true }).first().waitFor();

  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  const search = page.getByPlaceholder('Search Units, crews, or activity');
  await search.fill(crewName);
  await page.getByText(crewName, { exact: true }).first().click();
  await page.getByRole('heading', { name: crewName, exact: true }).waitFor();
  return persisted;
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-320', viewport: { width: 320, height: 568 } },
    { name: 'iphone-390', viewport: { width: 390, height: 844 } },
    { name: 'iphone-430', viewport: { width: 430, height: 932 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({
      viewport: target.viewport,
      colorScheme: target.name.includes('iphone') ? 'dark' : 'light',
    });
    const page = await context.newPage();
    const findings = runtimeFindings(page);
    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Assign work' }).waitFor();

    assert.equal(
      await page.getByText('Section scope', { exact: true }).count(),
      0,
      'Normal assignment must not ask for section scope.',
    );
    assert.equal(
      await page.getByText('Specific sections', { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .locator('.phase2-track-b-unit-list label')
        .filter({ hasText: 'Unit 707' })
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator('.phase2-track-b-unit-list label')
        .filter({ hasText: 'Unit 401' })
        .count(),
      0,
      'A Unit with conflict on any applicable section must not enter the normal assignment list.',
    );
    assert.equal(
      await page
        .locator('.phase2-track-b-unit-list label')
        .filter({ hasText: 'Unit 501' })
        .count(),
      0,
      'A partially blocked Unit must not enter the normal assignment list.',
    );
    await assertNoHorizontalOverflow(page, target.name);
    await assertInputFontSize(page, target.name);
    await assertCriticalTargets(page, target.name);

    const assignmentScroller = page.locator('.track-c-assignment');
    const scroll = await assignmentScroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    assert.ok(
      scroll.scrollHeight >= scroll.clientHeight,
      `${target.name} did not expose a valid vertical assignment surface.`,
    );

    const screenshot = `/private/tmp/wave2a21-phase2-track-b-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);
    assert.deepEqual(findings, [], `${target.name}: ${findings.join('\n')}`);
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const findings = runtimeFindings(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });

  await page
    .getByLabel('Compatible crew')
    .selectOption('crew-bluebird-paint');
  await page
    .locator('.phase2-track-b-unit-list label')
    .filter({ hasText: 'Unit 707' })
    .locator('input')
    .check();
  await page
    .getByRole('button', { name: 'Review personal proposal' })
    .click();
  const review = page.getByRole('region', {
    name: 'Assignment proposal review',
  });
  await review.waitFor();
  assert.equal(await review.getByText('Unit 707', { exact: true }).count(), 1);
  assert.equal(
    await review.getByText(/All released sections: Common, A, B/iu).count(),
    1,
  );
  const confirm = review.getByRole('button', {
    name: 'Confirm personal assignment',
  });
  await confirm.evaluate((button) => {
    button.click();
    button.click();
  });
  await page
    .getByText(/1 Unit assigned across 3 released sections/iu)
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__phase2TrackBPreview?.reasons),
    ['bulk-assignment-confirmed'],
    'Rapid double confirm must emit one state transition.',
  );

  const exceptions = page.locator('.phase2-track-b-exceptions');
  await exceptions.getByText('Exceptions', { exact: true }).click();
  assert.equal(
    await page.getByRole('form', { name: 'Additional scope' }).count(),
    0,
    'Additional scope must remain hidden until explicitly opened.',
  );
  await page
    .getByRole('button', { name: 'Add additional scope' })
    .click();
  const scopeForm = page.getByRole('form', { name: 'Additional scope' });
  await scopeForm.waitFor();
  assert.equal(
    await scopeForm.getByText('F', { exact: true }).count(),
    0,
    'Additional scope must not create section F.',
  );
  await scopeForm.getByLabel('Category').selectOption('bathtub-clean');
  assert.equal(
    await scopeForm.getByLabel('Trade classification').inputValue(),
    'clean',
  );
  await scopeForm.getByLabel('Category').selectOption('doors');
  assert.equal(
    await scopeForm.getByLabel('Trade classification').inputValue(),
    'paint',
  );
  await scopeForm.getByLabel('Category').selectOption('full-paint');
  await scopeForm
    .getByLabel('Unit')
    .selectOption('unit-301');
  await scopeForm
    .getByPlaceholder('What changed or was added?')
    .fill('Full paint requested after release.');
  await scopeForm
    .getByPlaceholder('Who or what supplied this scope?')
    .fill('Synthetic property contact');
  await scopeForm.getByLabel('Source certainty').selectOption('confirmed');
  await scopeForm.getByRole('checkbox', { name: 'B' }).check();
  await scopeForm
    .getByRole('checkbox', { name: 'C', exact: true })
    .check();
  await scopeForm
    .getByLabel('Required for base completion')
    .selectOption('yes');
  await scopeForm.getByLabel('Change-order candidate').selectOption('yes');
  await scopeForm.getByLabel('Personal status').selectOption('in-progress');
  await page.evaluate(() => {
    if (window.__phase2TrackBPreview) {
      window.__phase2TrackBPreview.failNextAdditionalScopeCommit = true;
    }
  });
  await scopeForm
    .getByRole('button', { name: 'Save personal additional scope' })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await scopeForm
    .getByRole('alert')
    .getByText(/Synthetic durable commit failed/iu)
    .waitFor();
  assert.equal(await scopeForm.getByLabel('Unit').inputValue(), 'unit-301');
  assert.equal(await scopeForm.getByLabel('Category').inputValue(), 'full-paint');
  assert.equal(
    await scopeForm
      .getByPlaceholder('What changed or was added?')
      .inputValue(),
    'Full paint requested after release.',
  );
  assert.equal(
    await scopeForm
      .getByPlaceholder('Who or what supplied this scope?')
      .inputValue(),
    'Synthetic property contact',
  );
  assert.equal(
    await scopeForm.getByLabel('Trade classification').inputValue(),
    'paint',
  );
  assert.equal(await scopeForm.getByLabel('Source certainty').inputValue(), 'confirmed');
  assert.equal(await scopeForm.getByRole('checkbox', { name: 'B' }).isChecked(), true);
  assert.equal(
    await scopeForm
      .getByRole('checkbox', { name: 'C', exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await scopeForm.getByLabel('Date and time').inputValue(),
    '2026-07-29T11:00',
  );
  assert.equal(
    await scopeForm.getByLabel('Required for base completion').inputValue(),
    'yes',
  );
  assert.equal(
    await scopeForm.getByLabel('Change-order candidate').inputValue(),
    'yes',
  );
  assert.equal(await scopeForm.getByLabel('Personal status').inputValue(), 'in-progress');
  assert.equal(
    await page.getByText(/durably saved/iu).count(),
    0,
    'A failed callback must render no save receipt.',
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      attempts:
        window.__phase2TrackBPreview?.additionalScopeCommitAttempts ?? -1,
      records: window.__phase2TrackBPreview?.additionalScopeRecords.length ?? -1,
    })),
    { attempts: 1, records: 0 },
  );

  await scopeForm.getByRole('button', { name: 'Retry save' }).click();
  await page
    .getByText(/durably saved.*No price, approval, or form was submitted/iu)
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => ({
      attempts:
        window.__phase2TrackBPreview?.additionalScopeCommitAttempts ?? -1,
      records: window.__phase2TrackBPreview?.additionalScopeRecords.length ?? -1,
    })),
    { attempts: 2, records: 1 },
  );
  await page
    .getByRole('button', { name: /Open Change Order Approval/iu })
    .click();
  assert.equal(
    await page.evaluate(
      () => window.__phase2TrackBPreview?.changeOrderRequests.length,
    ),
    1,
    'The change-order action must remain a host callback only.',
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assign work' }).waitFor();
  await page.locator('.phase2-track-b-exceptions').getByText('Exceptions', { exact: true }).click();
  await page.getByRole('region', { name: 'Additional scope records' }).waitFor();
  assert.equal(
    await page.getByText('Full paint requested after release.', { exact: true }).count(),
    1,
    'A proven durable preview commit must survive reload.',
  );
  assert.equal(
    await page.getByText(/Required · unresolved/iu).count(),
    1,
    'Required incomplete scope must remain explicitly unresolved.',
  );
  assert.equal(
    await page.evaluate(
      () => window.__phase2TrackBPreview?.additionalScopeRecords.length,
    ),
    1,
  );

  await page
    .getByRole('button', { name: 'Add additional scope' })
    .click();
  const reinspectionScopeForm = page.getByRole('form', {
    name: 'Additional scope',
  });
  await reinspectionScopeForm.getByLabel('Unit').selectOption('unit-1505');
  await reinspectionScopeForm
    .getByPlaceholder('What changed or was added?')
    .fill('Required full paint correction before reinspection.');
  await reinspectionScopeForm
    .getByPlaceholder('Who or what supplied this scope?')
    .fill('Synthetic property contact');
  await reinspectionScopeForm
    .getByLabel('Source certainty')
    .selectOption('confirmed');
  await reinspectionScopeForm.getByRole('checkbox', { name: 'A' }).check();
  await reinspectionScopeForm
    .getByLabel('Required for base completion')
    .selectOption('yes');
  await reinspectionScopeForm
    .getByLabel('Change-order candidate')
    .selectOption('yes');
  await reinspectionScopeForm
    .getByLabel('Personal status')
    .selectOption('in-progress');
  await reinspectionScopeForm
    .getByRole('button', { name: 'Save personal additional scope' })
    .click();
  await page
    .getByText(
      /Personal additional scope durably saved.*No price, approval, or form was submitted/iu,
    )
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__phase2TrackBPreview?.additionalScopeRecords.length,
    ),
    2,
  );

  await page
    .getByRole('navigation', { name: 'Phase 2 Track B preview' })
    .getByRole('button', { name: 'Field' })
    .click();
  await page.getByRole('button', { name: 'Open Unit 301' }).click();
  const paintPanel301 = page.locator('.track-c-trade-panel.is-paint');
  const paintB = paintPanel301
    .locator('.track-c-section-row')
    .filter({ hasText: 'Needs Los inspection' });
  await paintB.getByRole('button').first().click();
  await paintB.getByRole('button', { name: 'Record Los pass' }).click();
  await page
    .locator('.track-c-notice')
    .getByText(/Los completion was not saved.*required Additional Scope/iu)
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__phase2TrackBPreview?.latestEventCount,
    ),
    0,
    'Required unfinished scope must block the Los-pass event.',
  );

  const paintC = paintPanel301
    .locator('.track-c-section-row')
    .filter({ hasText: 'Working' });
  await paintC.getByRole('button').first().click();
  await paintC.getByRole('button', { name: 'Crew reports complete' }).click();
  await page
    .locator('.track-c-notice')
    .getByText(/Personal section record saved/iu)
    .waitFor();
  const eventCountAfterCrewReport = await page.evaluate(
    () => window.__phase2TrackBPreview?.latestEventCount ?? 0,
  );
  assert.equal(
    eventCountAfterCrewReport > 0,
    true,
    'Crew-reported completion must remain separate evidence.',
  );

  await page
    .getByRole('button', { name: 'Back to compact TurnBoard' })
    .click();
  await page.getByRole('button', { name: 'Open Unit 1505' }).click();
  const reinspectionRow = page
    .locator('.track-c-trade-panel.is-paint .track-c-section-row')
    .filter({ hasText: 'Reinspection pending' });
  await reinspectionRow.getByRole('button').first().click();
  await reinspectionRow
    .getByRole('button', { name: 'Pass reinspection' })
    .click();
  await page
    .locator('.track-c-notice')
    .getByText(/Los completion was not saved.*required Additional Scope/iu)
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__phase2TrackBPreview?.latestEventCount ?? 0,
    ),
    eventCountAfterCrewReport,
    'Required unfinished scope must block the reinspection-pass event.',
  );

  await page
    .getByRole('navigation', { name: 'Phase 2 Track B preview' })
    .getByRole('button', { name: 'Crews' })
    .click();
  assert.equal(
    await page.getByRole('button', { name: 'Edit', exact: true }).count(),
    0,
    'Crew list must open detail before Edit.',
  );
  await page
    .getByRole('button', { name: 'Open Bluebird Paint detail' })
    .click();
  await page.getByRole('heading', { name: 'Bluebird Paint' }).waitFor();
  assert.equal(await page.getByText('512-555-0101').count(), 1);
  assert.equal(
    await page.getByRole('heading', { name: 'Callback history' }).count() >= 1,
    true,
  );
  assert.equal(
    await page.getByRole('button', { name: 'Assign work' }).count(),
    1,
  );
  assert.equal(await page.getByText(/payroll|ranking|blame/iu).count() >= 1, true);
  await page.getByRole('button', { name: 'Assign work' }).click();
  await page.getByRole('heading', { name: 'Assign work' }).waitFor();
  assert.equal(
    await page.getByLabel('Compatible crew').inputValue(),
    'crew-bluebird-paint',
  );
  assert.deepEqual(
    await page.evaluate(() => window.__phase2TrackBPreview?.assignCrewRequests),
    ['crew-bluebird-paint'],
  );

  await assertNoHorizontalOverflow(page, 'interactive flow');
  await assertInputFontSize(page, 'interactive flow');
  await assertCriticalTargets(page, 'interactive flow');
  assert.deepEqual(findings, [], `interactive: ${findings.join('\n')}`);
  await context.close();

  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const hostPage = await hostContext.newPage();
  const hostFindings = runtimeFindings(hostPage);
  await hostPage.goto(`${baseUrl}/#/crews/crew_painter`, {
    waitUntil: 'networkidle',
  });
  await hostPage.getByRole('heading', { name: 'Painter Team Lead' }).waitFor();
  const hostAssignButton = hostPage.getByRole('button', {
    name: 'Assign work',
  });
  assert.equal(
    await hostAssignButton.isDisabled(),
    true,
    'The actual host must render the Assign action but disable it without eligible released work.',
  );
  await hostPage
    .getByText('No released Paint work is available.', { exact: true })
    .waitFor();
  await hostPage.goto(`${baseUrl}/#/crews/crew_cleaner`, {
    waitUntil: 'networkidle',
  });
  await hostPage.getByRole('heading', { name: 'Cleaner Team Lead' }).waitFor();
  const hostCleanAssignButton = hostPage.getByRole('button', {
    name: 'Assign work',
  });
  assert.equal(
    await hostCleanAssignButton.isDisabled(),
    true,
    'The actual host must render the Clean Assign action but disable it without eligible released work.',
  );
  await hostPage
    .getByText('No released Clean work is available.', { exact: true })
    .waitFor();
  await hostPage.goto(`${baseUrl}/#/assignments/crew_painter`, {
    waitUntil: 'networkidle',
  });
  await hostPage.getByRole('heading', { name: 'Assign work' }).waitFor();
  assert.equal(
    hostPage.url(),
    `${baseUrl}/#/assignments/crew_painter`,
    'The actual host must preserve crew context in the durable route.',
  );
  assert.equal(
    await hostPage.getByLabel('Compatible crew').inputValue(),
    'crew_painter',
  );
  await hostPage.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await hostPage.getByLabel('Compatible crew').inputValue(),
    'crew_painter',
    'Refresh must preserve the selected crew.',
  );
  assert.equal(
    await hostPage.getByRole('dialog').count(),
    0,
    'Assignment must not introduce a second dialog owner.',
  );
  await assertNoHorizontalOverflow(hostPage, 'actual host assignment');
  assert.deepEqual(hostFindings, [], `actual host: ${hostFindings.join('\n')}`);
  await hostContext.close();

  const actualHostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const actualHostPage = await actualHostContext.newPage();
  actualHostPage.setDefaultTimeout(30_000);
  const actualHostFindings = runtimeFindings(actualHostPage);
  const actualHostFixture = await activateSyntheticHostProject(actualHostPage);
  const paintAssignment = await proveActualHostAssignment(
    actualHostPage,
    actualHostFixture,
    {
      crewId: actualHostFixture.paintCrewId,
      crewName: actualHostFixture.paintCrewName,
      trade: 'paint',
    },
  );
  const cleanAssignment = await proveActualHostAssignment(
    actualHostPage,
    actualHostFixture,
    {
      crewId: actualHostFixture.cleanCrewId,
      crewName: actualHostFixture.cleanCrewName,
      trade: 'clean',
    },
  );
  assert.deepEqual(
    await assignmentEventSummary(actualHostPage, actualHostFixture, 'paint'),
    paintAssignment,
    'Clean work must not alter the confirmed Paint assignment.',
  );
  assert.deepEqual(
    await assignmentEventSummary(actualHostPage, actualHostFixture, 'clean'),
    cleanAssignment,
    'Clean work must retain exactly one confirmed assignment after reload.',
  );
  await assertNoHorizontalOverflow(actualHostPage, 'actual host Paint and Clean assignment proof');
  assert.deepEqual(
    actualHostFindings,
    [],
    `actual host Paint/Clean: ${actualHostFindings.join('\n')}`,
  );
  await actualHostContext.close();

  const unavailableContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const unavailablePage = await unavailableContext.newPage();
  const unavailableFindings = runtimeFindings(unavailablePage);
  await unavailablePage.goto(
    `${baseUrl}${previewPath}?scopeStorage=unavailable`,
    { waitUntil: 'networkidle' },
  );
  await unavailablePage
    .locator('.phase2-track-b-exceptions')
    .getByText('Exceptions', { exact: true })
    .click();
  await unavailablePage
    .getByText('Additional Scope saving is unavailable', { exact: true })
    .waitFor();
  assert.equal(
    await unavailablePage
      .getByRole('button', { name: 'Add additional scope' })
      .count(),
    0,
    'No save workflow may appear without an approved durable callback.',
  );
  assert.equal(
    await unavailablePage.getByRole('form', { name: 'Additional scope' }).count(),
    0,
  );
  assert.equal(
    await unavailablePage.getByText(/Required added scope stays unresolved/iu).count(),
    1,
  );
  await assertNoHorizontalOverflow(unavailablePage, 'unavailable scope');
  assert.deepEqual(
    unavailableFindings,
    [],
    `unavailable scope: ${unavailableFindings.join('\n')}`,
  );
  await unavailableContext.close();

  console.log(
    `Phase 2 Track B browser gate passed. Screenshots: ${screenshots.join(', ')}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
