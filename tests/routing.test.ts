import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAppHash, parseAppHash, resolveAppHash, routeForNavigation } from '../src/lib/routing.ts';

test('parseAppHash defaults to the launch Home route for empty or unknown hashes', () => {
  assert.deepEqual(parseAppHash(''), { view: 'dashboard', unitStatusFilter: 'All' });
  assert.deepEqual(parseAppHash('#/not-real'), { view: 'dashboard', unitStatusFilter: 'All' });
});

test('parseAppHash preserves unit list status filters', () => {
  assert.deepEqual(parseAppHash('#/units?status=Needs+Inspection'), {
    view: 'units',
    unitStatusFilter: 'Needs Inspection',
  });
});

test('resolveAppHash turns the legacy Capture route into one overlay request over Home', () => {
  assert.deepEqual(resolveAppHash('#/copilot'), {
    route: { view: 'dashboard', unitStatusFilter: 'All' },
    captureRequested: true,
  });
});

test('resolveAppHash leaves ordinary routes available without opening Capture', () => {
  assert.deepEqual(resolveAppHash('#/units?status=Blocked'), {
    route: { view: 'units', unitStatusFilter: 'Blocked' },
    captureRequested: false,
  });
});

test('unit detail routes are addressable and encoded safely', () => {
  const route = routeForNavigation('unitDetail', 'unit 204/A');

  assert.equal(buildAppHash(route), '#/units/unit%20204%2FA');
  assert.deepEqual(parseAppHash('#/units/unit%20204%2FA'), {
    view: 'unitDetail',
    unitId: 'unit 204/A',
    unitSurface: 'board',
    unitStatusFilter: 'All',
  });
});

test('legacy singular Unit links preserve the personal notes and photo workspace', () => {
  const route = parseAppHash('#/unit/unit%20204%2FA');

  assert.deepEqual(route, {
    view: 'unitDetail',
    unitId: 'unit 204/A',
    unitSurface: 'personal',
    unitStatusFilter: 'All',
  });
  assert.equal(buildAppHash(route), '#/unit/unit%20204%2FA');
});

test('issue focus routes are addressable without needing a separate issue detail screen', () => {
  const route = routeForNavigation('issues', undefined, { issueId: 'issue_sink_leak' });

  assert.equal(buildAppHash(route), '#/issues/issue_sink_leak');
  assert.deepEqual(parseAppHash('#/issues/issue_sink_leak'), {
    view: 'issues',
    issueId: 'issue_sink_leak',
    unitStatusFilter: 'All',
  });
});

test('buildAppHash keeps ordinary top-level navigation compact', () => {
  assert.equal(buildAppHash(routeForNavigation('dashboard')), '#/dashboard');
  assert.equal(buildAppHash(routeForNavigation('units', undefined, { unitStatusFilter: 'Blocked' })), '#/units?status=Blocked');
  assert.equal(buildAppHash(routeForNavigation('review')), '#/review');
  assert.equal(buildAppHash(routeForNavigation('sync')), '#/sync');
  assert.equal(buildAppHash(routeForNavigation('reports')), '#/reports');
  assert.equal(buildAppHash(routeForNavigation('activity')), '#/activity');
  assert.equal(buildAppHash(routeForNavigation('more')), '#/more');
  assert.equal(buildAppHash(routeForNavigation('search')), '#/search');
  assert.equal(buildAppHash(routeForNavigation('notifications')), '#/notifications');
});

test('new Review and Sync routes do not change legacy route parsing', () => {
  assert.deepEqual(parseAppHash('#/review'), { view: 'review', unitStatusFilter: 'All' });
  assert.deepEqual(parseAppHash('#/sync'), { view: 'sync', unitStatusFilter: 'All' });
  assert.deepEqual(parseAppHash('#/unit/unit_101'), {
    view: 'unitDetail',
    unitId: 'unit_101',
    unitSurface: 'personal',
    unitStatusFilter: 'All',
  });
  assert.deepEqual(parseAppHash('#/issues/issue_access_103'), {
    view: 'issues',
    issueId: 'issue_access_103',
    unitStatusFilter: 'All',
  });
});

test('launch shell routes remain directly addressable', () => {
  assert.deepEqual(parseAppHash('#/dashboard'), {
    view: 'dashboard',
    unitStatusFilter: 'All',
  });
  assert.deepEqual(parseAppHash('#/activity'), {
    view: 'activity',
    unitStatusFilter: 'All',
  });
  assert.deepEqual(parseAppHash('#/more'), {
    view: 'more',
    unitStatusFilter: 'All',
  });
  assert.deepEqual(parseAppHash('#/search'), {
    view: 'search',
    unitStatusFilter: 'All',
  });
  assert.deepEqual(parseAppHash('#/notifications'), {
    view: 'notifications',
    unitStatusFilter: 'All',
  });
});

test('routeForNavigation avoids a dead unit detail route when no unit id is present', () => {
  assert.deepEqual(routeForNavigation('unitDetail'), {
    view: 'units',
    unitStatusFilter: 'All',
  });
});
