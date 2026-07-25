import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4196;
const baseUrl = `http://${host}:${port}`;
const storageKey = 'turn-supervisor-os:v0.1';

const installFakeSpeechRecognition = async (context) => {
  await context.addInitScript(() => {
    const state = {
      active: null,
      startCalls: 0,
      stopCalls: 0,
      abortCalls: 0,
    };

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart = null;
      onresult = null;
      onerror = null;
      onend = null;

      constructor() {
        state.active = this;
      }

      start() {
        state.startCalls += 1;
        state.active = this;
      }

      stop() {
        state.stopCalls += 1;
        queueMicrotask(() => this.onend?.());
      }

      abort() {
        state.abortCalls += 1;
      }
    }

    const resultEvent = (text, isFinal) => ({
      resultIndex: 0,
      results: {
        0: { 0: { transcript: text }, isFinal },
        length: 1,
      },
    });

    window.SpeechRecognition = FakeSpeechRecognition;
    window.__voiceTest = {
      state,
      confirmStart() {
        state.active?.onstart?.();
      },
      emitInterim(text) {
        state.active?.onresult?.(resultEvent(text, false));
      },
      emitFinal(text) {
        state.active?.onresult?.(resultEvent(text, true));
      },
      emitError(error, message = '') {
        state.active?.onerror?.({ error, message });
      },
      end() {
        state.active?.onend?.();
      },
    };
  });
};

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

const assertSingleVoiceSource = async (page, label) => {
  const dialog = page.getByRole('dialog', { name: 'Capture', exact: true });
  await dialog.waitFor();
  assert.equal(await page.locator('[role="dialog"]').count(), 1, `${label} exposed more than one dialog.`);
  assert.equal(await page.locator('.capture-workspace').count(), 1, `${label} rendered more than one Capture owner.`);
  assert.equal(
    await page.getByRole('group', { name: 'What do you want to capture?' }).count(),
    0,
    `${label} asked for intent before source wording.`,
  );
  await page.getByRole('heading', { name: 'Capture your exact wording', exact: true }).waitFor();
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

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installFakeSpeechRecognition(context);
  const page = await context.newPage();
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  const appDataBefore = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);

  await page.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  await assertSingleVoiceSource(page, 'command microphone');
  await page.getByRole('heading', { name: 'Starting microphone…', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Listening', exact: true }).count(), 0);
  assert.equal(await page.locator('.capture-voice-panel.is-recording').count(), 0);
  assert.equal(
    await page.evaluate(() => window.__voiceTest.state.startCalls),
    1,
    'Command microphone did not request browser speech in the initiating tap.',
  );

  await page.evaluate(() => window.__voiceTest.confirmStart());
  await page.getByRole('heading', { name: 'Listening', exact: true }).waitFor();
  const voiceActions = page.locator('.capture-voice-panel__actions');
  assert.equal(await voiceActions.getByRole('button').count(), 1, 'Listening state exposed more than one action.');
  await voiceActions.getByRole('button', { name: 'Stop', exact: true }).waitFor();

  const partialSource = 'Unit 413, A, C, and D paint crew-complete.';
  await page.evaluate((text) => window.__voiceTest.emitInterim(text), partialSource);
  await page.getByLabel('Words still being transcribed').waitFor();
  await voiceActions.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByText('Stopped. Your captured wording is preserved and editable.', { exact: true }).waitFor();
  const transcript = page.getByRole('textbox', { name: 'Editable voice transcript', exact: true });
  assert.equal(await transcript.inputValue(), partialSource, 'Manual Stop lost the partial transcript.');
  assert.equal(await transcript.isEditable(), true, 'Transcript was not editable after Stop.');

  const editedSource = `${partialSource} B is renewal — do not enter.`;
  await transcript.fill(editedSource);
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await page.getByRole('dialog', { name: 'Capture', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Start voice capture');
  const appDataAfter = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
  assert.equal(appDataAfter, appDataBefore, 'Voice source capture changed persisted operational data.');

  await page.getByRole('button', { name: 'Open Capture attachments', exact: true }).click();
  await page.getByRole('group', { name: 'What do you want to capture?' }).waitFor();
  await page.getByRole('button', { name: /NOTE/ }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  assert.equal(
    await page.getByRole('textbox', { name: 'Capture wording', exact: true }).inputValue(),
    editedSource,
    'Normal Capture did not preserve the closed voice source.',
  );
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();

  await page.goto(`${baseUrl}/#/units/unit_101`, { waitUntil: 'networkidle' });
  const contextChip = page.locator('.turn-command-bar__context');
  await contextChip.waitFor();
  assert.match(await contextChip.innerText(), /^Unit 101/);
  await page.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  await assertSingleVoiceSource(page, 'Unit voice source');
  await page.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  assert.match(await contextChip.innerText(), /^Unit 101/, 'Voice capture lost the personal Unit context.');
  assert.equal(await page.evaluate(() => window.location.hash), '#/units/unit_101');
  assert.deepEqual(findings, [], `Voice source runtime findings:\n${findings.join('\n')}`);
  await context.close();

  const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installFakeSpeechRecognition(errorContext);
  const errorPage = await errorContext.newPage();
  const errorFindings = attachRuntimeChecks(errorPage);
  await errorPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await errorPage.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  await errorPage.evaluate(() => window.__voiceTest.confirmStart());
  await errorPage.getByRole('heading', { name: 'Listening', exact: true }).waitFor();
  const deniedPartial = 'Unit 416 clean needs another look.';
  await errorPage.evaluate((text) => window.__voiceTest.emitInterim(text), deniedPartial);
  await errorPage.evaluate(() => {
    window.__voiceTest.emitError('not-allowed');
    window.__voiceTest.end();
  });
  await errorPage.getByRole('alert').filter({ hasText: 'Microphone permission was blocked.' }).waitFor();
  const deniedTranscript = errorPage.getByRole('textbox', { name: 'Editable voice transcript', exact: true });
  assert.equal(await deniedTranscript.inputValue(), deniedPartial, 'Permission failure lost the partial transcript.');
  assert.equal(await deniedTranscript.isEditable(), true);
  assert.equal(await errorPage.locator('.capture-voice-panel.is-recording').count(), 0);

  await errorPage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  await errorPage.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  assert.equal(
    await errorPage.evaluate(() => window.__voiceTest.state.startCalls),
    2,
    'Reopening voice source did not retry browser speech after an earlier denial.',
  );
  await errorPage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  assert.deepEqual(errorFindings, [], `Voice permission runtime findings:\n${errorFindings.join('\n')}`);
  await errorContext.close();

  const unexpectedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installFakeSpeechRecognition(unexpectedContext);
  const unexpectedPage = await unexpectedContext.newPage();
  const unexpectedFindings = attachRuntimeChecks(unexpectedPage);
  await unexpectedPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await unexpectedPage.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  await unexpectedPage.evaluate(() => window.__voiceTest.confirmStart());
  await unexpectedPage.getByRole('heading', { name: 'Listening', exact: true }).waitFor();
  const unexpectedPartial = 'Unit 420 access needs a follow-up.';
  await unexpectedPage.evaluate((text) => {
    window.__voiceTest.emitInterim(text);
    window.__voiceTest.end();
  }, unexpectedPartial);
  const unexpectedTranscript = unexpectedPage.getByRole('textbox', { name: 'Editable voice transcript', exact: true });
  await unexpectedPage.waitForFunction(
    ({ label, expected }) => document.querySelector(`[aria-label="${label}"]`)?.value === expected,
    { label: 'Editable voice transcript', expected: unexpectedPartial },
  );
  assert.equal(await unexpectedTranscript.inputValue(), unexpectedPartial, 'Unexpected recognition end lost partial wording.');
  await unexpectedPage.getByText('Voice paused. Reconnecting…', { exact: true }).waitFor();
  await unexpectedPage.waitForFunction(() => window.__voiceTest.state.startCalls === 2);
  await unexpectedPage.getByRole('button', { name: 'Close Field Copilot', exact: true }).click();
  assert.deepEqual(unexpectedFindings, [], `Unexpected voice-end runtime findings:\n${unexpectedFindings.join('\n')}`);
  await unexpectedContext.close();

  const unsupportedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await unsupportedContext.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  const unsupportedPage = await unsupportedContext.newPage();
  const unsupportedFindings = attachRuntimeChecks(unsupportedPage);
  await unsupportedPage.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  await unsupportedPage.getByRole('button', { name: 'Start voice capture', exact: true }).click();
  await assertSingleVoiceSource(unsupportedPage, 'unsupported browser');
  await unsupportedPage.getByRole('alert').filter({ hasText: /Note box focused|Browser voice capture is unavailable|keyboard dictation/ }).waitFor();
  const fallbackTranscript = unsupportedPage.getByRole('textbox', { name: 'Editable voice transcript', exact: true });
  await fallbackTranscript.fill('Typed fallback remains available offline.');
  assert.equal(await fallbackTranscript.inputValue(), 'Typed fallback remains available offline.');
  assert.equal(await unsupportedPage.getByRole('button', { name: 'Stop', exact: true }).count(), 0);
  assert.deepEqual(unsupportedFindings, [], `Unsupported voice runtime findings:\n${unsupportedFindings.join('\n')}`);
  await unsupportedContext.close();

  console.log('V2-B1 one-tap voice source browser gate passed.');
} finally {
  await browser?.close();
  await server.close();
}
