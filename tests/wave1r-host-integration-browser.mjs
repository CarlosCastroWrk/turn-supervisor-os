import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4210;
const baseUrl = `http://${host}:${port}`;

const viewports = [
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
  { name: 'iPad landscape', viewport: { width: 1024, height: 768 } },
  { name: 'Mac', viewport: { width: 1440, height: 900 } },
];

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

const createSyntheticPage = async (browser, viewport) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  return { context, page };
};

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

const assertSingleCapture = async (page, label) => {
  await page.locator('.capture-workspace[role="dialog"]').waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} mounted multiple Capture owners.`);
  assert.equal(await page.getByRole('dialog').count(), 1, `${label} exposed multiple dialogs.`);
  assert.equal(
    await page.locator('main .page-title h1').filter({ hasText: 'Capture' }).count(),
    0,
    `${label} rendered a route-level Capture page under the overlay.`,
  );
};

const openBoardAssistant = async (page) => {
  const launcher = page.getByRole('button', { name: 'Expand Turn OS assistant', exact: true });
  if (await launcher.count()) {
    await launcher.click();
  }
};

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave1r-host-integration-vite',
  configLoader: 'runner',
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of viewports) {
    const { context, page } = await createSyntheticPage(browser, target.viewport);
    const findings = attachRuntimeChecks(page);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 1);
    assert.equal(await page.locator('.app-shell').count(), 0, `${target.name} wrapped the board in the legacy shell.`);
    assert.deepEqual(
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button').allTextContents(),
      ['TurnBoard', 'Activity', 'More'],
    );
    assert.ok(await page.getByText('Paint', { exact: true }).count() > 0);
    assert.ok(await page.getByText('Clean', { exact: true }).count() > 0);
    await assertNoHorizontalOverflow(page, `${target.name} default board`);

    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 1);
    assert.equal(await page.locator('.app-shell').count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} dashboard alias`);

    await page.goto(`${baseUrl}/#/units/jul28-unit-602`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
    const detailTabs = page.getByRole('tablist', { name: 'Unit 602 detail' });
    assert.equal(await detailTabs.getByRole('tab', { name: 'Paint', exact: true }).count(), 1);
    assert.equal(await detailTabs.getByRole('tab', { name: 'Clean', exact: true }).count(), 1);
    assert.equal(await page.locator('.app-shell').count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} synthetic Unit route`);

    await page.goBack();
    await page.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Unit 602', exact: true }).count(), 0);
    await page.goForward();
    await page.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.locator('.app-shell').waitFor();
    assert.equal(await page.locator('[data-testid="wave1r-shell"]').count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} legacy Review`);

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const boardSession = await createSyntheticPage(browser, { width: 390, height: 844 });
  const boardPage = boardSession.page;
  const boardFindings = attachRuntimeChecks(boardPage);
  await boardPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await boardPage.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();

  const row602 = boardPage.locator('[data-unit-id="jul28-unit-602"]');
  await row602.getByRole('button', { name: 'Open Unit 602', exact: true }).click();
  await boardPage.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
  const unit602Tabs = boardPage.getByRole('tablist', { name: 'Unit 602 detail' });
  assert.equal(await unit602Tabs.getByRole('tab', { name: 'Paint', exact: true }).count(), 1);
  assert.equal(await unit602Tabs.getByRole('tab', { name: 'Clean', exact: true }).count(), 1);

  await boardPage.getByRole('button', { name: /^Paint Common\b/ }).click();
  const actionDialog = boardPage.getByRole('dialog', { name: 'Unit 602' });
  await actionDialog.waitFor();
  await actionDialog.getByRole('button', { name: /^Pass My Inspection/ }).click();
  await actionDialog.getByText(/No official, persisted, or paper state changed/).waitFor();
  await boardPage.keyboard.press('Escape');
  await actionDialog.waitFor({ state: 'hidden' });

  await boardPage.getByRole('button', { name: 'Back to TurnBoard', exact: true }).click();
  await boardPage.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  const paintCrew = row602.getByRole('button', { name: /Paint crew for Unit 602/ });
  await paintCrew.click();
  const crewDialog = boardPage.getByRole('dialog', { name: 'Unit 602 crew' });
  await crewDialog.waitFor();
  assert.deepEqual(
    await crewDialog.getByLabel('Select synthetic crew').locator('option').allTextContents(),
    ['Atlas Paint', 'Bluebird Paint', 'Northline Paint'],
  );
  await crewDialog.getByLabel('Select synthetic crew').selectOption('Atlas Paint');
  await crewDialog.getByRole('button', { name: 'Confirm synthetic proposal', exact: true }).click();
  await crewDialog.getByText(/No official or persisted assignment was created/).waitFor();
  await boardPage.keyboard.press('Escape');
  await crewDialog.waitFor({ state: 'hidden' });

  await row602.getByRole('button', { name: 'Open Unit 602', exact: true }).click();
  await openBoardAssistant(boardPage);
  const plusTrigger = boardPage.getByRole('button', { name: 'Open Turn OS add menu', exact: true });
  await plusTrigger.click();
  const plusDialog = boardPage.getByRole('dialog', { name: 'Add to Turn OS' });
  await plusDialog.waitFor();
  await plusDialog.getByRole('button', { name: /^Note/ }).click();
  await assertSingleCapture(boardPage, 'Board Plus Note');
  const boardBackground = boardPage.locator('.w1r-shell__app');
  assert.equal(await boardBackground.getAttribute('aria-hidden'), 'true');
  assert.notEqual(await boardBackground.getAttribute('inert'), null);
  assert.equal(
    await boardPage.getByText('Capture handoff accepted', { exact: true }).count(),
    0,
    'The hidden board claimed a completed save before Capture completed.',
  );

  await boardPage.getByRole('button', { name: /^NOTE/ }).click();
  await boardPage.getByRole('button', { name: /^Type/ }).click();
  const noteText = 'Unit 602 common paint note from the host integration test.';
  await boardPage.getByRole('textbox', { name: 'Capture wording', exact: true }).fill(noteText);
  await boardPage.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await boardPage.getByRole('button', { name: 'Save note', exact: true }).click();
  await boardPage.getByRole('heading', { name: 'Personal note saved', exact: true }).waitFor();
  await boardPage.getByRole('button', { name: 'Done', exact: true }).click();
  await boardPage.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await boardPage.getByRole('dialog').count(), 0);
  assert.equal(await boardPage.locator(':focus').getAttribute('id'), 'w1r-assistant-plus');

  const primaryNavigation = boardPage.getByRole('navigation', { name: 'Primary' });
  await primaryNavigation.getByRole('button', { name: 'Activity', exact: true }).click();
  await boardPage.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
  const mirroredNote = boardPage.getByRole('listitem').filter({ hasText: noteText });
  await mirroredNote.getByText(noteText, { exact: true }).waitFor();
  assert.equal(await mirroredNote.locator('.w1r-activity-list__marker.is-note').count(), 1);
  await boardPage.getByText('Capture result mirror · session-only and nonpersisted', { exact: true }).waitFor();
  await boardPage.getByText('Pass My Inspection proposed', { exact: true }).waitFor();
  await boardPage.getByText('Assignment proposal confirmed', { exact: true }).waitFor();
  await boardPage.getByRole('listitem')
    .filter({ hasText: noteText })
    .getByRole('button', { name: 'Unit 602', exact: true })
    .click();
  await boardPage.getByRole('heading', { name: 'Unit 602', exact: true }).waitFor();
  await boardPage.getByRole('tab', { name: 'Notes & History', exact: true }).click();
  await boardPage.getByRole('tabpanel').getByText(noteText, { exact: true }).waitFor();

  await boardPage.getByRole('button', { name: /Open Needs Me/ }).click();
  const needsMeDialog = boardPage.getByRole('dialog', { name: 'Needs Me' });
  await needsMeDialog.waitFor();
  assert.ok(await needsMeDialog.getByRole('button', { name: /Unit 602/ }).count() >= 1);
  await boardPage.keyboard.press('Escape');
  await needsMeDialog.waitFor({ state: 'hidden' });
  await assertNoHorizontalOverflow(boardPage, 'iPhone completed board session');
  assert.deepEqual(boardFindings, [], `Board-session runtime findings:\n${boardFindings.join('\n')}`);
  await boardSession.context.close();

  const typedSession = await createSyntheticPage(browser, { width: 390, height: 844 });
  const typedPage = typedSession.page;
  const typedFindings = attachRuntimeChecks(typedPage);
  await typedPage.goto(`${baseUrl}/#/units/jul28-unit-602`, { waitUntil: 'networkidle' });
  await openBoardAssistant(typedPage);
  const typedInput = typedPage.getByLabel('Ask or update Turn OS', { exact: true });
  const typedSource = 'Unit 602 Paint Common needs a careful follow-up.';
  await typedInput.fill(typedSource);
  await typedInput.press('Enter');
  await assertSingleCapture(typedPage, 'Board typed assistant');
  await typedPage.getByRole('button', { name: /^UPDATE/ }).click();
  await typedPage.getByRole('button', { name: /^Type/ }).click();
  assert.equal(
    await typedPage.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    typedSource,
    'Typed handoff altered or injected Unit context into the exact source wording.',
  );
  await typedPage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await typedPage.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await typedPage.locator(':focus').getAttribute('id'), 'w1r-assistant-input');
  assert.equal(await typedPage.evaluate(() => window.location.hash), '#/units/jul28-unit-602');
  assert.deepEqual(typedFindings, [], `Typed-session runtime findings:\n${typedFindings.join('\n')}`);
  await typedSession.context.close();

  const voiceSession = await createSyntheticPage(browser, { width: 390, height: 844 });
  const voicePage = voiceSession.page;
  const voiceFindings = attachRuntimeChecks(voicePage);
  await voicePage.goto(`${baseUrl}/#/units/jul28-unit-602`, { waitUntil: 'networkidle' });
  await openBoardAssistant(voicePage);
  await voicePage.getByRole('button', {
    name: 'Request voice entry from existing Capture owner',
    exact: true,
  }).click();
  await assertSingleCapture(voicePage, 'Board direct voice');
  await voicePage.getByRole('heading', { name: 'Capture your exact wording', exact: true }).waitFor();
  assert.equal(
    await voicePage.getByRole('group', { name: 'What do you want to capture?' }).count(),
    0,
    'Voice entry asked for intent before source capture.',
  );
  await voicePage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await voicePage.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await voicePage.locator(':focus').getAttribute('id'), 'w1r-assistant-voice');
  assert.deepEqual(voiceFindings, [], `Voice-session runtime findings:\n${voiceFindings.join('\n')}`);
  await voiceSession.context.close();

  const navigationSession = await createSyntheticPage(browser, { width: 390, height: 844 });
  const navigationPage = navigationSession.page;
  const navigationFindings = attachRuntimeChecks(navigationPage);
  const hostDestinations = [
    ['Crews', '#/crews'],
    ['Reports', '#/reports'],
    ['Setup', '#/setup'],
    ['Backup', '#/export'],
    ['Sync', '#/sync'],
  ];
  for (const [label, expectedHash] of hostDestinations) {
    await navigationPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await navigationPage.getByRole('button', { name: 'More', exact: true }).click();
    await navigationPage.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await navigationPage.waitForFunction((hash) => window.location.hash === hash, expectedHash);
    assert.equal(await navigationPage.locator('.app-shell').count(), 1, `${label} did not open its existing host tool.`);
  }

  await navigationPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  await navigationPage.getByRole('button', { name: 'More', exact: true }).click();
  await navigationPage.getByRole('button', { name: /^Crews/ }).click();
  await navigationPage.waitForFunction(() => window.location.hash === '#/crews');
  await navigationPage.goBack();
  await navigationPage.getByRole('heading', { name: 'TurnBoard', exact: true }).waitFor();
  assert.equal(await navigationPage.evaluate(() => window.location.hash), '#/units');
  await navigationPage.goForward();
  await navigationPage.waitForFunction(() => window.location.hash === '#/crews');
  assert.equal(await navigationPage.locator('.app-shell').count(), 1);

  await navigationPage.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
  await assertSingleCapture(navigationPage, 'Direct legacy Capture route');
  assert.equal(await navigationPage.evaluate(() => window.location.hash), '#/units');
  assert.equal(await navigationPage.locator('[data-testid="wave1r-shell"]').count(), 1);
  await navigationPage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await navigationPage.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await navigationPage.getByRole('dialog').count(), 0);
  assert.equal(await navigationPage.locator(':focus').getAttribute('id'), 'w1r-assistant-launcher');
  assert.equal(await navigationPage.evaluate(() => window.location.hash), '#/units');
  await assertNoHorizontalOverflow(navigationPage, 'legacy Capture close');
  assert.deepEqual(
    navigationFindings,
    [],
    `Navigation-session runtime findings:\n${navigationFindings.join('\n')}`,
  );
  await navigationSession.context.close();

  console.log('Wave 1R A+B host integration browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
