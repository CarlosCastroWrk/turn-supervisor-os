import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4241;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';

const primaryNavigation = (page) =>
  page.getByRole('navigation', { name: 'Primary' });

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a21-field-activation-vite',
  configLoader: 'runner',
  envFile: false,
  logLevel: 'error',
  root: process.cwd(),
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  const findings = [];
  const timingStarts = new Map();
  const timings = {};
  const startTiming = (label) => timingStarts.set(label, performance.now());
  const stopTiming = (label) => {
    const startedAt = timingStarts.get(label);
    assert.ok(startedAt, `${label} timing did not start.`);
    timings[label] = Number(((performance.now() - startedAt) / 1000).toFixed(2));
  };
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') findings.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    findings.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.addInitScript(() => {
    const initializationKey = 'wave2a21-field-activation-browser-initialized';
    if (window.sessionStorage.getItem(initializationKey) === 'true') return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(initializationKey, 'true');
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Welcome to Turn OS', exact: true }).waitFor();

  startTiming('setup-and-reopen');
  await page.getByRole('button', { name: /Set Up Your Property|Continue Property Setup/u }).click();
  await page.getByRole('heading', { name: 'Set up project', exact: true }).waitFor();
  await page.getByText(
    'Step 1 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByLabel('Property name', { exact: true }).fill('Moon Tower');
  await page.getByLabel('Property location', { exact: true }).fill('Synthetic Austin property');
  await page.getByLabel('Turn start date', { exact: true }).fill('2026-08-01');
  await page.getByLabel('Turn end date', { exact: true }).fill('2026-08-15');
  await page.getByLabel('Supervisor name', { exact: true }).fill('Los');
  assert.equal(await page.getByLabel('Paint', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Clean', { exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 2 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  if (await page.getByLabel('Name', { exact: true }).count() === 0) {
    await page.getByRole('button', { name: 'Add Property Contact', exact: true }).click();
  }
  const setupContacts = page.locator('.w2a21a-setup__contact');
  await setupContacts.nth(0).getByLabel('Name', { exact: true }).fill('Joseph');
  await setupContacts.nth(0).locator('select').selectOption('Property Manager');
  await page.getByRole('button', { name: 'Add Property Contact', exact: true }).click();
  await setupContacts.nth(1).getByLabel('Name', { exact: true }).fill('Paige');
  await setupContacts.nth(1).locator('select').selectOption('Property Manager');
  await setupContacts.nth(0).getByLabel('Default daily contact', { exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 3 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByRole('button', { name: 'Add Paint crew', exact: true }).click();
  await page.getByRole('button', { name: 'Add Clean crew', exact: true }).click();
  await page.getByLabel('Paint crew name', { exact: true }).first().fill('Jose Paint');
  await page.getByLabel('Clean crew name', { exact: true }).first().fill('Los Clean');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 4 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByLabel('Unit numbers — paste the whole list at once', { exact: true }).fill(
    '101 102 103 104 105 106 107 108 109 110',
  );
  await page.locator('.w2a21a-setup__roster-entry select').selectOption('3');
  await page.getByRole('button', { name: 'Add Units', exact: true }).click();
  await page.getByText('10 Units added to the personal roster draft.', {
    exact: true,
  }).waitFor();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome to Turn OS', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue Property Setup', exact: true }).click();
  await page.getByText(
    'Step 4 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.locator('.w2a21a-setup__roster-summary')
    .getByText('10', { exact: true })
    .waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(
    'Step 4 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.locator('.w2a21a-setup__roster-summary')
    .getByText('10', { exact: true })
    .waitFor();
  await page.getByText(
    'Your unfinished setup draft was restored from this device.',
    { exact: true },
  ).waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 5 of 5 · Paper remains authoritative.',
    { exact: true },
  ).waitFor();
  const activate = page.getByRole('button', {
    name: 'Activate Project',
    exact: true,
  });
  assert.equal(await activate.isEnabled(), true);
  assert.equal(
    await page.getByLabel(
      'Replace the saved personal setup for this existing project.',
      { exact: true },
    ).count(),
    0,
  );
  await activate.click();

  const homeHeading = page.getByRole('heading', { name: 'Home', exact: true });
  const activationErrors = page.locator('.w2a21a-setup__errors');
  await Promise.race([
    homeHeading.waitFor(),
    activationErrors.waitFor(),
  ]);
  if (await activationErrors.isVisible()) {
    assert.fail(`project activation failed:\n${await activationErrors.innerText()}`);
  }
  await homeHeading.waitFor();
  const stored = await page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  }, storageKey);
  assert.ok(stored, 'project activation did not produce a durable local snapshot');
  const activeProject = stored.projects.find(
    (project) => project.id === stored.activeProjectId,
  );
  assert.ok(activeProject, 'activated project is not the active personal project');
  assert.equal(activeProject.propertyName, 'Moon Tower');
  assert.equal(activeProject.fieldConfiguration.status, 'active');
  assert.equal(activeProject.fieldConfiguration.enabledTrades.paint, true);
  assert.equal(activeProject.fieldConfiguration.enabledTrades.clean, true);
  assert.equal(
    stored.propertyContacts.filter((contact) =>
      contact.projectId === stored.activeProjectId && contact.isPrimary).length,
    1,
  );
  assert.equal(
    stored.fieldEvents.filter((event) =>
      event.projectId === stored.activeProjectId
      && event.eventType === 'project-activated').length,
    1,
  );
  assert.deepEqual(
    stored.units
      .filter((unit) => unit.projectId === stored.activeProjectId)
      .map((unit) => unit.unitNumber)
      .sort((left, right) => left.localeCompare(right)),
    ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'],
  );
  assert.deepEqual(
    stored.crewMembers
      .filter((crew) => crew.projectId === stored.activeProjectId)
      .map((crew) => [crew.name, crew.trade])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ['Jose Paint', 'Painter'],
      ['Los Clean', 'Cleaner'],
    ],
  );
  assert.deepEqual(
    stored.propertyContacts
      .filter((contact) => contact.projectId === stored.activeProjectId)
      .map((contact) => contact.name)
      .sort((left, right) => left.localeCompare(right)),
    ['Joseph', 'Paige'],
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.getByText('Moon Tower', { exact: true }).first().waitFor();
  stopTiming('setup-and-reopen');

  const routeFixture = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const unit = data?.units?.find((candidate) =>
      candidate.projectId === data.activeProjectId);
    const crew = data?.crewMembers?.find((candidate) =>
      (!candidate.projectId || candidate.projectId === data.activeProjectId)
      && (candidate.trade === 'Painter' || candidate.trade === 'Cleaner'));
    return unit && crew
      ? {
          crewId: crew.id,
          crewName: crew.name,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
        }
      : null;
  }, storageKey);
  assert.ok(routeFixture, 'synthetic route fixtures were not available');

  const unitRoute = `${baseUrl}/#/units/${encodeURIComponent(routeFixture.unitId)}`;
  const crewRoute = `${baseUrl}/#/crews/${encodeURIComponent(routeFixture.crewId)}`;
  await page.goto(unitRoute, { waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: `Unit ${routeFixture.unitNumber}`,
    exact: true,
  }).waitFor();
  assert.equal(new URL(page.url()).hash, `#/units/${encodeURIComponent(routeFixture.unitId)}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: `Unit ${routeFixture.unitNumber}`,
    exact: true,
  }).waitFor();

  await page.goto(crewRoute, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: routeFixture.crewName, exact: true }).waitFor();
  await page.goBack({ waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: `Unit ${routeFixture.unitNumber}`,
    exact: true,
  }).waitFor();
  await page.goForward({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: routeFixture.crewName, exact: true }).waitFor();

  await page.goto(`${baseUrl}/#/assignments`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assign Crews', exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assign Crews', exact: true }).waitFor();

  await page.goto(`${baseUrl}/#/walk`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: 'No work is ready to walk.',
    exact: true,
  }).waitFor();
  await page.getByRole('button', { name: 'Return to TurnBoard', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/walk');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: 'No work is ready to walk.',
    exact: true,
  }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/walk');

  await page.goto(`${baseUrl}/#/dashboard?summary=working`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Working', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/dashboard?summary=working');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Working', exact: true }).waitFor();

  await page.goto(`${baseUrl}/#/units/stale-unit-id`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', {
    name: 'Field workflow unavailable',
    exact: true,
  }).waitFor();
  await page.getByRole('alert').getByText(
    'This Unit is not present in the active personal project.',
    { exact: true },
  ).waitFor();
  assert.equal(new URL(page.url()).hash, '#/units/stale-unit-id');

  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await primaryNavigation(page)
    .getByRole('button', { name: 'Activity', exact: true })
    .click();
  await page.getByText(
    /Activated the personal Turn OS project for Moon Tower/u,
  ).waitFor();

  await primaryNavigation(page)
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  const beforeStartDay = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return {
      releaseCount: data.dailyReleaseBatches.filter((batch) =>
        batch.projectId === data.activeProjectId).length,
      sessionCount: data.daySessions.filter((session) =>
        session.projectId === data.activeProjectId).length,
    };
  }, storageKey);
  assert.deepEqual(beforeStartDay, { releaseCount: 0, sessionCount: 0 });
  startTiming('start-day-with-failed-save-retry');
  await page.getByRole('button', { name: 'Start Day', exact: true }).first().click();
  const fastStartDay = page.locator('[data-fast-start-day="true"]');
  await fastStartDay.waitFor();
  await page.getByText('Screen 1 of 4 · Day and access', { exact: true }).waitFor();
  const savedContactSelect = fastStartDay.locator('select').first();
  assert.notEqual(
    await savedContactSelect.inputValue(),
    '',
    'saved Property Contact was not reused',
  );
  await page.getByLabel('Received', { exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 2 of 4 · Daily release', { exact: true }).waitFor();
  await page.getByLabel('Both', { exact: true }).check();
  await page.getByLabel('Exact Unit numbers', { exact: true }).fill(
    '101, 102, 103, 104, 105, 106, 107, 108, 109, 110',
  );
  await page.getByRole('button', { name: 'Add exact Units', exact: true }).click();
  await page.getByText('10 selected', { exact: true }).waitFor();
  await fastStartDay.locator('.w2a21a-release__confirm input').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 3 of 4 · Crews and defaults', { exact: true }).waitFor();
  await page.getByLabel('Personal note', { exact: true }).fill(
    'Preserve this review through one failed save.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 4 of 4 · Review and Start Day', { exact: true }).waitFor();
  await fastStartDay.locator('.w2a21a-setup__switch input').check();

  await page.evaluate((key) => {
    window.__turnOsOriginalStorageSetItem = Storage.prototype.setItem;
    window.__turnOsFailNextAppDataSave = true;
    Storage.prototype.setItem = function setItemWithOneSyntheticFailure(name, value) {
      if (name === key && window.__turnOsFailNextAppDataSave) {
        window.__turnOsFailNextAppDataSave = false;
        throw new DOMException('Synthetic local persistence failure.', 'QuotaExceededError');
      }
      return window.__turnOsOriginalStorageSetItem.call(this, name, value);
    };
  }, storageKey);

  await page.getByRole('button', { name: 'Start Day', exact: true }).click();
  await page.getByRole('alert').getByText(
    'Start Day was not saved. Nothing was started, released, or added to Activity. Retry, edit, or cancel.',
    { exact: true },
  ).waitFor();
  const afterFailedStart = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return {
      releaseCount: data.dailyReleaseBatches.filter((batch) =>
        batch.projectId === data.activeProjectId).length,
      sessionCount: data.daySessions.filter((session) =>
        session.projectId === data.activeProjectId).length,
      startEventCount: data.fieldEvents.filter((event) =>
        event.projectId === data.activeProjectId && event.eventType === 'day-session-started').length,
    };
  }, storageKey);
  assert.deepEqual(afterFailedStart, {
    releaseCount: 0,
    sessionCount: 0,
    startEventCount: 0,
  });
  await page.getByText('Preserve this review through one failed save.', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Start Day', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByTestId('track-b-home').waitFor();
  await primaryNavigation(page).waitFor();
  const afterSuccessfulRetry = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const release = [...data.dailyReleaseBatches]
      .filter((batch) =>
        batch.projectId === data.activeProjectId && batch.status === 'confirmed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return {
      releaseId: release?.id,
      releaseItemCount: release?.items?.length ?? 0,
      sessionCount: data.daySessions.filter((session) =>
        session.projectId === data.activeProjectId).length,
      startEventCount: data.fieldEvents.filter((event) =>
        event.projectId === data.activeProjectId && event.eventType === 'day-session-started').length,
    };
  }, storageKey);
  assert.ok(afterSuccessfulRetry.releaseId);
  assert.equal(afterSuccessfulRetry.releaseItemCount, 80);
  assert.equal(afterSuccessfulRetry.sessionCount, 1);
  assert.equal(afterSuccessfulRetry.startEventCount, 1);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__turnOsOriginalStorageSetItem;
    delete window.__turnOsOriginalStorageSetItem;
    delete window.__turnOsFailNextAppDataSave;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('track-b-home').waitFor();
  await page.getByText('Active', { exact: true }).waitFor();
  stopTiming('start-day-with-failed-save-retry');

  const assignAllReleased = async (trade, crewName, expectedAssignmentCount) => {
    await page.goto(`${baseUrl}/#/assignments`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Assign Crews', exact: true }).waitFor();
    if (trade === 'Clean') {
      await page.getByRole('button', { name: 'Clean', exact: true }).click();
    }
    await page.getByLabel('Compatible crew').selectOption({ label: crewName });
    const choices = page.locator('fieldset.track-c-choice-list label');
    assert.equal(await choices.count(), 10, `${trade} did not expose all 10 released Units.`);
    for (let index = 0; index < 10; index += 1) {
      await choices.nth(index).locator('input[type="checkbox"]').check();
    }
    await page.getByRole('button', { name: 'Review personal proposal' }).click();
    const proposal = page.getByRole('region', {
      name: 'Assignment proposal review',
    });
    await proposal.waitFor();
    await proposal.getByText('40 eligible · 0 blocked', { exact: true }).waitFor();
    await proposal.getByRole('button', {
      name: 'Confirm personal assignment',
      exact: true,
    }).click();
    await page.getByText('40 assignments saved — crews are Working.', {
      exact: true,
    }).waitFor();
    await page.waitForFunction(
      ({ key, expected }) => {
        const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
        if (!data?.activeProjectId || !Array.isArray(data.fieldEvents)) return false;
        return data.fieldEvents.filter((event) =>
          event.projectId === data.activeProjectId
          && event.eventType === 'assignment-confirmed').length === expected;
      },
      { expected: expectedAssignmentCount, key: storageKey },
    );
  };

  startTiming('bulk-assign-paint-and-clean');
  await assignAllReleased('Paint', 'Jose Paint', 40);
  await assignAllReleased('Clean', 'Los Clean', 80);
  stopTiming('bulk-assign-paint-and-clean');

  const assignmentProof = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const events = data.fieldEvents.filter((event) =>
      event.projectId === data.activeProjectId
      && event.eventType === 'assignment-confirmed');
    return {
      eventCount: events.length,
      uniqueTargets: new Set(events.map((event) =>
        `${event.unitId}:${event.trade}:${event.section}`)).size,
      unit101Id: data.units.find((unit) =>
        unit.projectId === data.activeProjectId && unit.unitNumber === '101')?.id,
      joseId: data.crewMembers.find((crew) =>
        crew.projectId === data.activeProjectId && crew.name === 'Jose Paint')?.id,
      losCleanId: data.crewMembers.find((crew) =>
        crew.projectId === data.activeProjectId && crew.name === 'Los Clean')?.id,
      joseContactId: data.propertyContacts.find((contact) =>
        contact.projectId === data.activeProjectId && contact.name === 'Joseph')?.id,
    };
  }, storageKey);
  assert.equal(assignmentProof.eventCount, 80);
  assert.equal(assignmentProof.uniqueTargets, 80);
  assert.ok(
    assignmentProof.unit101Id
      && assignmentProof.joseId
      && assignmentProof.losCleanId
      && assignmentProof.joseContactId,
    'Unit 101, crews, or Joseph were missing after actual-host assignment.',
  );

  await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'actual-host TurnBoard at 390px');
  await page.screenshot({
    fullPage: true,
    path: '/private/tmp/personal-alpha-0.2-turnboard-390.png',
  });

  await page.goto(
    `${baseUrl}/#/units/${encodeURIComponent(assignmentProof.unit101Id)}`,
    { waitUntil: 'networkidle' },
  );
  const unitDetail = page.getByTestId('track-c-unit-detail');
  await unitDetail.getByRole('heading', { name: 'Unit 101', exact: true }).waitFor();
  for (const viewport of [
    { height: 700, label: '320', width: 320 },
    { height: 844, label: '390', width: 390 },
    { height: 932, label: '430', width: 430 },
  ]) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await assertNoHorizontalOverflow(page, `actual-host Unit 101 at ${viewport.label}px`);
    await page.screenshot({
      fullPage: true,
      path: `/private/tmp/personal-alpha-0.2-unit-101-${viewport.label}.png`,
    });
  }
  await page.setViewportSize({ height: 844, width: 390 });
  const paintPanel = unitDetail.locator('.track-c-trade-panel.is-paint');
  const cleanPanel = unitDetail.locator('.track-c-trade-panel.is-clean');
  startTiming('crew-complete-inspection-callback-reinspection');
  await paintPanel.getByRole('button', {
    name: 'Crew reports Paint complete',
    exact: true,
  }).click();
  await page.getByText(
    'Paint crew completion saved for 4 sections. Los inspection remains separate.',
    { exact: true },
  ).waitFor();

  const sectionRow = (panel, section) =>
    panel.locator('.track-c-section-row').filter({
      has: page.locator('.track-c-section-row__section', {
        hasText: new RegExp(`^${section}$`, 'u'),
      }),
    });
  const runSectionAction = async (section, action, expectedState) => {
    const row = sectionRow(paintPanel, section);
    if (await row.locator('.track-c-section-row__trigger').getAttribute('aria-expanded') !== 'true') {
      await row.locator('.track-c-section-row__trigger').click();
    }
    await row.getByRole('button', { name: action, exact: true }).click();
    await row.getByRole('button', {
      name: new RegExp(`^${section}: ${expectedState}`, 'u'),
    }).waitFor();
  };

  for (const section of ['Common', 'B', 'C']) {
    await runSectionAction(
      section,
      'Record Los pass',
      'Los passed · property walk pending',
    );
  }
  await runSectionAction('A', 'Open callback', 'Callback open');
  assert.equal(
    await page.getByRole('heading', { name: 'Start Walk', exact: true }).count(),
    0,
    'A partial Paint pass must not expose a Walk while a callback is open.',
  );
  await runSectionAction('A', 'Correction reported ready', 'Reinspection pending');
  await runSectionAction(
    'A',
    'Pass reinspection',
    'Los passed · property walk pending',
  );
  await paintPanel.getByText('4/4 Los passed', { exact: true }).waitFor();
  await cleanPanel.getByText('4/4 working', { exact: true }).waitFor();
  stopTiming('crew-complete-inspection-callback-reinspection');

  startTiming('property-walk-and-reopen');
  await page.goto(`${baseUrl}/#/walk`, { waitUntil: 'networkidle' });
  const startWalkHeading = page.getByRole('heading', {
    name: 'Start Walk',
    exact: true,
  });
  await Promise.race([
    startWalkHeading.waitFor(),
    page.getByRole('heading', {
      name: 'No work is ready to walk.',
      exact: true,
    }).waitFor(),
    page.getByRole('heading', {
      name: 'Add a Property Contact first.',
      exact: true,
    }).waitFor(),
  ]);
  assert.equal(
    await startWalkHeading.count(),
    1,
    `actual-host Walk did not expose eligible work:\n${
      await page.getByTestId('track-c-field-ops').innerText()
    }`,
  );
  await page.locator('.track-c-field select')
    .selectOption(assignmentProof.joseContactId);
  const walkCandidates = page.locator('.track-c-walk-candidates > label');
  assert.equal(await walkCandidates.count(), 1);
  await walkCandidates.filter({ hasText: /Unit 101.*Paint/su })
    .locator('input[type="checkbox"]')
    .check();
  await page.getByRole('checkbox', {
    name: /I inspected every released section in these jobs/u,
  }).check();
  await page.getByRole('button', { name: 'Review Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Review Walk', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Active Walk', exact: true }).waitFor();
  assert.match(new URL(page.url()).hash, /^#\/walk\/[^/]+$/u);

  await page.getByRole('button', { name: 'Accepted', exact: true }).click();
  const walkNote = 'Joseph accepted Unit 101 Paint in the synthetic Alpha loop.';
  await page.locator('.track-c-walk-note textarea').fill(walkNote);
  await page.getByRole('button', { name: 'Review End Walk', exact: true }).click();
  try {
    await page.getByRole('heading', {
      name: 'Review End Walk',
      exact: true,
    }).waitFor({ timeout: 10_000 });
  } catch (error) {
    const persisted = await page.evaluate((key) =>
      window.localStorage.getItem(key), storageKey);
    throw new Error(
      `actual-host Walk did not enter end review:\n${
        await page.getByTestId('track-c-field-ops').innerText()
      }\nPersisted AppData:\n${persisted ?? 'missing'}`,
      { cause: error },
    );
  }
  await page.waitForFunction(
    ({ key, note }) => {
      const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
      const walk = data?.walkSessions?.find((candidate) =>
        candidate.status === 'active');
      return (
        walk?.note?.includes(note)
        && walk.note.includes('"stage":"end-review"')
        && walk.outcomes?.length === 0
      );
    },
    {
      key: storageKey,
      note: walkNote,
    },
  );

  await page.reload({ waitUntil: 'networkidle' });
  try {
    await page.getByRole('heading', {
      name: 'Review End Walk',
      exact: true,
    }).waitFor({ timeout: 10_000 });
  } catch (error) {
    const persisted = await page.evaluate((key) =>
      window.localStorage.getItem(key), storageKey);
    throw new Error(
      `actual-host Walk did not restore end review after reload at ${
        page.url()
      }:\n${
        await page.locator('body').innerText()
      }\nPersisted AppData after reload:\n${persisted ?? 'missing'}`,
      { cause: error },
    );
  }
  const restoredWalkNotes = page.getByText(walkNote, { exact: true });
  assert.equal(
    await restoredWalkNotes.count(),
    4,
    'the restored Unit+Trade review did not preserve the note for every selected section',
  );
  await restoredWalkNotes.first().waitFor();
  await page.getByRole('button', { name: 'Continue Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Active Walk', exact: true }).waitFor();
  assert.equal(
    await page.locator('.track-c-walk-note textarea').inputValue(),
    walkNote,
  );
  await page.getByRole('button', { name: 'Review End Walk', exact: true }).click();
  await page.getByRole('button', { name: 'End Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Latest walk', exact: true }).waitFor();
  await page.waitForFunction(
    ({ expectedOutcomeCount, key, note }) => {
      const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
      const walk = data?.walkSessions?.find((candidate) =>
        candidate.status === 'closed');
      return (
        walk?.note?.includes(note)
        && walk.outcomes?.length === expectedOutcomeCount
        && walk.outcomes.every((outcome) => outcome.outcome === 'accepted')
      );
    },
    {
      expectedOutcomeCount: 4,
      key: storageKey,
      note: walkNote,
    },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Latest walk', exact: true }).waitFor();

  await page.goto(
    `${baseUrl}/#/units/${encodeURIComponent(assignmentProof.unit101Id)}`,
    { waitUntil: 'networkidle' },
  );
  await page.getByTestId('track-c-unit-detail')
    .getByRole('heading', { name: 'Unit 101', exact: true })
    .waitFor();
  await page.locator('.track-c-trade-panel.is-paint')
    .getByText('4/4 accepted', { exact: true })
    .waitFor();
  await page.locator('.track-c-trade-panel.is-clean')
    .getByText('4/4 working', { exact: true })
    .waitFor();
  stopTiming('property-walk-and-reopen');

  startTiming('end-day-and-history');
  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await page.getByTestId('track-b-home').waitFor();
  await page.getByRole('button', { name: /End day/u }).click();
  const endDay = page.getByTestId('track-b-end-day');
  await endDay.waitFor();
  await endDay.getByLabel('Reviewed', { exact: true }).check();
  await endDay.getByLabel('Yes', { exact: true }).check();
  await endDay.getByRole('checkbox', {
    name: 'I reviewed the summary and want to close this personal Day Session.',
    exact: true,
  }).check();
  await endDay.getByRole('button', { name: 'Close Day Session', exact: true }).click();
  await page.getByTestId('track-b-home').waitFor();
  await page.getByText('Closed', { exact: true }).waitFor();
  await page.waitForFunction(
    (key) => {
      const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
      return data?.daySessions?.some((session) =>
        session.projectId === data.activeProjectId && session.status === 'closed');
    },
    storageKey,
  );

  const completedLoop = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const projectEvents = data.fieldEvents.filter((event) =>
      event.projectId === data.activeProjectId);
    const count = (eventType) =>
      projectEvents.filter((event) => event.eventType === eventType).length;
    const closedWalk = data.walkSessions.find((walk) => walk.status === 'closed');
    const closedDay = data.daySessions.find((session) =>
      session.projectId === data.activeProjectId && session.status === 'closed');
    return {
      assignmentCount: count('assignment-confirmed'),
      callbackCount: count('callback-opened'),
      correctionCount: count('callback-correction-reported'),
      crewCompleteCount: count('crew-reported-complete'),
      losPassCount: count('los-passed'),
      reinspectionCount: count('callback-resolved'),
      acceptedWalkOutcomes: closedWalk?.outcomes.filter((outcome) =>
        outcome.outcome === 'accepted').length ?? 0,
      closedDay: Boolean(closedDay),
      closedWalk: Boolean(closedWalk),
    };
  }, storageKey);
  assert.deepEqual(completedLoop, {
    assignmentCount: 80,
    callbackCount: 1,
    correctionCount: 1,
    crewCompleteCount: 4,
    losPassCount: 3,
    reinspectionCount: 1,
    acceptedWalkOutcomes: 4,
    closedDay: true,
    closedWalk: true,
  });

  await primaryNavigation(page)
    .getByRole('button', { name: 'Activity', exact: true })
    .click();
  await page.getByText('Los opened a callback for the responsible crew.', {
    exact: true,
  }).waitFor();
  await page.getByText(
    'Correction was reported ready. Los reinspection is still required.',
    { exact: true },
  ).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Moon Tower', { exact: true }).first().waitFor();
  stopTiming('end-day-and-history');

  startTiming('backup-export');
  await primaryNavigation(page)
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('button', { name: /^Backup and Restore/u }).click();
  await page.waitForURL(`${baseUrl}/#/export`);
  await page.getByRole('heading', { name: 'Data and backup', exact: true }).waitFor();
  const backupDownload = page.waitForEvent('download');
  const backupButton = page.getByRole('button').filter({
    hasText: 'Full Device JSON Backup',
  });
  await backupButton.waitFor();
  await backupButton.click();
  const downloadedBackup = await backupDownload;
  assert.match(
    downloadedBackup.suggestedFilename(),
    /^turn-supervisor-backup-\d{4}-\d{2}-\d{2}\.json$/u,
  );
  stopTiming('backup-export');

  await page.getByRole('button', { name: 'Open central Plus menu' }).click();
  const plus = page.getByRole('dialog', { name: 'Add to Turn OS' });
  await plus.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(
    await plus.getByRole('button', { name: /^Add Release Batch/u }).isEnabled(),
    true,
  );
  assert.equal(await page.getByText('Field Copilot', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Close Add to Turn OS' }).click();
  await plus.waitFor({ state: 'hidden' });

  await primaryNavigation(page)
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('button', { name: /^Profile/u }).click();
  const profile = page.getByRole('region', {
    name: 'Profile detail content',
    exact: true,
  });
  await profile.waitFor();
  assert.equal(await profile.getAttribute('data-turn-scroll-region'), 'primary');
  assert.equal(
    await profile.evaluate((element) => getComputedStyle(element).overflowY),
    'auto',
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /^Privacy/u }).click();
  const privacy = page.getByRole('region', {
    name: 'Privacy detail content',
    exact: true,
  });
  await privacy.waitFor();
  assert.equal(await privacy.getAttribute('data-turn-scroll-region'), 'primary');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();

  await assertNoHorizontalOverflow(page, 'Wave 2A.2.1 host');
  assert.deepEqual(findings, [], `runtime findings:\n${findings.join('\n')}`);
  console.log(`Synthetic Alpha 0.2 timings: ${JSON.stringify(timings)}`);
  await context.close();
  console.log('Wave 2A.2.1 field-activation browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
