import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';
import { todayISO } from '../src/lib/constants.ts';

const storageKey = 'turn-supervisor-os:v0.1';
const host = '127.0.0.1';
const port = 4183;
const baseUrl = `http://${host}:${port}`;
const screenshotDirectory = await mkdtemp(path.join(tmpdir(), 'pds-turn-pulse-'));
const now = new Date().toISOString();
const data = JSON.parse(JSON.stringify(seedData));
const projectId = data.activeProjectId;
const linkedUnit = data.units.find((unit) => unit.projectId === projectId);
assert.ok(linkedUnit);

data.units = data.units.map((unit) =>
  unit.projectId === projectId
    ? {
        ...unit,
        overallStatus: 'Ready',
        paintStatus: 'Complete',
        cleanStatus: 'Complete',
        repairStatus: 'Complete',
        flooringStatus: 'Not Applicable',
        trashStatus: 'Complete',
        inspectionStatus: 'Complete',
        updatedAt: now,
      }
    : unit,
);
data.issues = data.issues.filter((issue) => issue.projectId !== projectId);
data.assignments = data.assignments.filter((assignment) => assignment.projectId !== projectId);
data.activityLogs = data.activityLogs.filter((activity) => activity.projectId !== projectId);
data.dailyLogs = [
  ...data.dailyLogs.filter((log) => log.projectId !== projectId || log.date !== todayISO()),
  {
    id: 'daily_turn_pulse_browser',
    projectId,
    date: todayISO(),
    morningPlan: '',
    middayUpdate: '',
    endOfDayReflection: '',
    completedSummary: '',
    blockers: '',
    lessons: '',
    tomorrowPriorities: '',
    createdAt: now,
    updatedAt: now,
  },
];
const criticalIssue = {
  id: 'issue_turn_pulse_browser',
  projectId,
  unitId: linkedUnit.id,
  title: 'Active water leak',
  category: 'Maintenance',
  priority: 'Critical',
  owner: 'Maintenance',
  status: 'Open',
  dueAt: todayISO(),
  notes: 'Disposable browser acceptance record.',
  resolutionNotes: '',
  createdAt: now,
  updatedAt: now,
};
data.issues.push(criticalIssue);

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
  await context.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify(data) },
  );
  const page = await context.newPage();
  const consoleFindings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleFindings.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleFindings.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'networkidle' });
  const pulse = page.locator('.turn-pulse-panel');
  await pulse.getByRole('heading', { name: '1 critical issue needs attention now.' }).waitFor();
  assert.match(await pulse.innerText(), /0 recorded updates today · 1 open issue · 100% ready/);
  assert.equal(await pulse.locator('.turn-pulse-panel__action').count(), 1);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, 'Turn Pulse overflowed the iPhone viewport.');
  const pulseScreenshot = path.join(screenshotDirectory, 'iphone-turn-pulse.png');
  await page.screenshot({ path: pulseScreenshot, fullPage: false });

  const issueBefore = await page.evaluate(
    ({ key, issueId }) => JSON.parse(window.localStorage.getItem(key)).issues.find((issue) => issue.id === issueId),
    { key: storageKey, issueId: criticalIssue.id },
  );
  await pulse.locator('.turn-pulse-panel__action').click();
  await page.getByRole('heading', { name: 'Issues', exact: true }).waitFor();
  await page.locator('.issue-card--focused').filter({ hasText: criticalIssue.title }).waitFor();
  assert.equal(page.url().endsWith(`#/issues/${criticalIssue.id}`), true);
  const issueAfter = await page.evaluate(
    ({ key, issueId }) => JSON.parse(window.localStorage.getItem(key)).issues.find((issue) => issue.id === issueId),
    { key: storageKey, issueId: criticalIssue.id },
  );
  assert.deepEqual(issueAfter, issueBefore);

  const focusedIssueScreenshot = path.join(screenshotDirectory, 'iphone-focused-issue.png');
  await page.screenshot({ path: focusedIssueScreenshot, fullPage: false });
  assert.deepEqual(consoleFindings, [], `Turn Pulse console findings:\n${consoleFindings.join('\n')}`);
  console.log(JSON.stringify({ focusedIssueScreenshot, pulseScreenshot }));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
