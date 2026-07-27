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
  await desktopPage.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
  const desktopDialog = desktopPage.locator('.capture-workspace[role="dialog"]');
  await desktopDialog.waitFor();
  await desktopPage.getByRole('group', { name: 'What do you want to capture?' }).waitFor();
  assert.equal(await desktopPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close Field Copilot');
  assert.equal(await desktopPage.locator('.capture-workspace').count(), 1);
  assert.equal(await desktopPage.locator('[role="dialog"]').count(), 1, 'Capture opened more than one dialog.');
  assert.equal(await desktopPage.locator('.capture-voice-panel').count(), 0, 'Voice opened automatically.');
  assert.equal(await desktopPage.locator('input[type="file"]:visible').count(), 0);
  await desktopPage.getByRole('button', { name: /UPDATE/ }).click();
  await desktopPage.getByRole('button', { name: 'Type', exact: true }).click();
  const captureInputInsideHiddenBackground = await desktopPage.getByRole('textbox', { name: 'Capture wording', exact: true }).evaluate((element) => {
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
  assert.equal(await desktopPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Capture wording');

  const attachmentInput = desktopPage.locator('input[type="file"][multiple][accept*=".csv"]');
  assert.equal(await attachmentInput.count(), 1);
  await attachmentInput.setInputFiles({ name: 'unit-202-sink.png', mimeType: 'image/png', buffer: onePixelPng });
  await desktopPage.locator('.capture-attachment-strip').getByText('unit-202-sink.png', { exact: true }).waitFor();
  await desktopPage.getByRole('textbox', { name: 'Capture wording', exact: true }).fill('Unit 202 has a sink leak. Maintenance needs to return.');
  await desktopPage.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await desktopPage.getByRole('heading', { name: 'Confirm your exact wording', exact: true }).waitFor();
  await desktopPage.getByRole('button', { name: 'Create drafts', exact: true }).click();
  await desktopPage.getByRole('heading', { name: 'Draft review ready', exact: true }).waitFor();
  await desktopPage.getByRole('heading', { name: 'Added to Review — 1 Draft Action awaiting approval', exact: true }).waitFor();
  await desktopPage.getByText('Unit 202 has a sink leak. Maintenance needs to return.', { exact: true }).waitFor();
  assert.equal(await desktopPage.getByRole('textbox', { name: 'Capture wording', exact: true }).count(), 0, 'Composer did not clear after durable success.');
  assert.notEqual(await desktopPage.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'Keyboard focus remained in the composer after durable success.');

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
  await desktopDialog.waitFor({ state: 'hidden' });
  assert.match(desktopPage.url(), /#\/units\//);
  assert.deepEqual(desktopFindings, [], `Desktop runtime findings:\n${desktopFindings.join('\n')}`);
  await desktopContext.close();

  const failureContext = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const failurePage = await failureContext.newPage();
  const failureFindings = attachRuntimeChecks(failurePage);
  await failurePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await failurePage.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
  await failurePage.getByRole('button', { name: /UPDATE/ }).click();
  await failurePage.getByRole('button', { name: 'Type', exact: true }).click();
  await failurePage.getByRole('textbox', { name: 'Capture wording', exact: true }).fill('Unit 204 paint is done.');
  await failurePage.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await failurePage.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.__restoreCaptureSetItem = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function setItem(storageKey, value) {
      if (storageKey === key) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  }, storageKey);
  await failurePage.getByRole('button', { name: 'Create drafts', exact: true }).click();
  await failurePage.getByRole('heading', { name: 'Draft Actions were not saved', exact: true }).waitFor();
  await failurePage.getByRole('alert').getByText('Unit 204 paint is done.', { exact: true }).waitFor();
  assert.equal(await failurePage.getByRole('button', { name: 'Retry', exact: true }).count(), 1);
  await failurePage.evaluate(() => window.__restoreCaptureSetItem());
  await failurePage.getByRole('button', { name: 'Retry', exact: true }).click();
  await failurePage.getByRole('heading', { name: /Added to Review/ }).waitFor();
  const unexpectedFailureFindings = failureFindings.filter((finding) => !finding.includes('Synthetic quota failure'));
  assert.deepEqual(unexpectedFailureFindings, [], `Capture failure runtime findings:\n${unexpectedFailureFindings.join('\n')}`);
  await failureContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  const mobileFindings = attachRuntimeChecks(mobilePage);
  await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
  const mobileDialog = mobilePage.locator('.capture-workspace[role="dialog"]');
  await mobileDialog.waitFor();
  await mobilePage.waitForTimeout(220);
  assert.equal(await mobilePage.locator('.capture-workspace').evaluate((element) => getComputedStyle(element).opacity), '1');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close Field Copilot');
  assert.equal(await mobilePage.locator('[role="dialog"]').count(), 1);
  assert.equal(await mobilePage.locator('.capture-voice-panel').count(), 0);
  await mobilePage.getByRole('button', { name: /UPDATE/ }).click();
  await mobilePage.getByRole('button', { name: 'Voice', exact: true }).click();
  await mobilePage.locator('.capture-voice-panel').waitFor();
  assert.equal(await mobilePage.locator('.capture-voice-panel.is-recording').count(), 0, 'Voice recording started automatically.');
  await assertNoHorizontalOverflow(mobilePage, 'mobile Capture workspace');
  const mobileBounds = await mobilePage.locator('.capture-workspace').boundingBox();
  assert.ok(mobileBounds);
  assert.ok(mobileBounds.width <= 390 && mobileBounds.height <= 844);
  const voiceTranscriptControls = await mobilePage.locator('.capture-voice-panel .voice-transcript-panel textarea, .capture-voice-panel .voice-transcript-panel p').count();
  assert.equal(voiceTranscriptControls, 1);
  const mobileCaptureScreenshot = path.join(screenshotDirectory, 'mobile-voice-capture.png');
  await mobilePage.screenshot({ path: mobileCaptureScreenshot, fullPage: false });
  await mobilePage.keyboard.press('Escape');
  await mobileDialog.waitFor({ state: 'hidden' });
  const mobileCaptureButton = mobilePage.getByRole('button', { name: 'Open Capture attachments', exact: true });
  assert.equal(await mobileCaptureButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Open Capture attachments');
  await mobilePage.getByRole('button', { name: 'More', exact: true }).click();
  const mobileMoreDialog = mobilePage.getByRole('dialog', { name: 'More', exact: true });
  await mobileMoreDialog.waitFor();
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close More');
  assert.equal(await mobilePage.locator('.j28-shell-background[inert]').count(), 1, 'More menu did not isolate the field workspace.');
  await mobilePage.keyboard.press('Shift+Tab');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.textContent?.trim()), 'Sync & diagnosticsLocal save and optional sync health');
  await mobilePage.keyboard.press('Tab');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close More');
  await mobilePage.keyboard.press('Escape');
  await mobileMoreDialog.waitFor({ state: 'hidden' });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.trim() === 'More');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.textContent?.trim()), 'More');
  const mobileScreenshot = path.join(screenshotDirectory, 'mobile-field-home.png');
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: false });
  assert.deepEqual(mobileFindings, [], `Mobile runtime findings:\n${mobileFindings.join('\n')}`);
  await mobileContext.close();

  const tabletContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const tabletPage = await tabletContext.newPage();
  const tabletFindings = attachRuntimeChecks(tabletPage);
  await tabletPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await assertNoHorizontalOverflow(tabletPage, 'iPad field home');
  const tabletHomeScreenshot = path.join(screenshotDirectory, 'ipad-field-home.png');
  await tabletPage.screenshot({ path: tabletHomeScreenshot, fullPage: false });
  await tabletPage.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
  await tabletPage.getByRole('group', { name: 'What do you want to capture?' }).waitFor();
  await tabletPage.getByRole('button', { name: /NOTE/ }).click();
  await tabletPage.getByRole('button', { name: 'Voice', exact: true }).click();
  await tabletPage.locator('.capture-voice-panel').waitFor();
  await tabletPage.waitForTimeout(220);
  await assertNoHorizontalOverflow(tabletPage, 'iPad voice Capture');
  assert.equal(await tabletPage.locator('[role="dialog"]').count(), 1);
  assert.equal(await tabletPage.locator('.capture-voice-panel.is-recording').count(), 0);
  const tabletCaptureBounds = await tabletPage.locator('.capture-workspace').boundingBox();
  assert.ok(tabletCaptureBounds);
  assert.ok(tabletCaptureBounds.width <= 1180 && tabletCaptureBounds.height <= 820);
  const tabletCaptureScreenshot = path.join(screenshotDirectory, 'ipad-voice-capture.png');
  await tabletPage.screenshot({ path: tabletCaptureScreenshot, fullPage: false });
  assert.deepEqual(tabletFindings, [], `iPad runtime findings:\n${tabletFindings.join('\n')}`);
  await tabletContext.close();

  console.log(JSON.stringify({ desktopScreenshot, mobileCaptureScreenshot, mobileScreenshot, tabletHomeScreenshot, tabletCaptureScreenshot, storedPhoto }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
