import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const storageKey = 'turn-supervisor-os:v0.1';
const host = '127.0.0.1';
const port = 4184;
const baseUrl = `http://${host}:${port}`;
const screenshotDirectory = await mkdtemp(path.join(tmpdir(), 'pds-capture-workspace-'));
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

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

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const desktopPage = await desktopContext.newPage();
  const desktopFindings = attachRuntimeChecks(desktopPage);
  await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await desktopPage.getByRole('button', { name: 'Open Capture', exact: true }).click();
  await desktopPage.getByRole('dialog', { name: 'Field Copilot', exact: true }).waitFor();
  assert.equal(await desktopPage.locator('.capture-workspace').count(), 1);
  assert.equal(await desktopPage.locator('input[type="file"]:visible').count(), 0);
  const captureInputInsideHiddenBackground = await desktopPage.getByRole('textbox', { name: 'Capture update', exact: true }).evaluate((element) => {
    let current = element.parentElement;
    while (current) {
      if (current.inert || current.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  });
  assert.equal(captureInputInsideHiddenBackground, false, 'Capture input was placed inside the inert app background.');

  const attachmentInput = desktopPage.locator('input[type="file"][multiple]');
  assert.equal(await attachmentInput.count(), 1);
  await attachmentInput.setInputFiles({ name: 'unit-202-sink.png', mimeType: 'image/png', buffer: onePixelPng });
  await desktopPage.locator('.capture-attachment-strip').getByText('unit-202-sink.png', { exact: true }).waitFor();
  await desktopPage.getByRole('textbox', { name: 'Capture update', exact: true }).fill('Unit 202 has a sink leak. Maintenance needs to return.');
  await desktopPage.getByRole('button', { name: 'Review captured changes', exact: true }).click();
  await desktopPage.getByRole('heading', { name: /changes ready to review/ }).waitFor();

  const photoTarget = desktopPage.locator('.capture-photo-review select');
  assert.equal(await photoTarget.count(), 1);
  assert.notEqual(await photoTarget.inputValue(), '', 'Single-unit capture did not infer the photo target.');
  await desktopPage.getByRole('button', { name: 'Save photo', exact: true }).click();
  await desktopPage.getByText('Saved to Unit 202', { exact: true }).waitFor();
  await desktopPage.waitForTimeout(650);

  const storedPhoto = await desktopPage.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key));
    const unit = stored.units.find((item) => item.projectId === stored.activeProjectId && item.unitNumber === '202');
    const photo = stored.photoNotes.find((item) => item.unitId === unit?.id && item.caption.includes('sink leak'));
    return photo ? { projectId: photo.projectId, unitId: photo.unitId } : null;
  }, storageKey);
  assert.ok(storedPhoto?.projectId);
  assert.ok(storedPhoto?.unitId);
  await assertNoHorizontalOverflow(desktopPage, 'desktop Capture workspace');
  const desktopScreenshot = path.join(screenshotDirectory, 'desktop-capture-review.png');
  await desktopPage.screenshot({ path: desktopScreenshot, fullPage: false });
  await desktopPage.getByRole('button', { name: 'Open Unit', exact: true }).click();
  await desktopPage.getByRole('dialog', { name: 'Field Copilot', exact: true }).waitFor({ state: 'hidden' });
  assert.match(desktopPage.url(), /#\/units\//);
  assert.deepEqual(desktopFindings, [], `Desktop runtime findings:\n${desktopFindings.join('\n')}`);
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  const mobileFindings = attachRuntimeChecks(mobilePage);
  await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('button', { name: 'Open Capture', exact: true }).click();
  const mobileDialog = mobilePage.getByRole('dialog', { name: 'Field Copilot', exact: true });
  await mobileDialog.waitFor();
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close Field Copilot');
  await assertNoHorizontalOverflow(mobilePage, 'mobile Capture workspace');
  const mobileBounds = await mobilePage.locator('.capture-workspace').boundingBox();
  assert.ok(mobileBounds);
  assert.ok(mobileBounds.width <= 390 && mobileBounds.height <= 844);
  await mobilePage.getByRole('button', { name: 'Record a voice note', exact: true }).click();
  await mobilePage.locator('.voice-sheet').waitFor();
  const voiceTranscriptControls = await mobilePage.locator('.voice-transcript-panel textarea, .voice-transcript-panel p').count();
  assert.equal(voiceTranscriptControls, 1);
  await mobilePage.getByRole('button', { name: 'Done', exact: true }).click();
  await mobilePage.locator('.voice-sheet').waitFor({ state: 'hidden' });
  await mobilePage.keyboard.press('Escape');
  await mobileDialog.waitFor({ state: 'hidden' });
  const mobileCaptureButton = mobilePage.getByRole('button', { name: 'Open Capture', exact: true });
  assert.equal(await mobileCaptureButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Open Capture');
  const mobileScreenshot = path.join(screenshotDirectory, 'mobile-capture-closed.png');
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: false });
  assert.deepEqual(mobileFindings, [], `Mobile runtime findings:\n${mobileFindings.join('\n')}`);
  await mobileContext.close();

  console.log(JSON.stringify({ desktopScreenshot, mobileScreenshot, storedPhoto }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
