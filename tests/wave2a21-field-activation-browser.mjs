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
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  await primaryNavigation(page)
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page.getByRole('heading', { name: 'More', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Setup/u }).click();
  await page.getByRole('heading', { name: 'Activate project', exact: true }).waitFor();
  await page.getByText(
    'Step 1 of 5. The paper TurnBoard remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByLabel('Project name', { exact: true }).fill('Moon Tower Personal Turn');
  await page.getByLabel('Property name', { exact: true }).fill('Moon Tower');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 2 of 5. The paper TurnBoard remains authoritative.',
    { exact: true },
  ).waitFor();
  assert.equal(await page.getByLabel('Paint', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Clean', { exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 3 of 5. The paper TurnBoard remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByRole('textbox', { name: 'Working hours', exact: true })
    .fill('Synthetic occupied-area window: 10 AM–5 PM.');
  await page.getByRole('textbox', { name: 'Daily walkthrough', exact: true })
    .fill('Synthetic daily walkthrough at noon.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 4 of 5. The paper TurnBoard remains authoritative.',
    { exact: true },
  ).waitFor();
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Property Contact');
  assert.equal(await page.getByLabel('Primary daily contact').isChecked(), true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText(
    'Step 5 of 5. The paper TurnBoard remains authoritative.',
    { exact: true },
  ).waitFor();
  const activate = page.getByRole('button', {
    name: 'Activate personal project',
    exact: true,
  });
  assert.equal(await activate.isDisabled(), true);
  await page.getByLabel(
    'Replace the saved personal setup for this existing project.',
    { exact: true },
  ).check();
  await activate.click();

  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  const stored = await page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  }, storageKey);
  assert.ok(stored, 'project activation did not produce a durable local snapshot');
  assert.equal(stored.projects.length, 1);
  assert.equal(stored.projects[0].propertyName, 'Moon Tower');
  assert.equal(stored.projects[0].fieldConfiguration.status, 'active');
  assert.equal(stored.projects[0].fieldConfiguration.enabledTrades.paint, true);
  assert.equal(stored.projects[0].fieldConfiguration.enabledTrades.clean, true);
  assert.equal(
    stored.propertyContacts.filter((contact) => contact.isPrimary).length,
    1,
  );
  assert.equal(
    stored.fieldEvents.filter((event) => event.eventType === 'project-activated').length,
    1,
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.getByText('Moon Tower', { exact: true }).first().waitFor();

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

  await page.getByRole('button', { name: /^Import today’s released work/u })
    .first()
    .click();
  const manualRelease = page.getByTestId('manual-release-review');
  await manualRelease.waitFor();
  const manualInputs = manualRelease.locator('input');
  await manualInputs.nth(0).fill('Synthetic Property Contact');
  await manualInputs.nth(1).fill(routeFixture.unitNumber);
  await manualRelease.locator('.w2a2-core-release__sections input').first().check();
  await manualRelease.locator('.w2a2-core-confirm input').check();
  await manualRelease.getByRole('button', { name: 'Confirm personal release', exact: true }).click();
  await page.getByTestId('track-b-home').waitFor();
  await page.waitForTimeout(750);
  const releaseFixture = await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    const release = [...data.dailyReleaseBatches]
      .filter((batch) => batch.projectId === data.activeProjectId && batch.status === 'confirmed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return release ? { date: release.date, releaseId: release.id } : null;
  }, storageKey);
  assert.ok(releaseFixture, 'manual release did not produce a durable confirmed batch');

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
  await page.getByRole('heading', { name: 'Bulk assign', exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Bulk assign', exact: true }).waitFor();

  await page.goto(`${baseUrl}/#/walk`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Start Walk', exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Start Walk', exact: true }).waitFor();

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
  const beforeStartDay = await page.evaluate(({ key, releaseId }) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return {
      activeProjectId: data.activeProjectId,
      release: data.dailyReleaseBatches.find((batch) => batch.id === releaseId),
    };
  }, { key: storageKey, releaseId: releaseFixture.releaseId });
  assert.equal(beforeStartDay.release?.projectId, beforeStartDay.activeProjectId);
  assert.equal(beforeStartDay.release?.date, releaseFixture.date);
  assert.equal(beforeStartDay.release?.status, 'confirmed');
  await page.getByRole('button', { name: 'Start Day', exact: true }).first().click();
  await page.getByTestId('track-b-start-day').waitFor();
  for (let step = 1; step <= 7; step += 1) {
    await page.getByText(`Step ${step} of 8`, { exact: true }).waitFor();
    if (step === 2) {
      assert.equal(
        await page.getByTestId('track-b-start-day').getByRole('textbox').first().inputValue(),
        'Synthetic Property Contact',
      );
    }
    if (step === 4) {
      const evidenceField = page.getByTestId('track-b-start-day').locator('textarea');
      assert.equal(
        await evidenceField.count(),
        1,
        `confirmed synthetic release was not rendered: ${await page.getByTestId('track-b-start-day').innerText()}`,
      );
      await evidenceField.first().fill(
        'Synthetic evidence reviewed for the atomic Start Day browser check.',
      );
    }
    if (step === 6) {
      const wordingFields = page.getByTestId('track-b-start-day').locator('textarea');
      await wordingFields.nth(0).fill(
        'Synthetic occupied-area window: 10 AM–5 PM.',
      );
      await wordingFields.nth(1).fill(
        'Synthetic daily walkthrough at noon.',
      );
    }
    if (step === 7) {
      await page.getByTestId('track-b-start-day').locator('textarea').first().fill(
        'Preserve this review through one failed save.',
      );
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByText('Step 8 of 8', { exact: true }).waitFor();
  await page.getByText('I reviewed the Start Day details.', { exact: true }).click();

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
    'Start Day was not saved. Nothing was started or added to Activity. Retry, edit the review, or cancel.',
    { exact: true },
  ).waitFor();
  await page.getByRole('button', { name: 'Retry Start Day', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit review', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor();
  const afterFailedStart = await page.evaluate(({ date, key, releaseId }) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return {
      releaseStillPresent: data.dailyReleaseBatches.some((batch) => batch.id === releaseId),
      sessionCount: data.daySessions.filter((session) =>
        session.projectId === data.activeProjectId && session.date === date).length,
      startEventCount: data.fieldEvents.filter((event) =>
        event.projectId === data.activeProjectId && event.eventType === 'day-session-started').length,
    };
  }, { date: releaseFixture.date, key: storageKey, releaseId: releaseFixture.releaseId });
  assert.deepEqual(afterFailedStart, {
    releaseStillPresent: true,
    sessionCount: 0,
    startEventCount: 0,
  });
  await page.getByText('Preserve this review through one failed save.', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Retry Start Day', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByTestId('track-b-home').waitFor();
  await primaryNavigation(page).waitFor();
  const afterSuccessfulRetry = await page.evaluate(({ date, key }) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return {
      sessionCount: data.daySessions.filter((session) =>
        session.projectId === data.activeProjectId && session.date === date).length,
      startEventCount: data.fieldEvents.filter((event) =>
        event.projectId === data.activeProjectId && event.eventType === 'day-session-started').length,
    };
  }, { date: releaseFixture.date, key: storageKey });
  assert.deepEqual(afterSuccessfulRetry, { sessionCount: 1, startEventCount: 1 });
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__turnOsOriginalStorageSetItem;
    delete window.__turnOsOriginalStorageSetItem;
    delete window.__turnOsFailNextAppDataSave;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('track-b-home').waitFor();
  await page.getByText('Active', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Open central Plus menu' }).click();
  const plus = page.getByRole('dialog', { name: 'Add to Turn OS' });
  await plus.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(
    await plus.getByRole('button', { name: /^Import Work/u }).isDisabled(),
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
  await context.close();
  console.log('Wave 2A.2.1 field-activation browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
