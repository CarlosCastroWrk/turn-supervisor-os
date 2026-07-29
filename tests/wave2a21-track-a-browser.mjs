import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4237;
const previewPath = '/src/features/wave2a21-track-a/preview.html';
const baseUrl = `http://${host}:${port}${previewPath}`;
const screenshotDir = '/private/tmp/turn-os-wave2a21-track-a';

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
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflowed horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const assertStep = async (page, current, label) => {
  const copy = page.getByText(`Step ${current} of 5. The paper TurnBoard remains authoritative.`);
  await copy.waitFor();
  assert.equal(await copy.count(), 1, `${label} rendered the wrong controlled step.`);
};

const assertSource = async (page, id, source, label, value) => {
  const row = page.locator(`[data-start-day-value="${id}"]`);
  await row.waitFor();
  assert.equal(await row.getAttribute('data-start-day-source'), source);
  const copy = await row.textContent();
  assert.match(copy ?? '', new RegExp(label, 'u'));
  assert.match(copy ?? '', new RegExp(value, 'u'));
};

await mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  cacheDir: '/private/tmp/pds-wave2a21-track-a-browser/node_modules/.vite',
  configLoader: 'runner',
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), `.${previewPath}`)],
  },
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
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const findings = attachRuntimeChecks(page);

  await page.goto(`${baseUrl}?step=-9`, { waitUntil: 'networkidle' });
  assert.equal(await page.title(), 'Wave 2A.2.1 Track A Behavior Harness');
  assert.match(page.url(), /wave2a21-track-a\/preview\.html/u);
  await page.locator('[data-track-a-behavior-harness="true"]').waitFor();
  assert.equal(await page.getByRole('main').count(), 1);
  await assertStep(page, 1, 'negative step clamp');
  await assertNoHorizontalOverflow(page, 'Setup step 1');
  console.log('Track A browser gate: setup loaded.');

  const propertyName = page.getByLabel('Property name', { exact: true });
  assert.equal(await propertyName.inputValue(), 'Synthetic Moon Tower');
  await propertyName.fill('Edited Synthetic Property');
  assert.equal(await propertyName.inputValue(), 'Edited Synthetic Property');
  assert.equal(
    await page.getByLabel('Property location', { exact: true }).inputValue(),
    'Synthetic Austin property',
  );
  assert.equal(
    await page.getByLabel('Supervisor name', { exact: true }).inputValue(),
    'Los',
  );
  assert.equal(
    await page.getByRole('combobox', { name: /User role/u }).inputValue(),
    'turn-supervisor',
  );
  assert.equal(await page.getByLabel('Paint', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Clean', { exact: true }).isChecked(), true);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 2, 'contacts and schedule navigation');
  console.log('Track A browser gate: contacts and schedule.');
  assert.equal(
    await page.getByLabel('Name', { exact: true }).inputValue(),
    'Synthetic Property Contact',
  );
  const contactRole = page.getByRole('combobox', { name: /^Role/u });
  assert.equal(await contactRole.inputValue(), 'Property Manager');
  assert.deepEqual(
    await contactRole.locator('option').allTextContents(),
    [
      'Property Manager',
      'Maintenance',
      'Field Lead / Market Partner',
      'Runner',
      'Other',
    ],
  );
  assert.equal(
    await page.getByRole('checkbox', { name: /Active for current project/u }).isChecked(),
    true,
  );
  assert.equal(await page.getByLabel('Default daily contact').isChecked(), true);
  assert.equal(await page.getByLabel('Default work start').inputValue(), '08:00');
  assert.equal(await page.getByLabel('Default work end').inputValue(), '18:00');
  assert.equal(await page.getByLabel('Default walkthrough time (optional)').inputValue(), '12:00');
  await page.getByLabel('Default walkthrough time (optional)').fill('');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 3, 'Property roster navigation');
  console.log('Track A browser gate: Property roster.');
  assert.equal(await page.getByText('Unit 101', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Unit 202', { exact: true }).count(), 1);
  await page.getByText(
    'Advanced file and image import is not included in this candidate.',
    { exact: true },
  ).waitFor();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 4, 'crews and permissions navigation');
  console.log('Track A browser gate: crews and permissions.');
  assert.equal(await page.getByLabel('Paint Crew Alpha', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Paint Crew Today', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Clean Crew Beta', { exact: true }).isChecked(), true);
  await page.getByLabel('Paint Crew Today', { exact: true }).check();
  assert.equal(
    await page.getByLabel('Personal photo rule').inputValue(),
    'not-confirmed',
  );
  await page.getByText('Not decided by this browser or device', { exact: true }).waitFor();
  await page.getByText(
    /does not request or grant property, PDS, camera, or photo permission/u,
  ).waitFor();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 5, 'review navigation');
  console.log('Track A browser gate: setup review.');
  assert.equal(
    await page.getByText('Paper TurnBoard remains authoritative', { exact: true }).count(),
    1,
  );
  await page.getByText('2 known Units.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Activate Project', exact: true }).click();
  await page.getByText(
    'Activation requested. A host persistence acknowledgement is still required.',
    { exact: true },
  ).waitFor();
  await page.screenshot({
    fullPage: false,
    path: `${screenshotDir}/setup-review-mobile.png`,
  });

  await page.getByRole('button', { name: 'Go to step 1: Property', exact: true }).click();
  await assertStep(page, 1, 'direct step navigation');
  assert.equal(await propertyName.inputValue(), 'Edited Synthetic Property');

  await page.goto(`${baseUrl}?step=99`, { waitUntil: 'networkidle' });
  await assertStep(page, 5, 'upper step clamp');
  await page.goto(`${baseUrl}?step=not-a-number`, { waitUntil: 'networkidle' });
  await assertStep(page, 1, 'non-finite step clamp');

  await page.setViewportSize({ width: 320, height: 780 });
  await assertNoHorizontalOverflow(page, 'Project Setup at 320px');
  await page.setViewportSize({ width: 430, height: 880 });
  await assertNoHorizontalOverflow(page, 'Project Setup at 430px');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${baseUrl}?screen=start-day&startDayStep=2`, {
    waitUntil: 'networkidle',
  });
  await page.getByText('Screen 3 of 4 · Crews and defaults', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByText('Screen 2 of 4 · Daily release', { exact: true }).waitFor();
  assert.match(page.url(), /startDayStep=1/u);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Screen 2 of 4 · Daily release', { exact: true }).waitFor();

  await page.goto(`${baseUrl}?screen=start-day&failStartOnce=1`, {
    waitUntil: 'networkidle',
  });
  console.log('Track A browser gate: Fast Start Day loaded.');
  const startDay = page.locator('[data-fast-start-day="true"]');
  await startDay.waitFor();
  await page.getByText('Screen 1 of 4 · Day and access', { exact: true }).waitFor();
  assert.equal(
    await startDay.getByLabel('Property Contact').inputValue(),
    'qa-contact-primary',
  );
  await startDay.getByLabel('Received', { exact: true }).check();
  await startDay.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 2 of 4 · Daily release', { exact: true }).waitFor();
  console.log('Track A browser gate: Daily Release.');
  assert.equal(
    await startDay.getByRole('checkbox', { name: /Unit 101/u }).isChecked(),
    false,
  );
  await startDay.getByRole('button', { name: 'Continue', exact: true }).click();
  await startDay.getByText(/Select at least one Unit/u).waitFor();
  await startDay.getByRole('checkbox', { name: /Unit 101/u }).check();
  await startDay.getByLabel('Both', { exact: true }).check();
  assert.equal(await startDay.getByLabel('Both', { exact: true }).isChecked(), true);
  await startDay.getByRole('checkbox', { name: /I reviewed today’s release/u }).check();
  await startDay.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 3 of 4 · Crews and defaults', { exact: true }).waitFor();
  console.log('Track A browser gate: crews and defaults.');
  await startDay.getByText('Paint Crew Alpha', { exact: true }).waitFor();
  await startDay.getByText('Clean Crew Beta', { exact: true }).waitFor();
  await startDay.getByRole('button', { name: 'Changed today', exact: true }).last().click();
  assert.equal(await startDay.getByLabel('Work start').inputValue(), '08:00');
  await startDay.getByLabel('Work start').fill('09:00');
  await startDay.getByRole('button', { name: 'Use saved schedule', exact: true }).click();
  await startDay.getByRole('button', { name: 'Changed today', exact: true }).last().click();
  assert.equal(await startDay.getByLabel('Work start').inputValue(), '08:00');
  await startDay.getByLabel('Personal note').fill('Synthetic morning note');
  await startDay.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByText('Screen 4 of 4 · Review and Start Day', { exact: true }).waitFor();
  console.log('Track A browser gate: Start Day review.');
  await startDay.getByRole('checkbox', { name: /I reviewed this Start Day record/u }).check();
  const startDayButton = startDay.getByRole('button', { name: 'Start Day', exact: true });
  await startDayButton.click();
  await startDay.getByText(
    'Start Day was not saved. Nothing was started, released, or added to Activity. Retry, edit, or cancel.',
    { exact: true },
  ).waitFor();
  await page.getByText('Synthetic host rejected 10 release items.', { exact: true }).waitFor();
  assert.equal(await startDayButton.isEnabled(), true);
  await startDayButton.click();
  await startDay.getByText('Start Day was durably saved by the host.', { exact: true }).waitFor();
  await page.getByText(
    'Synthetic host atomically accepted 10 release items.',
    { exact: true },
  ).waitFor();
  assert.equal(
    await startDay.getByRole('button', { name: 'Day started', exact: true }).isDisabled(),
    true,
  );
  await assertNoHorizontalOverflow(page, 'Fast Start Day');
  await page.screenshot({
    fullPage: false,
    path: `${screenshotDir}/fast-start-day-mobile.png`,
  });

  await page.getByRole('button', { name: 'Today task', exact: true }).click();
  console.log('Track A browser gate: Today detail.');
  await page.getByRole('heading', { name: 'Today’s Task', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Start Day choices', exact: true }).count(),
    1,
  );
  assert.equal(await page.getByText('Saved day defaults', { exact: true }).count(), 0);
  await page.getByText('2 of 4 released sections inspected by Los.', { exact: true }).waitFor();
  await page.getByText(
    'Today’s confirmed release. Crew completion does not mean Los inspected or property accepted.',
    { exact: true },
  ).waitFor();
  await assertSource(
    page,
    'property-contact',
    'saved-project-default',
    'Saved project default',
    'Synthetic Property Contact',
  );
  await assertSource(
    page,
    'working-hours',
    'today-only-override',
    'Today-only override',
    'Today only: 9 AM–4 PM.',
  );
  await assertSource(
    page,
    'walkthrough',
    'saved-project-default',
    'Saved project default',
    '12:00',
  );
  await assertSource(
    page,
    'paint-crews',
    'today-only-override',
    'Today-only override',
    '1 active',
  );
  await assertSource(
    page,
    'clean-crews',
    'saved-project-default',
    'Saved project default',
    '1 active',
  );
  await page.getByRole('button', { name: /Working/u }).click();
  await page.getByText('Opened working queue.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review Start Day choices', exact: true }).click();
  await page.getByText('Start Day review requested.', { exact: true }).waitFor();
  await page.getByText(
    /does not change today’s confirmed release, the paper TurnBoard, property approval, or payroll/u,
  ).waitFor();
  await page.screenshot({
    fullPage: false,
    path: `${screenshotDir}/today-mixed-provenance-mobile.png`,
  });
  await assertNoHorizontalOverflow(page, 'Today task');

  await page.getByRole('button', { name: 'Profile / Privacy', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Profile detail content', exact: true });
  const privacy = page.getByRole('region', { name: 'Privacy detail content', exact: true });
  await profile.waitFor();
  await privacy.waitFor();
  assert.equal(await profile.getAttribute('data-detail-scroll-owner'), 'profile');
  assert.equal(await privacy.getAttribute('data-detail-scroll-owner'), 'privacy');
  assert.equal(await profile.getAttribute('data-turn-scroll-region'), 'primary');
  assert.equal(await privacy.getAttribute('data-turn-scroll-region'), 'primary');

  const profileGeometry = await profile.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  assert.equal(profileGeometry.overflowY, 'auto');
  assert.ok(profileGeometry.scrollHeight > profileGeometry.clientHeight);

  const profileScrollTop = await profile.evaluate((element) => {
    element.scrollTop = 140;
    return element.scrollTop;
  });
  assert.ok(profileScrollTop > 0);
  assert.equal(await privacy.evaluate((element) => element.scrollTop), 0);
  const privacyScrollTop = await privacy.evaluate((element) => {
    element.scrollTop = 90;
    return element.scrollTop;
  });
  assert.ok(privacyScrollTop > 0);
  assert.equal(await profile.evaluate((element) => element.scrollTop), profileScrollTop);
  await assertNoHorizontalOverflow(page, 'Profile and Privacy');
  await page.screenshot({
    fullPage: false,
    path: `${screenshotDir}/profile-privacy-scroll-mobile.png`,
  });

  assert.deepEqual(findings, [], `runtime findings:\n${findings.join('\n')}`);
  await context.close();
  console.log('Wave 2A.2.1 Track A browser behavior gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
