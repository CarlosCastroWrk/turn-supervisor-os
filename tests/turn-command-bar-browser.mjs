import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';

const host = '127.0.0.1';
const port = 4194;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';
const sourceText = 'Unit 202 paint is done.';

const targets = [
  { name: 'Mac', viewport: { width: 1440, height: 960 } },
  { name: 'iPad landscape', viewport: { width: 1180, height: 820 } },
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
];

const commandRoutes = [
  { name: 'Today', hash: '#/dashboard' },
  { name: 'TurnBoard', hash: '#/units' },
  { name: 'Queue', hash: '#/review' },
  { name: 'Unit workspace', hash: '#/units/unit_101' },
];

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
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const assertSingleCommandSurface = async (page, label) => {
  const dialog = page.locator('.capture-workspace[role="dialog"]');
  await dialog.waitFor();
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} rendered multiple Capture shells.`);
  assert.equal(await page.locator('[role="dialog"]').count(), 1, `${label} exposed multiple dialogs.`);
  assert.equal(
    await page.locator('main .page-title h1').filter({ hasText: 'Capture' }).count(),
    0,
    `${label} rendered a route-level Capture page beneath the overlay.`,
  );
};

const closeCommand = async (page, expectedHash, expectedFocusLabel, label) => {
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.locator('.capture-workspace[role="dialog"]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[role="dialog"]').count(), 0, `${label} needed more than one Close.`);
  assert.equal(await page.evaluate(() => window.location.hash), expectedHash, `${label} changed its origin route.`);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    expectedFocusLabel,
    `${label} did not restore focus to its command origin.`,
  );
};

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    for (const route of commandRoutes) {
      await page.goto(`${baseUrl}/${route.hash}`, { waitUntil: 'networkidle' });
      const commandBar = page.getByRole('region', { name: 'Turn OS command bar' });
      await commandBar.waitFor();
      assert.equal(await commandBar.count(), 1, `${target.name} ${route.name} did not have exactly one command bar.`);
      assert.equal(
        await commandBar.getByPlaceholder('Ask or update Turn OS…').count(),
        1,
        `${target.name} ${route.name} did not expose the shared command field.`,
      );
      assert.equal(
        await commandBar.getByRole('button', { name: 'Open Capture attachments', exact: true }).count(),
        1,
        `${target.name} ${route.name} did not expose one Plus action.`,
      );
      assert.equal(
        await commandBar.getByRole('button', { name: 'Open Capture', exact: true }).count(),
        1,
        `${target.name} ${route.name} did not expose one microphone action.`,
      );
      assert.equal(
        await commandBar.getByRole('button', { name: 'Send to Turn OS', exact: true }).count(),
        0,
        `${target.name} ${route.name} exposed Send for an empty command.`,
      );
      await assertNoHorizontalOverflow(page, `${target.name} ${route.name}`);
    }

    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
    const commandInput = page.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
    await commandInput.fill('101');
    const unitMatches = page.getByRole('listbox', { name: 'Current Turn Unit matches' });
    await unitMatches.waitFor();
    await unitMatches.getByRole('option', { name: /Unit 101/ }).click();
    await page.waitForFunction(() => window.location.hash === '#/units/unit_101');
    const contextChip = page.locator('.turn-command-bar__context');
    await contextChip.waitFor();
    assert.match(await contextChip.innerText(), /^Unit 101/);
    assert.equal(
      (await contextChip.innerText()).includes('Context:'),
      false,
      'Unit context retained technical Context copy.',
    );
    assert.equal(await page.locator('[role="dialog"]').count(), 0, 'Unit selection opened Capture or changed status.');
    const contextInput = page.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
    const preservedContextWording = 'Keep this wording while context changes.';
    await contextInput.fill(preservedContextWording);
    await page.getByRole('button', { name: 'Remove Unit 101 context', exact: true }).click();
    assert.equal(
      await contextInput.inputValue(),
      preservedContextWording,
      `${target.name} lost wording when Unit context was removed.`,
    );
    assert.equal(await contextChip.count(), 0, `${target.name} did not remove Unit context.`);
    assert.equal(
      await page.evaluate(() => window.location.hash),
      '#/units/unit_101',
      `${target.name} navigated while removing Unit context.`,
    );
    await contextInput.fill('');

    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    const sourceInput = page.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
    await sourceInput.fill(sourceText);
    const commandBar = page.getByRole('region', { name: 'Turn OS command bar' });
    assert.equal(
      await commandBar.getByRole('button', { name: 'Open Capture', exact: true }).count(),
      0,
      `${target.name} kept the microphone after command text was entered.`,
    );
    const sendButton = commandBar.getByRole('button', { name: 'Send to Turn OS', exact: true });
    assert.equal(await sendButton.count(), 1, `${target.name} did not expose one Send action.`);
    await sendButton.click();
    await assertSingleCommandSurface(page, `${target.name} typed command`);
    await page.getByRole('button', { name: /UPDATE/ }).click();
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
      sourceText,
      `${target.name} lost typed command wording during handoff.`,
    );
    await closeCommand(
      page,
      '#/units',
      'Open Capture',
      `${target.name} typed command`,
    );

    const queuedSourceText = 'Unit 303 clean needs review.';
    await sourceInput.fill(queuedSourceText);
    await sourceInput.press('Enter');
    await assertSingleCommandSurface(page, `${target.name} protected in-memory source`);
    await page.getByText('Your earlier in-memory Capture is still here.', { exact: false }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
      sourceText,
      `${target.name} overwrote the earlier in-memory Capture.`,
    );
    assert.equal(
      await page.locator('.turn-command-bar input').inputValue(),
      queuedSourceText,
      `${target.name} lost the newer command wording while preserving the earlier Capture.`,
    );
    await closeCommand(
      page,
      '#/units',
      'Ask, update, or search Turn OS',
      `${target.name} protected in-memory source`,
    );
    await sourceInput.fill('');
    await sourceInput.fill('   ');
    assert.equal(
      await commandBar.getByRole('button', { name: 'Send to Turn OS', exact: true }).count(),
      0,
      `${target.name} exposed Send for whitespace-only wording.`,
    );
    assert.equal(
      await commandBar.getByRole('button', { name: 'Open Capture', exact: true }).count(),
      1,
      `${target.name} did not restore the microphone for whitespace-only wording.`,
    );
    await sourceInput.fill('');

    await page.getByRole('button', { name: 'Open Capture', exact: true }).click();
    await assertSingleCommandSurface(page, `${target.name} microphone entry`);
    await closeCommand(page, '#/units', 'Open Capture', `${target.name} microphone entry`);

    await page.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
    await assertSingleCommandSurface(page, `${target.name} Plus entry`);
    await closeCommand(
      page,
      '#/units',
      'Open Capture attachments',
      `${target.name} Plus entry`,
    );

    await page.goto(`${baseUrl}/#/copilot`, { waitUntil: 'networkidle' });
    await assertSingleCommandSurface(page, `${target.name} legacy entry`);
    assert.equal(await page.evaluate(() => window.location.hash), '#/dashboard');
    await closeCommand(page, '#/dashboard', 'Open Capture', `${target.name} legacy entry`);

    if (target.name === 'iPhone') {
      const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' });
      for (const label of ['Today', 'TurnBoard', 'Queue', 'More']) {
        assert.equal(
          await primaryNav.getByRole('button', { name: label, exact: true }).count(),
          1,
          `iPhone primary navigation was missing ${label}.`,
        );
      }
      assert.equal(
        await primaryNav.getByRole('button', { name: 'Open Capture', exact: true }).count(),
        0,
        'iPhone retained a second Capture owner in primary navigation.',
      );
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  const exactContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const exactPage = await exactContext.newPage();
  const exactFindings = attachRuntimeChecks(exactPage);
  await exactPage.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
  const exactInput = exactPage.getByRole('combobox', { name: 'Ask, update, or search Turn OS', exact: true });
  await exactInput.fill('202');
  const exactSend = exactPage.getByRole('button', { name: 'Send to Turn OS', exact: true });
  assert.equal(await exactSend.count(), 1, 'Exact Unit wording did not expose Send.');
  await exactSend.click();
  await assertSingleCommandSurface(exactPage, 'Exact Unit Send');
  assert.equal(
    await exactPage.evaluate(() => window.location.hash),
    '#/units',
    'Exact Unit Send silently navigated instead of opening Capture.',
  );
  await exactPage.getByRole('button', { name: /UPDATE/ }).click();
  await exactPage.getByRole('button', { name: 'Type', exact: true }).click();
  assert.equal(
    await exactPage.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    '202',
    'Exact Unit Send did not preserve the complete wording.',
  );
  await closeCommand(exactPage, '#/units', 'Open Capture', 'Exact Unit Send');
  await assertNoHorizontalOverflow(exactPage, 'Exact Unit Send iPhone');
  assert.deepEqual(exactFindings, [], `Exact Unit runtime findings:\n${exactFindings.join('\n')}`);
  await exactContext.close();

  const prefixData = structuredClone(seedData);
  const prefixSource = prefixData.units.find((unit) => unit.id === 'unit_101');
  assert.ok(prefixSource, 'Unit-prefix test source was missing.');
  for (let index = 0; index < 16; index += 1) {
    prefixData.units.push({
      ...prefixSource,
      id: `unit_prefix_${index}`,
      unitNumber: String(300 + index),
    });
  }

  const prefixContext = await browser.newContext({ viewport: { width: 390, height: 500 } });
  await prefixContext.addInitScript(
    ({ key, data }) => window.localStorage.setItem(key, JSON.stringify(data)),
    { key: storageKey, data: prefixData },
  );
  const prefixPage = await prefixContext.newPage();
  const prefixFindings = attachRuntimeChecks(prefixPage);
  await prefixPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  const prefixInput = prefixPage.getByRole('combobox', {
    name: 'Ask, update, or search Turn OS',
    exact: true,
  });

  for (const query of ['U', 'UN', 'UNI', 'UNIT']) {
    await prefixInput.fill(query);
    assert.equal(
      await prefixPage.getByRole('option').count(),
      12,
      `${query} did not retain the bounded Unit suggestion set.`,
    );
    assert.equal(
      await prefixPage.evaluate(() => window.location.hash),
      '#/dashboard',
      `${query} navigated without an explicit Unit selection.`,
    );
    assert.equal(
      await prefixPage.locator('[role="option"][aria-selected="true"]').count(),
      0,
      `${query} selected a Unit without keyboard or tap intent.`,
    );
  }

  await prefixInput.fill('UNIT 30');
  assert.equal(
    await prefixPage.getByRole('option').count(),
    10,
    'UNIT 30 did not narrow suggestions to the matching numeric prefix.',
  );

  await prefixInput.fill('U');
  const prefixMatches = prefixPage.getByRole('listbox', { name: 'Current Turn Unit matches' });
  const scrollState = await prefixMatches.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
      overscrollBehavior: computed.overscrollBehavior,
      scrollHeight: element.scrollHeight,
      touchAction: computed.touchAction,
    };
  });
  assert.ok(
    scrollState.scrollHeight > scrollState.clientHeight,
    'Broad Unit suggestions did not create a vertical scroll range.',
  );
  assert.equal(scrollState.overflowX, 'hidden', 'Unit suggestions allowed horizontal scrolling.');
  assert.equal(scrollState.overflowY, 'auto', 'Unit suggestions did not allow vertical scrolling.');
  assert.equal(scrollState.overscrollBehavior, 'contain', 'Unit suggestions did not contain scroll gestures.');
  assert.equal(scrollState.touchAction, 'pan-y', 'Unit suggestions did not preserve vertical touch gestures.');

  const prefixBox = await prefixMatches.boundingBox();
  assert.ok(prefixBox, 'Unit suggestions did not render a measurable scroll surface.');
  await prefixPage.mouse.move(
    prefixBox.x + prefixBox.width / 2,
    prefixBox.y + prefixBox.height / 2,
  );
  await prefixPage.mouse.wheel(0, 240);
  await prefixPage.waitForFunction(
    () => (document.querySelector('.turn-command-bar__matches')?.scrollTop ?? 0) > 0,
  );
  assert.equal(
    await prefixPage.evaluate(() => window.location.hash),
    '#/dashboard',
    'Scrolling Unit suggestions navigated without an explicit selection.',
  );
  assert.equal(
    await prefixPage.locator('[role="dialog"]').count(),
    0,
    'Scrolling Unit suggestions opened Capture.',
  );
  assert.equal(
    await prefixPage.locator('[role="option"][aria-selected="true"]').count(),
    0,
    'Scrolling Unit suggestions selected a Unit.',
  );

  await prefixPage.getByRole('option', { name: /Unit 305/ }).click();
  await prefixPage.waitForFunction(() => window.location.hash === '#/units/unit_prefix_5');
  assert.equal(
    await prefixPage.locator('[role="dialog"]').count(),
    0,
    'Explicit Unit-prefix selection opened Capture.',
  );
  await assertNoHorizontalOverflow(prefixPage, 'Unit-prefix search iPhone');
  assert.deepEqual(prefixFindings, [], `Unit-prefix runtime findings:\n${prefixFindings.join('\n')}`);
  await prefixContext.close();

  const duplicateData = structuredClone(seedData);
  const duplicateSource = duplicateData.units.find((unit) => unit.id === 'unit_101');
  assert.ok(duplicateSource, 'Duplicate Unit test source was missing.');
  duplicateData.units.push({
    ...duplicateSource,
    id: 'unit_101_duplicate',
  });

  const duplicateSubmitContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await duplicateSubmitContext.addInitScript(
    ({ key, data }) => window.localStorage.setItem(key, JSON.stringify(data)),
    { key: storageKey, data: duplicateData },
  );
  const duplicateSubmitPage = await duplicateSubmitContext.newPage();
  await duplicateSubmitPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  const duplicateSubmitInput = duplicateSubmitPage.getByRole('combobox', {
    name: 'Ask, update, or search Turn OS',
    exact: true,
  });
  await duplicateSubmitInput.fill('101');
  const duplicateSubmitOptions = duplicateSubmitPage.getByRole('option');
  assert.equal(await duplicateSubmitOptions.count(), 2, 'Duplicate Unit suggestions were not both visible.');
  await duplicateSubmitInput.press('Enter');
  await assertSingleCommandSurface(duplicateSubmitPage, 'Duplicate Unit explicit submission');
  assert.equal(
    await duplicateSubmitPage.evaluate(() => window.location.hash),
    '#/dashboard',
    'Duplicate Unit submission guessed a navigation destination.',
  );
  await duplicateSubmitContext.close();

  const duplicateSelectContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await duplicateSelectContext.addInitScript(
    ({ key, data }) => window.localStorage.setItem(key, JSON.stringify(data)),
    { key: storageKey, data: duplicateData },
  );
  const duplicateSelectPage = await duplicateSelectContext.newPage();
  await duplicateSelectPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  const duplicateSelectInput = duplicateSelectPage.getByRole('combobox', {
    name: 'Ask, update, or search Turn OS',
    exact: true,
  });
  await duplicateSelectInput.fill('101');
  const duplicateSelectOptions = duplicateSelectPage.getByRole('option');
  assert.equal(await duplicateSelectOptions.count(), 2, 'Duplicate Unit selection choices were not explicit.');
  await duplicateSelectOptions.nth(1).click();
  await duplicateSelectPage.waitForFunction(() => window.location.hash === '#/units/unit_101_duplicate');
  assert.equal(
    await duplicateSelectPage.locator('[role="dialog"]').count(),
    0,
    'Explicit duplicate Unit selection opened Capture.',
  );
  await duplicateSelectContext.close();

  console.log('Turn command bar passed on Mac, iPad landscape, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
