import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { seedData } from '../src/data/seed.ts';
import { createRealTurnProject } from '../src/lib/actions.ts';

const host = '127.0.0.1';
const port = 4191;
const baseUrl = `http://${host}:${port}`;
const supabaseUrl = 'http://127.0.0.1:54329';
const dataKey = 'turn-supervisor-os:v0.1';
const ownerKey = 'turn-supervisor-os:cache-owner:v1';
const visibleReview = process.env.PDS_CACHE_GUARD_VISIBLE === '1';

process.env.VITE_ENABLE_SYNC = 'true';
process.env.VITE_SUPABASE_URL = supabaseUrl;
process.env.VITE_SUPABASE_ANON_KEY = 'qa-anon-key';

const cloneSeed = () => JSON.parse(JSON.stringify(seedData));

const buildRealTurn = (accountLabel) => createRealTurnProject(cloneSeed(), {
  projectName: `QA_CACHE_${accountLabel}`,
  propertyName: `QA Cache ${accountLabel}`,
  location: 'Disposable browser test',
  startDate: '2026-07-13',
  endDate: '2026-07-14',
  supervisorName: 'QA Los',
  projectManagerName: 'QA Manager',
  buildingNames: ['QA Building'],
  buildingCount: 1,
  floorsPerBuilding: 1,
  unitsPerFloor: 1,
  firstUnitNumber: 101,
  bedCount: 1,
  bathroomCount: 1,
  hasCommonArea: false,
  notes: `Disposable ${accountLabel} cache ownership fixture.`,
});

const jwtFor = (userId, email) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    expiresAt,
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      aud: 'authenticated',
      email,
      exp: expiresAt,
      role: 'authenticated',
      sub: userId,
    })}.qa-signature`,
  };
};

const authorizationSubject = (authorization) => {
  const token = authorization.replace(/^Bearer\s+/u, '');
  const payload = token.split('.')[1];
  return payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub : undefined;
};

const sessionFor = (email) => {
  const userId = email.startsWith('account-a') ? 'account-a' : 'account-b';
  const { expiresAt, token } = jwtFor(userId, email);
  const stamp = new Date().toISOString();
  return {
    access_token: token,
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: `${userId}-refresh-token`,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: stamp,
      phone: '',
      confirmed_at: stamp,
      last_sign_in_at: stamp,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: stamp,
      updated_at: stamp,
    },
  };
};

const installFakeSupabase = async (page) => {
  const requests = [];
  await page.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON();
      await route.fulfill({
        body: JSON.stringify(sessionFor(body.email)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')) {
      requests.push({
        authorization: request.headers().authorization ?? '',
        method: request.method(),
        path: url.pathname,
      });
      await route.fulfill({
        body: '[]',
        contentType: 'application/json',
        headers: { 'Content-Range': '*/0' },
        status: request.method() === 'GET' ? 200 : 201,
      });
      return;
    }

    await route.fulfill({ body: '{}', contentType: 'application/json', status: 200 });
  });
  return requests;
};

const seedContext = async (browser, data, owner) => {
  const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
  await context.addInitScript(
    ({ dataKey: localDataKey, dataValue, ownerKey: localOwnerKey, ownerValue }) => {
      window.localStorage.setItem(localDataKey, dataValue);
      if (ownerValue) {
        window.localStorage.setItem(localOwnerKey, ownerValue);
      } else {
        window.localStorage.removeItem(localOwnerKey);
      }
    },
    { dataKey, dataValue: JSON.stringify(data), ownerKey, ownerValue: owner },
  );
  return context;
};

const openSyncPanel = async (page) => {
  const panel = page.locator('.sync-panel__body');
  if (!(await panel.isVisible())) {
    await page.locator('.sync-panel__summary').click();
  }
  await panel.waitFor();
};

const signIn = async (page, email) => {
  await openSyncPanel(page);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('qa-password');
  await page.getByRole('button', { name: 'Sign in and sync', exact: true }).click();
};

const waitForStatus = (page, status) => page.locator('.sync-panel__summary strong').getByText(status, { exact: true }).waitFor();

const holdForVisibleReview = (page) => visibleReview ? page.waitForTimeout(900) : Promise.resolve();

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host, port, strictPort: true },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({
    headless: !visibleReview,
    slowMo: visibleReview ? 120 : 0,
  });

  const switchContext = await seedContext(browser, buildRealTurn('ACCOUNT_A'), 'account-a');
  const switchPage = await switchContext.newPage();
  const switchRequests = await installFakeSupabase(switchPage);
  await switchPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  await signIn(switchPage, 'account-a@example.com');
  await waitForStatus(switchPage, 'Synced');
  await holdForVisibleReview(switchPage);
  assert.ok(switchRequests.length > 0, 'The matching account should retain normal sync behavior.');
  assert.ok(switchRequests.every((request) => authorizationSubject(request.authorization) === 'account-a'));
  const requestsAfterAccountA = switchRequests.length;

  await openSyncPanel(switchPage);
  await switchPage.getByRole('button', { name: 'Sign out', exact: true }).click();
  await waitForStatus(switchPage, 'Sign in');
  await signIn(switchPage, 'account-b@example.com');
  await waitForStatus(switchPage, 'Cache needs review');
  await holdForVisibleReview(switchPage);
  await switchPage.waitForTimeout(300);
  assert.equal(
    switchRequests.length,
    requestsAfterAccountA,
    'Switching from account A to account B must not start a record or photo request.',
  );
  assert.equal(
    await switchPage.evaluate((key) => window.localStorage.getItem(key), ownerKey),
    'account-a',
  );
  await switchContext.close();

  const claimContext = await seedContext(browser, buildRealTurn('ACCOUNT_B'), null);
  const claimPage = await claimContext.newPage();
  const claimRequests = await installFakeSupabase(claimPage);
  await claimPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await signIn(claimPage, 'account-b@example.com');
  await waitForStatus(claimPage, 'Cache needs review');
  await holdForVisibleReview(claimPage);
  assert.equal(claimRequests.length, 0);

  claimPage.once('dialog', (dialog) => dialog.accept());
  await claimPage.getByRole('button', { name: "Claim this device's local data", exact: true }).click();
  await waitForStatus(claimPage, 'Synced');
  await holdForVisibleReview(claimPage);
  assert.ok(claimRequests.length > 0, 'An explicit claim should restore normal sync for the matching cache.');
  assert.ok(claimRequests.every((request) => authorizationSubject(request.authorization) === 'account-b'));
  assert.equal(
    await claimPage.evaluate((key) => window.localStorage.getItem(key), ownerKey),
    'account-b',
  );
  await claimContext.close();

  console.log(`Cache ownership browser gate passed with ${requestsAfterAccountA} account-A request(s) and ${claimRequests.length} claimed account-B request(s).`);
} finally {
  await browser?.close();
  await server.close();
}
