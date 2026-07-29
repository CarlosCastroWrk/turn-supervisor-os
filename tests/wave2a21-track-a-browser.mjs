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
  cacheDir: '/private/tmp/pds-wave2a21-track-a-vite',
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

  const projectName = page.getByLabel('Project name', { exact: true });
  assert.equal(await projectName.inputValue(), 'Synthetic Turn project');
  await projectName.fill('Edited synthetic Turn project');
  assert.equal(await projectName.inputValue(), 'Edited synthetic Turn project');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 2, 'Continue navigation');
  assert.equal(await page.getByLabel('Los’s role', { exact: true }).inputValue(), 'Turn supervisor');
  assert.equal(await page.getByLabel('Los’s role', { exact: true }).isEditable(), false);
  assert.equal(await page.getByLabel('Paint', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Clean', { exact: true }).isChecked(), true);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 3, 'daily defaults navigation');
  assert.equal(
    await page.getByRole('textbox', { name: 'Working hours', exact: true }).inputValue(),
    'Saved working hours: 10 AM–5 PM.',
  );
  assert.equal(
    await page.getByRole('textbox', { name: 'Daily walkthrough', exact: true }).inputValue(),
    'Saved walkthrough at noon.',
  );
  assert.equal(await page.getByLabel('Paint Crew Alpha', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Paint Crew Today', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Clean Crew Beta', { exact: true }).isChecked(), true);
  await page.getByLabel('Paint Crew Today', { exact: true }).check();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 4, 'contact navigation');
  assert.equal(
    await page.getByLabel('Name', { exact: true }).inputValue(),
    'Synthetic Property Contact',
  );
  assert.equal(await page.getByLabel('Primary daily contact').isChecked(), true);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await assertStep(page, 5, 'review navigation');
  assert.equal(
    await page.getByText('Paper TurnBoard remains authoritative', { exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Activate personal project', exact: true }).click();
  await page.getByText(
    'Activation requested. A host persistence acknowledgement is still required.',
    { exact: true },
  ).waitFor();
  await page.screenshot({
    fullPage: false,
    path: `${screenshotDir}/setup-review-mobile.png`,
  });

  await page.getByRole('button', { name: 'Go to step 1: Project', exact: true }).click();
  await assertStep(page, 1, 'direct step navigation');
  assert.equal(await projectName.inputValue(), 'Edited synthetic Turn project');

  await page.goto(`${baseUrl}?step=99`, { waitUntil: 'networkidle' });
  await assertStep(page, 5, 'upper step clamp');
  await page.goto(`${baseUrl}?step=not-a-number`, { waitUntil: 'networkidle' });
  await assertStep(page, 1, 'non-finite step clamp');

  await page.getByRole('button', { name: 'Today task', exact: true }).click();
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
    'Saved walkthrough at noon.',
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
