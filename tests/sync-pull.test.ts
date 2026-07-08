import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchRemoteData,
  mergeRemoteData,
  remotePullPageSize,
  syncedTables,
  uploadLocalData,
} from '../src/lib/supabase/sync.ts';
import type { AppData, Project, Unit } from '../src/types.ts';

type RemoteRow = Record<string, unknown>;
type RangeCall = { from: number; table: string; to: number };
type UpsertCall = { rows: RemoteRow[]; table: string };

const stamp = '2026-07-08T12:00:00.000Z';

const project = (updatedAt = stamp): Project => ({
  id: 'project_sync_pull',
  mode: 'real',
  name: 'Sync Pull QA',
  propertyName: 'West Campus Turn QA',
  location: 'Austin, TX',
  startDate: '2026-07-08',
  endDate: '2026-07-22',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 1,
  estimatedBeds: 2,
  estimatedCommonAreas: 0,
  createdAt: stamp,
  updatedAt,
});

const unit = (updatedAt = stamp, notes = 'local stale note'): Unit => ({
  id: 'unit_sync_pull_104',
  projectId: 'project_sync_pull',
  buildingId: '',
  floorId: '',
  unitNumber: '104',
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
  notes,
  createdAt: stamp,
  updatedAt,
});

const appData = (localProject = project(), localUnit = unit()): AppData => ({
  activeProjectId: localProject.id,
  projects: [localProject],
  buildings: [],
  floors: [],
  units: [localUnit],
  crewMembers: [],
  assignments: [],
  issues: [],
  photoNotes: [],
  dailyLogs: [],
  trainingQuestions: [],
  activityLogs: [],
  draftActions: [],
  memories: [],
  memoryCandidates: [],
  agentRuns: [],
  copilotConversations: [],
  followUpTasks: [],
  smartSuggestions: [],
  configurableStatuses: [],
});

const projectRow = (updatedAt = stamp): RemoteRow => ({
  id: 'project_sync_pull',
  project_mode: 'real',
  name: 'Sync Pull QA',
  property_name: 'West Campus Turn QA',
  location: 'Austin, TX',
  start_date: '2026-07-08',
  end_date: '2026-07-22',
  supervisor_name: 'Los',
  project_manager_name: 'Tony',
  notes: '',
  estimated_buildings: 1,
  estimated_units: 1,
  estimated_beds: 2,
  estimated_common_areas: 0,
  archived_at: null,
  created_at: stamp,
  updated_at: updatedAt,
});

const unitRow = (updatedAt = stamp, notes = 'cloud newer note'): RemoteRow => ({
  id: 'unit_sync_pull_104',
  project_id: 'project_sync_pull',
  building_id: null,
  floor_id: null,
  unit_number: '104',
  bed_count: 2,
  bathroom_count: 1,
  has_common_area: false,
  overall_status: 'Not Started',
  paint_status: 'Not Started',
  clean_status: 'Not Started',
  repair_status: 'Not Started',
  flooring_status: 'Not Applicable',
  trash_status: 'Not Started',
  inspection_status: 'Not Started',
  assigned_crew_ids: [],
  notes,
  created_at: stamp,
  updated_at: updatedAt,
});

const rowsByTable = (overrides: Record<string, RemoteRow[]> = {}) =>
  new Map(syncedTables.map((table) => [table, overrides[table] ?? []]));

const fakeClient = (rows: Map<string, RemoteRow[]>, rangeCalls: RangeCall[] = [], upsertCalls: UpsertCall[] = []) => ({
  from(table: string) {
    return {
      select() {
        return {
          order() {
            return {
              async range(from: number, to: number) {
                rangeCalls.push({ from, table, to });
                return { data: (rows.get(table) ?? []).slice(from, to + 1), error: null };
              },
            };
          },
        };
      },
      async upsert(upsertRows: RemoteRow[]) {
        upsertCalls.push({ rows: upsertRows, table });
        return { error: null };
      },
    };
  },
});

const asSupabaseClient = (client: ReturnType<typeof fakeClient>) => client as unknown as SupabaseClient;

test('fetchRemoteData paginates table pulls past the Supabase 1000-row default', async () => {
  const rangeCalls: RangeCall[] = [];
  const activityRows = Array.from({ length: remotePullPageSize + 3 }, (_, index) => ({
    id: `activity_${String(index).padStart(4, '0')}`,
    project_id: 'project_sync_pull',
    entity_type: 'Unit',
    entity_id: 'unit_sync_pull_104',
    action: 'QA activity',
    note: '',
    created_at: stamp,
  }));

  const result = await fetchRemoteData(asSupabaseClient(fakeClient(rowsByTable({ activity_logs: activityRows }), rangeCalls)));
  const activityCalls = rangeCalls.filter((call) => call.table === 'activity_logs');

  assert.equal(result.rowCount, remotePullPageSize + 3);
  assert.equal(result.remote.activityLogs?.length, remotePullPageSize + 3);
  assert.deepEqual(activityCalls.map(({ from, to }) => ({ from, to })), [
    { from: 0, to: remotePullPageSize - 1 },
    { from: remotePullPageSize, to: remotePullPageSize * 2 - 1 },
  ]);
});

test('pull-before-upload keeps a newer cloud row from being re-overwritten by a stale local row', async () => {
  const pull = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(
        rowsByTable({
          projects: [projectRow('2026-07-08T12:05:00.000Z')],
          units: [unitRow('2026-07-08T12:05:00.000Z', 'cloud newer note')],
        }),
      ),
    ),
  );
  const local = appData(project('2026-07-08T12:00:00.000Z'), unit('2026-07-08T12:00:00.000Z', 'local stale note'));
  const merged = mergeRemoteData(local, pull.remote);
  const upsertCalls: UpsertCall[] = [];

  const uploadResult = await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), merged, pull.baseline);

  assert.equal(merged.units.find((item) => item.id === 'unit_sync_pull_104')?.notes, 'cloud newer note');
  assert.equal(uploadResult.uploadedRows, 0);
  assert.deepEqual(upsertCalls, []);
});
