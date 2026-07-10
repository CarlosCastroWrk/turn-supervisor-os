import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRemoteData, mergeRemoteData, replaceRemoteData, uploadLocalData } from '../src/lib/supabase/sync.ts';
import type { ActivityLog, AppData, Issue, Unit } from '../src/types.ts';

type DeviceName = 'mac' | 'iphone' | 'ipad';
type RemoteRow = Record<string, unknown>;

interface FakeSelectQuery {
  order: (column: string, options?: { ascending?: boolean }) => FakeSelectQuery;
  range: (from: number, to: number) => Promise<{ data: RemoteRow[]; error: null }>;
}

const baseStamp = '2026-07-09T08:00:00.000Z';
const clone = <T>(value: T): T => structuredClone(value);

class DisposableCloud {
  private readonly rows = new Map<string, RemoteRow[]>();

  client(): SupabaseClient {
    const rowsByTable = this.rows;
    return {
      from(table: string) {
        return {
          select() {
            const orders: Array<{ ascending: boolean; column: string }> = [];
            const query: FakeSelectQuery = {
              order(column, options) {
                orders.push({ ascending: options?.ascending !== false, column });
                return query;
              },
              async range(from, to) {
                const rows = [...(rowsByTable.get(table) ?? [])].sort((left, right) => {
                  for (const order of orders) {
                    const comparison = String(left[order.column] ?? '').localeCompare(String(right[order.column] ?? ''));
                    if (comparison !== 0) {
                      return order.ascending ? comparison : -comparison;
                    }
                  }
                  return 0;
                });
                return { data: clone(rows.slice(from, to + 1)), error: null };
              },
            };
            return query;
          },
          async upsert(incoming: RemoteRow[]) {
            const byId = new Map((rowsByTable.get(table) ?? []).map((row) => [String(row.id), row]));
            incoming.forEach((row) => byId.set(String(row.id), clone(row)));
            rowsByTable.set(table, Array.from(byId.values()));
            return { error: null };
          },
        };
      },
    } as unknown as SupabaseClient;
  }
}

const unit = (id: string, unitNumber: string): Unit => ({
  id,
  projectId: 'project_sync_reconnect',
  buildingId: 'building_sync_reconnect',
  floorId: 'floor_sync_reconnect',
  unitNumber,
  bedCount: 2,
  bathroomCount: 1,
  hasCommonArea: false,
  overallStatus: 'Not Started',
  paintStatus: 'Not Started',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Started',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Started',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes: '',
  createdAt: baseStamp,
  updatedAt: baseStamp,
});

const baseData = (): AppData => ({
  activeProjectId: 'project_sync_reconnect',
  projects: [
    {
      id: 'project_sync_reconnect',
      mode: 'real',
      name: 'Three Device Sync QA',
      propertyName: 'Disposable Sync Property',
      location: 'Austin, TX',
      startDate: '2026-07-09',
      endDate: '2026-07-23',
      supervisorName: 'Los',
      projectManagerName: 'Tony',
      notes: '',
      estimatedBuildings: 1,
      estimatedUnits: 3,
      estimatedBeds: 6,
      estimatedCommonAreas: 0,
      createdAt: baseStamp,
      updatedAt: baseStamp,
    },
  ],
  buildings: [
    {
      id: 'building_sync_reconnect',
      projectId: 'project_sync_reconnect',
      name: 'Building A',
      notes: '',
      createdAt: baseStamp,
      updatedAt: baseStamp,
    },
  ],
  floors: [
    {
      id: 'floor_sync_reconnect',
      buildingId: 'building_sync_reconnect',
      name: 'Floor 1',
      notes: '',
      createdAt: baseStamp,
      updatedAt: baseStamp,
    },
  ],
  units: [unit('unit_sync_101', '101'), unit('unit_sync_102', '102'), unit('unit_sync_103', '103')],
  crewMembers: [],
  assignments: [],
  issues: [],
  photoNotes: [],
  dailyLogs: [],
  reportDrafts: [],
  trainingQuestions: [],
  activityLogs: [],
  draftActions: [],
  memories: [],
  memoryCandidates: [],
  agentRuns: [],
  copilotConversations: [],
  followUpTasks: [],
  smartSuggestions: [],
  configurableStatuses: ['Not Started', 'Painting', 'Cleaning', 'Maintenance Needed', 'Ready'],
});

const activity = (device: DeviceName, unitId: string, createdAt: string): ActivityLog => ({
  id: `activity_${device}_${unitId}`,
  projectId: 'project_sync_reconnect',
  entityType: 'Unit',
  entityId: unitId,
  action: `${device} offline update`,
  note: 'Disposable three-device sync regression.',
  createdAt,
});

const issue = (createdAt: string): Issue => ({
  id: 'issue_ipad_sink_103',
  projectId: 'project_sync_reconnect',
  buildingId: 'building_sync_reconnect',
  floorId: 'floor_sync_reconnect',
  unitId: 'unit_sync_103',
  title: 'Sink leak',
  category: 'Maintenance',
  priority: 'High',
  owner: 'Los',
  status: 'Open',
  dueAt: '',
  notes: 'Captured offline on iPad.',
  resolutionNotes: '',
  createdAt,
  updatedAt: createdAt,
});

const editUnit = (
  data: AppData,
  unitId: string,
  patch: Partial<Unit>,
  updatedAt: string,
  device?: DeviceName,
) => {
  const next = clone(data);
  next.units = next.units.map((item) => (item.id === unitId ? { ...item, ...patch, updatedAt } : item));
  if (device) {
    next.activityLogs = [activity(device, unitId, updatedAt), ...next.activityLogs];
  }
  return next;
};

const seedCloud = async () => {
  const cloud = new DisposableCloud();
  const data = baseData();
  const result = await uploadLocalData(cloud.client(), data, {});
  assert.deepEqual(result.failures, []);
  return { cloud, data };
};

const syncDevice = async (cloud: DisposableCloud, data: AppData) => {
  const pull = await fetchRemoteData(cloud.client());
  const merged = mergeRemoteData(data, pull.remote);
  const upload = await uploadLocalData(cloud.client(), merged, pull.baseline);
  assert.deepEqual(upload.failures, []);
  return { data: merged, uploadedRows: upload.uploadedRows };
};

const prepareDeviceSync = async (cloud: DisposableCloud, data: AppData) => {
  const pull = await fetchRemoteData(cloud.client());
  return { baseline: pull.baseline, data: mergeRemoteData(data, pull.remote) };
};

const readCloud = async (cloud: DisposableCloud) => {
  const pull = await fetchRemoteData(cloud.client());
  return replaceRemoteData(baseData(), pull.remote);
};

const snapshot = (data: AppData) => ({
  activityIds: data.activityLogs.map((item) => item.id).sort(),
  issueIds: data.issues.map((item) => item.id).sort(),
  units: data.units
    .map(({ id, notes, overallStatus, paintStatus, repairStatus, updatedAt }) => ({
      id,
      notes,
      overallStatus,
      paintStatus,
      repairStatus,
      updatedAt,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
});

test('three devices preserve disjoint 12-hour offline edits without duplicate rows', async () => {
  const { cloud, data } = await seedCloud();
  const devices: Record<DeviceName, AppData> = {
    mac: editUnit(data, 'unit_sync_101', { notes: 'Mac paint walkthrough complete.' }, '2026-07-09T20:01:00.000Z', 'mac'),
    iphone: editUnit(
      data,
      'unit_sync_102',
      { notes: 'iPhone painter active.', overallStatus: 'Painting', paintStatus: 'In Progress' },
      '2026-07-09T20:02:00.000Z',
      'iphone',
    ),
    ipad: editUnit(
      { ...clone(data), issues: [issue('2026-07-09T20:03:00.000Z')] },
      'unit_sync_103',
      { notes: 'iPad sink blocker.', overallStatus: 'Maintenance Needed', repairStatus: 'Needed' },
      '2026-07-09T20:03:00.000Z',
      'ipad',
    ),
  };

  const firstPassUploads: number[] = [];
  for (const name of ['ipad', 'mac', 'iphone'] as DeviceName[]) {
    const result = await syncDevice(cloud, devices[name]);
    devices[name] = result.data;
    firstPassUploads.push(result.uploadedRows);
  }
  assert.deepEqual(firstPassUploads.sort((left, right) => left - right), [2, 2, 3]);

  for (const name of ['mac', 'iphone', 'ipad'] as DeviceName[]) {
    devices[name] = (await syncDevice(cloud, devices[name])).data;
  }

  const cloudData = await readCloud(cloud);
  assert.equal(new Set(cloudData.units.map((item) => item.id)).size, 3);
  assert.equal(new Set(cloudData.issues.map((item) => item.id)).size, 1);
  assert.equal(new Set(cloudData.activityLogs.map((item) => item.id)).size, 3);
  Object.values(devices).forEach((device) => assert.deepEqual(snapshot(device), snapshot(cloudData)));
});

test('newest same-row edit wins across every three-device reconnect order', async () => {
  const orders: DeviceName[][] = [
    ['mac', 'iphone', 'ipad'],
    ['mac', 'ipad', 'iphone'],
    ['iphone', 'mac', 'ipad'],
    ['iphone', 'ipad', 'mac'],
    ['ipad', 'mac', 'iphone'],
    ['ipad', 'iphone', 'mac'],
  ];

  for (const order of orders) {
    const { cloud, data } = await seedCloud();
    const devices: Record<DeviceName, AppData> = {
      mac: editUnit(data, 'unit_sync_101', { notes: 'Mac conflict.' }, '2026-07-09T21:01:00.000Z'),
      iphone: editUnit(data, 'unit_sync_101', { notes: 'iPhone conflict.' }, '2026-07-09T21:02:00.000Z'),
      ipad: editUnit(data, 'unit_sync_101', { notes: 'iPad newest conflict.' }, '2026-07-09T21:03:00.000Z'),
    };

    for (const name of order) {
      devices[name] = (await syncDevice(cloud, devices[name])).data;
    }

    assert.equal((await readCloud(cloud)).units.find((item) => item.id === 'unit_sync_101')?.notes, 'iPad newest conflict.');
    for (const name of ['mac', 'iphone', 'ipad'] as DeviceName[]) {
      const result = await syncDevice(cloud, devices[name]);
      devices[name] = result.data;
      assert.equal(result.uploadedRows, 0);
      assert.equal(result.data.units.find((item) => item.id === 'unit_sync_101')?.notes, 'iPad newest conflict.');
    }
  }
});

test('equal-timestamp conflicts converge instead of re-uploading on every reconnect', async () => {
  const { cloud, data } = await seedCloud();
  const tiedStamp = '2026-07-09T22:00:00.000Z';
  const devices: Record<'mac' | 'ipad', AppData> = {
    mac: editUnit(data, 'unit_sync_101', { notes: 'Mac tied edit.' }, tiedStamp),
    ipad: editUnit(data, 'unit_sync_101', { notes: 'iPad tied edit.' }, tiedStamp),
  };

  devices.mac = (await syncDevice(cloud, devices.mac)).data;
  devices.ipad = (await syncDevice(cloud, devices.ipad)).data;

  for (let pass = 0; pass < 3; pass += 1) {
    for (const name of ['mac', 'ipad'] as const) {
      const result = await syncDevice(cloud, devices[name]);
      devices[name] = result.data;
      assert.equal(result.uploadedRows, 0);
    }
  }

  const cloudNote = (await readCloud(cloud)).units.find((item) => item.id === 'unit_sync_101')?.notes;
  assert.equal(devices.mac.units.find((item) => item.id === 'unit_sync_101')?.notes, cloudNote);
  assert.equal(devices.ipad.units.find((item) => item.id === 'unit_sync_101')?.notes, cloudNote);
});

test('overlapping stale uploads recover the newest row on the next cloud pass', async () => {
  const { cloud, data } = await seedCloud();
  let mac = editUnit(data, 'unit_sync_101', { notes: 'Mac newer overlapping edit.' }, '2026-07-09T23:02:00.000Z');
  let iphone = editUnit(data, 'unit_sync_101', { notes: 'iPhone older overlapping edit.' }, '2026-07-09T23:01:00.000Z');

  const macPrepared = await prepareDeviceSync(cloud, mac);
  const iphonePrepared = await prepareDeviceSync(cloud, iphone);
  await uploadLocalData(cloud.client(), macPrepared.data, macPrepared.baseline);
  await uploadLocalData(cloud.client(), iphonePrepared.data, iphonePrepared.baseline);

  assert.equal(
    (await readCloud(cloud)).units.find((item) => item.id === 'unit_sync_101')?.notes,
    'iPhone older overlapping edit.',
  );

  const macRecovery = await syncDevice(cloud, mac);
  mac = macRecovery.data;
  assert.equal(macRecovery.uploadedRows, 1);
  const iphoneRecovery = await syncDevice(cloud, iphone);
  iphone = iphoneRecovery.data;
  assert.equal(iphoneRecovery.uploadedRows, 0);
  assert.equal(iphone.units.find((item) => item.id === 'unit_sync_101')?.notes, 'Mac newer overlapping edit.');

  const settledMac = await syncDevice(cloud, mac);
  const settledIphone = await syncDevice(cloud, iphone);
  assert.equal(settledMac.uploadedRows, 0);
  assert.equal(settledIphone.uploadedRows, 0);
});
