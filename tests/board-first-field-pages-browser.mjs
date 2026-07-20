import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4187;
const baseUrl = `http://${host}:${port}`;

const attachRuntimeChecks = (page) => {
  const findings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      findings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => findings.push(`pageerror: ${error.message}`));
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

  for (const target of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'ipad', viewport: { width: 1024, height: 768 } },
    { name: 'iphone', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);

    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TURNBOARD', exact: true }).waitFor();
    await page.getByText('Personal Unit view. Verify official work and marks on paper.', { exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Today', exact: true }).count() >= 1);
    assert.ok(await page.getByRole('button', { name: 'TurnBoard', exact: true }).count() >= 1);
    assert.ok(await page.getByRole('button', { name: 'Review', exact: true }).count() >= 1);
    assert.equal(await page.locator('.compact-unit-card').count(), 6);
    assert.equal(await page.locator('.quick-status-row').count(), 0, 'Compact TurnBoard exposed direct status mutations.');
    assert.equal(await page.getByRole('textbox', { name: 'Search unit', exact: true }).count(), 1);
    assert.equal(await page.getByText('Board tools, overview, and setup', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Open Unit 101', exact: true }).click();
    assert.match(page.url(), /#\/units\/unit_101$/);
    await assertNoHorizontalOverflow(page, `${target.name} TurnBoard`);

    await page.goto(`${baseUrl}/#/issues`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
    assert.equal(
      await page.locator('.bottom-nav__item.is-active').filter({ hasText: 'Review' }).count(),
      1,
      'Focused Issue routes should keep Review active in mobile navigation.',
    );
    assert.equal(await page.getByRole('heading', { name: 'Open issues' }).count(), 1);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Issue entry should not occupy the board by default.');
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const issueDialog = page.getByRole('dialog', { name: 'Add issue' });
    await issueDialog.waitFor();
    assert.equal(await issueDialog.getByRole('textbox', { name: 'Issue title' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await issueDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Issues`);

    await page.goto(`${baseUrl}/#/crews`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Crew directory' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Crew entry should not occupy the directory by default.');
    await page.getByRole('button', { name: 'Add crew', exact: true }).click();
    const crewDialog = page.getByRole('dialog', { name: 'Add crew contact' });
    await crewDialog.waitFor();
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Name' }).count(), 1);
    assert.equal(await crewDialog.getByRole('textbox', { name: 'Phone (optional)' }).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await crewDialog.waitFor({ state: 'hidden' });
    await assertNoHorizontalOverflow(page, `${target.name} Crew`);

    await page.waitForFunction(() => Boolean(localStorage.getItem('turn-supervisor-os:v0.1')));
    await page.evaluate(() => {
      const key = 'turn-supervisor-os:v0.1';
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error('Synthetic browser fixture could not find local app data.');
      const data = JSON.parse(raw);
      const timestamp = '2026-07-20T12:00:00.000Z';
      data.activityLogs.unshift({
        id: 'activity_timeline_browser',
        projectId: data.activeProjectId,
        entityType: 'Unit',
        entityId: 'unit_101',
        action: 'Synthetic Unit activity',
        note: 'Exact Unit activity wording',
        createdAt: timestamp,
      });
      data.photoNotes.unshift({
        id: 'photo_timeline_browser',
        projectId: data.activeProjectId,
        unitId: 'unit_101',
        category: 'Problem',
        caption: 'Synthetic work photo',
        localImageAvailable: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      data.issues.unshift({
        id: 'issue_timeline_browser',
        projectId: data.activeProjectId,
        unitId: 'unit_101',
        title: 'Synthetic unit issue',
        category: 'Access',
        priority: 'High',
        owner: 'Los',
        status: 'Open',
        dueAt: '',
        notes: 'Synthetic issue wording',
        resolutionNotes: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      data.draftActions.unshift({
        id: 'draft_timeline_browser',
        type: 'ADD_UNIT_NOTE',
        title: 'Synthetic Unit draft',
        summary: 'Synthetic Draft Action wording',
        targetEntityType: 'unit',
        targetEntityId: 'unit_101',
        payload: {},
        confidence: 0.9,
        why: 'Synthetic browser fixture',
        sourceText: 'Synthetic browser fixture',
        status: 'pending',
        createdAt: timestamp,
      });
      localStorage.setItem(key, JSON.stringify(data));
    });

    await page.goto(`${baseUrl}/#/unit/unit_101`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit check' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Beds' }).inputValue(), '3');
    assert.equal(await page.getByText('Manual unit details', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Status Board' }).count(), 0);
    await page.getByRole('button', { name: 'Add issue', exact: true }).click();
    const unitIssueDialog = page.getByRole('dialog', { name: 'Add issue to Unit 101' });
    await unitIssueDialog.waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await unitIssueDialog.waitFor({ state: 'hidden' });
    assert.equal(
      await page.locator('.bottom-nav__item.is-active').filter({ hasText: 'TurnBoard' }).count(),
      1,
      'Unit detail should keep TurnBoard active in mobile navigation.',
    );
    await page.getByRole('heading', { name: 'Unit history', exact: true }).waitFor();
    await page.getByText('Partial history from current app records', { exact: true }).waitFor();
    for (const source of ['Unit activity', 'Unit notes', 'Photo', 'Issue', 'Draft Action']) {
      assert.ok(await page.getByText(source, { exact: true }).count() >= 1, `${source} was missing from Unit history.`);
    }
    await page.getByRole('button', { name: 'View photo: Synthetic work photo', exact: true }).click();
    assert.equal(await page.locator('.unit-timeline-photo .photo-thumb').count(), 1);
    await page.getByRole('button', { name: 'Open Draft Action in Review', exact: true }).click();
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    assert.match(page.url(), /#\/review$/);
    await page.goBack({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit history', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open Issue: Synthetic unit issue', exact: true }).click();
    await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
    assert.match(page.url(), /#\/issues\/issue_timeline_browser$/);
    await page.goBack({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit history', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Unit detail`);

    await page.goto(`${baseUrl}/#/unit/unit_201`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Unit history', exact: true }).waitFor();
    await page.getByText('No personal activity is linked to this Unit yet.', { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} empty Unit timeline`);

    await page.goto(`${baseUrl}/#/review`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'REVIEW', exact: true }).waitFor();
    await page.getByRole('tab', { name: /All/ }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Issues', exact: true }).count(), 1);
    assert.equal(await page.getByText('Follow-ups', { exact: true }).count(), 0);
    await assertNoHorizontalOverflow(page, `${target.name} Review`);

    await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TODAY', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'What needs your attention', exact: true }).waitFor();
    const todayOrder = await page.evaluate(() => {
      const actionPanel = document.querySelector('.today-action-panel');
      const analytics = document.querySelector('.readiness-panel');
      if (!actionPanel || !analytics) return false;
      return Boolean(actionPanel.compareDocumentPosition(analytics) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(todayOrder, true, 'Today actions should precede readiness analytics.');
    await assertNoHorizontalOverflow(page, `${target.name} Today`);

    await page.goto(`${baseUrl}/#/sync`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sync & diagnostics', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Local-only mode', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${target.name} Sync diagnostics`);

    if (target.name === 'iphone') {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      const moreDialog = page.getByRole('dialog', { name: 'More' });
      await moreDialog.waitFor();
      for (const destination of ['Crew / People', 'Reports', 'Training', 'Setup', 'Data & backup', 'Sync & diagnostics']) {
        assert.equal(await moreDialog.getByRole('button', { name: new RegExp(`^${destination}`) }).count(), 1);
      }
      await page.getByRole('button', { name: 'Close More menu', exact: true }).click();
      await moreDialog.waitFor({ state: 'hidden' });
    }

    assert.deepEqual(findings, [], `${target.name} runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  for (const width of [320, 375, 430, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const findings = attachRuntimeChecks(page);
    await page.goto(`${baseUrl}/#/units`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'TURNBOARD', exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `${width}px TurnBoard`);
    assert.deepEqual(findings, [], `${width}px TurnBoard runtime findings:\n${findings.join('\n')}`);
    await context.close();
  }

  console.log('Board-first field pages passed on desktop, iPad, and iPhone viewports.');
} finally {
  await browser?.close();
  await server.close();
}
