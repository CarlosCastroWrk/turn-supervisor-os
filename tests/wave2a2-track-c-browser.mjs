import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const host = '127.0.0.1';
const port = 4214;
const baseUrl = `http://${host}:${port}`;
const previewPath = '/src/features/wave2a2-track-c/preview.html';
const dependencyRoot = process.env.PDS_DEPENDENCY_ROOT ?? process.cwd();
const playwrightRoot = process.env.PDS_PLAYWRIGHT_ROOT ?? dependencyRoot;
const viteRoot = process.env.PDS_VITE_ROOT ?? dependencyRoot;
const uiDependencyRoot = process.env.PDS_UI_DEPENDENCY_ROOT ?? viteRoot;
const playwrightRequire = createRequire(resolve(playwrightRoot, 'package.json'));
const viteRequire = createRequire(resolve(viteRoot, 'package.json'));
const uiRequire = createRequire(resolve(uiDependencyRoot, 'package.json'));
const playwrightEntry = resolve(
  dirname(playwrightRequire.resolve('playwright')),
  'index.mjs',
);
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const { createServer } = await import(
  pathToFileURL(viteRequire.resolve('vite')).href
);

const server = await createServer({
  root: process.cwd(),
  cacheDir: '/private/tmp/wave2a2-track-c-vite-cache',
  configFile: false,
  logLevel: 'error',
  optimizeDeps: {
    entries: [
      resolve(
        process.cwd(),
        'src/features/wave2a2-track-c/preview.html',
      ),
    ],
  },
  resolve: {
    alias: [
      {
        find: 'react/jsx-dev-runtime',
        replacement: uiRequire.resolve('react/jsx-dev-runtime'),
      },
      {
        find: 'react/jsx-runtime',
        replacement: uiRequire.resolve('react/jsx-runtime'),
      },
      {
        find: 'react-dom/client',
        replacement: uiRequire.resolve('react-dom/client'),
      },
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
  page.on('pageerror', (error) =>
    findings.push(`pageerror: ${error.message}`)
  );
  page.on('requestfailed', (request) => {
    findings.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
  });
  return findings;
};

const assertNoHorizontalOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="track-c-field-ops"]');
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      shellClientWidth: shell?.clientWidth ?? 0,
      shellScrollWidth: shell?.scrollWidth ?? 0,
    };
  });
  assert.ok(
    dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1,
    `${label} document overflowed: ${dimensions.documentScrollWidth}px > ${dimensions.documentClientWidth}px.`,
  );
  assert.ok(
    dimensions.shellScrollWidth <= dimensions.shellClientWidth + 1,
    `${label} feature overflowed: ${dimensions.shellScrollWidth}px > ${dimensions.shellClientWidth}px.`,
  );
};

const assertCriticalTargets = async (page, label) => {
  const targets = page.locator('[data-track-c-critical-target="true"]:visible');
  const count = await targets.count();
  assert.ok(count > 0, `${label} rendered no critical targets.`);
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    assert.ok(box, `${label} target ${index} had no bounds.`);
    assert.ok(
      box.height >= 43.5 && box.width >= 43.5,
      `${label} target ${index} measured ${box.width}x${box.height}.`,
    );
  }
};

const assertInputFontSize = async (page, label) => {
  const inputs = page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):visible, select:visible',
  );
  const count = await inputs.count();
  for (let index = 0; index < count; index += 1) {
    const size = await inputs.nth(index).evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    assert.ok(size >= 16, `${label} input ${index} used ${size}px text.`);
  }
};

const assertSeveralRowsVisible = async (page, label, minimumRows) => {
  const visibleRows = await page
    .locator('[data-testid="track-c-unit-row"]')
    .evaluateAll((rows) =>
      rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        const visibleHeight =
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        return visibleHeight >= 44;
      }).length
    );
  assert.ok(
    visibleRows >= minimumRows,
    `${label} showed ${visibleRows} meaningful rows; expected ${minimumRows}.`,
  );
};

let browser;
const screenshots = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });

  for (const target of [
    {
      name: 'iphone-320',
      minimumRows: 2,
      viewport: { width: 320, height: 568 },
      colorScheme: 'dark',
    },
    {
      name: 'iphone-390',
      minimumRows: 3,
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    },
    {
      name: 'iphone-430',
      minimumRows: 4,
      viewport: { width: 430, height: 932 },
      colorScheme: 'dark',
    },
    {
      name: 'ipad-landscape',
      minimumRows: 5,
      viewport: { width: 1024, height: 768 },
      colorScheme: 'light',
    },
    {
      name: 'mac',
      minimumRows: 7,
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    },
  ]) {
    const context = await browser.newContext({
      viewport: target.viewport,
      colorScheme: target.colorScheme,
    });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TurnBoard companion' }).waitFor();
    assert.equal(await page.locator('[data-testid="track-c-unit-row"]').count(), 8);
    assert.equal(
      await page.locator('[data-unit-id="unit-301"] strong').first().textContent(),
      '301',
    );
    assert.equal(
      await page.locator('[data-unit-id="unit-301"]').getByText('Paint', { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.locator('[data-unit-id="unit-301"]').getByText('Clean', { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('button', { name: /Approve Unit|Unit Done/i }).count(),
      0,
    );
    await assertSeveralRowsVisible(page, target.name, target.minimumRows);
    await assertNoHorizontalOverflow(page, `${target.name} compact board`);
    await assertCriticalTargets(page, `${target.name} compact board`);
    await assertInputFontSize(page, `${target.name} compact board`);

    const screenshot = `/private/tmp/wave2a2-track-c-${target.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    assert.deepEqual(
      findings,
      [],
      `${target.name} runtime findings:\n${findings.join('\n')}`,
    );
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const findings = attachRuntimeChecks(page);
  await page.goto(`${baseUrl}${previewPath}`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Open Unit 707' }).click();
  const unitDetail = page.locator('[data-testid="track-c-unit-detail"]');
  await unitDetail.getByRole('heading', { name: 'Unit 707' }).waitFor();
  assert.equal(
    await unitDetail.locator('.track-c-trade-panel.is-paint .track-c-section-row').count(),
    3,
  );
  assert.equal(
    await unitDetail.locator('.track-c-trade-panel.is-clean .track-c-section-row').count(),
    3,
  );
  assert.equal(
    await unitDetail
      .locator('.track-c-section-row__section')
      .filter({ hasText: /^C$/ })
      .count(),
    0,
  );
  await assertNoHorizontalOverflow(page, 'Unit 707 detail');
  await unitDetail.getByRole('button', { name: 'Back to compact TurnBoard' }).click();

  const navigation = page.getByRole('navigation', {
    name: 'Track C field operations',
  });
  await navigation.getByRole('button', { name: 'Crews' }).click();
  assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Open Bluebird Paint detail' }).click();
  await page.getByRole('heading', { name: 'Bluebird Paint' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 1);
  assert.equal(await page.getByText(/ranking|payroll|payment eligibility/i).count() >= 1, true);
  await assertNoHorizontalOverflow(page, 'Crew detail');

  await navigation.getByRole('button', { name: 'Assign' }).click();
  await page.getByLabel('Compatible crew').selectOption('crew-bluebird-paint');
  const unitChoice = page
    .locator('fieldset.track-c-choice-list label')
    .filter({ hasText: 'Unit 707' })
    .first();
  await unitChoice.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Review personal proposal' }).click();
  const proposal = page.getByRole('region', {
    name: 'Assignment proposal review',
  });
  await proposal.waitFor();
  assert.equal(await proposal.getByText(/3 eligible/).count(), 1);
  await proposal.getByRole('button', { name: 'Confirm personal assignment' }).click();
  await page.getByText(/3 personal assignment records saved/).waitFor();

  await navigation.getByRole('button', { name: 'Walk' }).click();
  await page.getByPlaceholder('Property contact').fill('Joseph');
  const candidateRows = page.locator('.track-c-walk-candidates > label');
  assert.ok((await candidateRows.count()) >= 2);
  await candidateRows.nth(0).locator('input').check();
  await candidateRows.nth(1).locator('input').check();
  await page.locator('.track-c-confirm-row input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Start Walk', exact: true }).click();
  await page.getByRole('heading', { name: 'Walk in progress' }).waitFor();
  const walkItems = page.locator('.track-c-walk-items > section');
  assert.equal(await walkItems.count(), 2);
  await walkItems.nth(0).getByRole('button', { name: 'Accepted' }).click();
  await walkItems.nth(1).getByRole('button', { name: 'Correction' }).click();
  await navigation.getByRole('button', { name: 'TurnBoard' }).click();
  await page.getByRole('heading', { name: 'TurnBoard companion' }).waitFor();
  await navigation.getByRole('button', { name: 'Walk' }).click();
  await page.getByRole('heading', { name: 'Walk in progress' }).waitFor();
  assert.equal(
    await walkItems
      .nth(0)
      .getByRole('button', { name: 'Accepted' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await walkItems
      .nth(1)
      .getByRole('button', { name: 'Correction' })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'End Walk and review' })
      .isEnabled(),
    true,
  );
  await page.getByRole('button', { name: 'End Walk and review' }).click();
  await page.getByRole('heading', { name: 'Latest walk' }).waitFor();
  assert.equal(await page.getByText('Eligible personal paper mirrors').count(), 1);
  const mirrorButton = page.locator('.track-c-mirror-list button').first();
  await mirrorButton.click();
  const mirrorDialog = page.getByRole('dialog', {
    name: 'Confirm personal paper mirror',
  });
  await mirrorDialog.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  const cancelMirror = mirrorDialog.getByRole('button', { name: 'Cancel' });
  assert.equal(
    await cancelMirror.evaluate((element) => element === document.activeElement),
    true,
  );
  await cancelMirror.click();
  await page.waitForFunction(
    (selector) => document.activeElement?.matches(selector),
    '.track-c-mirror-list button',
  );
  assert.equal(
    await mirrorButton.evaluate((element) => element === document.activeElement),
    true,
  );
  await mirrorButton.click();
  await mirrorDialog.waitFor();
  await page.getByRole('button', { name: 'Confirm personal mirror' }).click();
  await page.getByText(/Personal PDS Approved paper mirror recorded/).waitFor();
  assert.equal(
    await page.getByText(/paper TurnBoard/).count() >= 1,
    true,
  );

  await assertNoHorizontalOverflow(page, 'interactive flow');
  await assertCriticalTargets(page, 'interactive flow');
  await assertInputFontSize(page, 'interactive flow');
  assert.deepEqual(
    findings,
    [],
    `interactive runtime findings:\n${findings.join('\n')}`,
  );
  await context.close();

  console.log(
    `Wave 2A.2 Track C browser gate passed. Screenshots: ${screenshots.join(', ')}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
