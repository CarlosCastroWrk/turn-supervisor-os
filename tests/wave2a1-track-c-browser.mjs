import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4214;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave2a1-native/track-c/preview.html';
const dependencyRoot = process.env.PDS_DEPENDENCY_ROOT ?? process.cwd();
const playwrightRoot = process.env.PDS_PLAYWRIGHT_ROOT ?? dependencyRoot;
const viteRoot = process.env.PDS_VITE_ROOT ?? dependencyRoot;
const uiDependencyRoot = process.env.PDS_UI_DEPENDENCY_ROOT ?? viteRoot;
const playwrightRequire = createRequire(resolve(playwrightRoot, 'package.json'));
const viteRequire = createRequire(resolve(viteRoot, 'package.json'));
const uiRequire = createRequire(resolve(uiDependencyRoot, 'package.json'));
const playwrightEntry = resolve(dirname(playwrightRequire.resolve('playwright')), 'index.mjs');
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a1-track-c-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [resolve(process.cwd(), 'src/features/wave2a1-native/track-c/preview.html')],
  },
  resolve: {
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: uiRequire.resolve('react/jsx-dev-runtime') },
      { find: 'react/jsx-runtime', replacement: uiRequire.resolve('react/jsx-runtime') },
      { find: 'react-dom/client', replacement: uiRequire.resolve('react-dom/client') },
      { find: 'lucide-react', replacement: uiRequire.resolve('lucide-react') },
      { find: 'react', replacement: uiRequire.resolve('react') },
    ],
  },
  server: { host, port, strictPort: true },
});

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
    `${label} overflowed: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px.`,
  );
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-track-c-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} rendered no critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no box.`);
    assert.ok(
      box.height >= 43.5 && box.width >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const waitForSheetAnimation = async (page) => {
  await page.locator('.tc-sheet').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    { name: 'iphone-320x568', viewport: { width: 320, height: 568 } },
    { name: 'iphone-390x844', viewport: { width: 390, height: 844 } },
    { name: 'iphone-430x932', viewport: { width: 430, height: 932 } },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 } },
    { name: 'mac', viewport: { width: 1440, height: 900 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'Wave 2A.1 Track C · Turn OS');
    await page.getByRole('button', { name: 'Open add menu' }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await waitForSheetAnimation(page);
    assert.deepEqual(
      await page.locator('.tc-option-list > button').allTextContents(),
      [
        'NoteSave a personal Activity note',
        'BlockerOpen the existing blocker flow',
        'CameraCamera intake is not included in this candidate.Unavailable',
        'PhotosPhoto intake is not included in this candidate.Unavailable',
        'FilesFile intake is not included in this candidate.Unavailable',
        'Paste TextPaste Text intake is not included in this candidate.Unavailable',
        'Import WorkThe Import upgrade is not included in this candidate.Unavailable',
      ],
    );
    assert.equal(
      await page.locator('[data-track-c-file-input="camera"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-track-c-file-input="photos"]').count(),
      0,
    );
    assert.equal(
      await page.locator('.tc-option-list > button[data-action-availability="unavailable"]').count(),
      5,
    );
    await assertNoHorizontalOverflow(page, `${target.name} menu`);
    await assertCriticalTargets(page, `${target.name} menu`);

    const menuScreenshot = `/private/tmp/wave2a1-track-c-menu-${target.name}.png`;
    await page.screenshot({ path: menuScreenshot, fullPage: false });
    screenshots.push(menuScreenshot);

    if (target.name === 'iphone-390x844') {
      await page.locator('.tc-option-list > button').first().click();
      await page.getByRole('heading', { name: 'New Note', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);
      const noteInput = page.locator('#tc-personal-note');
      assert.equal(
        await noteInput.evaluate((element) =>
          element.labels?.[0]?.querySelector('span')?.textContent?.trim()),
        'Note',
      );
      assert.equal(await noteInput.inputValue(), '', 'New Note must always start blank.');
      assert.ok(
        Number.parseFloat(await noteInput.evaluate((element) => getComputedStyle(element).fontSize)) >= 16,
        'Note input must prevent iPhone focus zoom.',
      );
      const exactDraft = '  Check Unit 101 behind door.\nSecond line stays exact.  ';
      await noteInput.fill(exactDraft);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: /Resume Note Draft/ }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);

      await page.locator('.tc-option-list > button').first().click();
      await page.getByRole('heading', { name: 'New Note', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);
      assert.equal(await noteInput.inputValue(), '', 'New Note must not auto-open the draft.');
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: /Resume Note Draft/ }).click();
      assert.equal(await noteInput.inputValue(), exactDraft);
      const unitContext = page.locator('#tc-personal-note-unit');
      assert.equal(
        await unitContext.evaluate((element) =>
          element.labels?.[0]?.querySelector('span')?.textContent?.trim()),
        'Optional Unit context',
      );
      await unitContext.selectOption('unit_101');
      const noteScreenshot = '/private/tmp/wave2a1-track-c-note-iphone-390x844.png';
      await page.screenshot({ path: noteScreenshot, fullPage: false });
      screenshots.push(noteScreenshot);
      await page.getByRole('button', { name: 'Save Note' }).click();

      await page.getByText('Personal note saved to Activity.', { exact: true }).waitFor();
      const activityCard = page.getByRole('button', {
        name: 'Open personal note for Unit 101',
      });
      assert.equal(
        await activityCard.locator('span > span').last().textContent(),
        exactDraft,
      );
      assert.equal(await page.getByText(/Draft Action|Apply to App|Daily Log/).count(), 0);

      await activityCard.click();
      assert.equal(await page.getByRole('dialog').count(), 1);
      await waitForSheetAnimation(page);
      const detailDialog = page.getByRole('dialog');
      assert.equal(
        await detailDialog.locator('.tc-activity-detail > p:not(.tc-safety-copy)').textContent(),
        exactDraft,
      );
      assert.equal(await detailDialog.getByText('Unit 101', { exact: true }).count(), 1);
      await assertNoHorizontalOverflow(page, 'iPhone Activity detail');
      await assertCriticalTargets(page, 'iPhone Activity detail');

      const detailScreenshot = '/private/tmp/wave2a1-track-c-detail-iphone-390x844.png';
      await page.screenshot({ path: detailScreenshot, fullPage: false });
      screenshots.push(detailScreenshot);
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Wave 2A.1 Track C browser gate passed.');
  console.log(`Screenshots: ${screenshots.join(', ')}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
