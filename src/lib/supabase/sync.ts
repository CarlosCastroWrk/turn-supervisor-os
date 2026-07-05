import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityLog,
  AppData,
  Assignment,
  CrewMember,
  DailyLog,
  DraftAction,
  FollowUpTask,
  Issue,
  Memory,
  MemoryCandidate,
  PhotoNote,
  Project,
  TrainingQuestion,
  Unit,
} from '../../types';
import { nowISO } from '../constants';
import { getSupabaseClient, isSupabaseConfigured, isSyncFeatureEnabled } from './client';

type SyncStatus = 'disabled' | 'not_configured' | 'signed_out' | 'syncing' | 'synced' | 'offline' | 'error';
type Row = Record<string, unknown>;
type SyncedKey =
  | 'projects'
  | 'buildings'
  | 'floors'
  | 'units'
  | 'crewMembers'
  | 'assignments'
  | 'issues'
  | 'photoNotes'
  | 'dailyLogs'
  | 'trainingQuestions'
  | 'activityLogs'
  | 'draftActions'
  | 'memories'
  | 'memoryCandidates'
  | 'followUpTasks';
type SyncRemoteData = Partial<Record<SyncedKey, { id: string }[]>>;

interface SyncTable<T extends { id: string }> {
  key: SyncedKey;
  table: string;
  toRow: (item: T) => Row;
  fromRow: (row: Row) => T;
}

export interface SyncController {
  enabled: boolean;
  configured: boolean;
  status: SyncStatus;
  message: string;
  email?: string;
  lastSyncedAt?: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  uploadNow: () => Promise<void>;
  pullNow: () => Promise<void>;
}

const stringValue = (row: Row, key: string, fallback = '') => {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
};

const optionalString = (row: Row, key: string) => {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const numberValue = (row: Row, key: string, fallback = 0) => {
  const value = row[key];
  return typeof value === 'number' ? value : fallback;
};

const booleanValue = (row: Row, key: string, fallback = false) => {
  const value = row[key];
  return typeof value === 'boolean' ? value : fallback;
};

const stringArray = (row: Row, key: string) => {
  const value = row[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

const objectValue = (row: Row, key: string) => {
  const value = row[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

const tableConfigs: SyncTable<{ id: string }>[] = [
  {
    key: 'projects',
    table: 'projects',
    toRow: (item) => {
      const project = item as Project;
      return {
        id: project.id,
        name: project.name,
        property_name: project.propertyName,
        location: project.location,
        start_date: project.startDate || null,
        end_date: project.endDate || null,
        supervisor_name: project.supervisorName,
        project_manager_name: project.projectManagerName,
        notes: project.notes,
        estimated_buildings: project.estimatedBuildings,
        estimated_units: project.estimatedUnits,
        estimated_beds: project.estimatedBeds,
        estimated_common_areas: project.estimatedCommonAreas,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        name: stringValue(row, 'name'),
        propertyName: stringValue(row, 'property_name'),
        location: stringValue(row, 'location'),
        startDate: stringValue(row, 'start_date'),
        endDate: stringValue(row, 'end_date'),
        supervisorName: stringValue(row, 'supervisor_name'),
        projectManagerName: stringValue(row, 'project_manager_name'),
        notes: stringValue(row, 'notes'),
        estimatedBuildings: numberValue(row, 'estimated_buildings'),
        estimatedUnits: numberValue(row, 'estimated_units'),
        estimatedBeds: numberValue(row, 'estimated_beds'),
        estimatedCommonAreas: numberValue(row, 'estimated_common_areas'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies Project,
  },
  {
    key: 'buildings',
    table: 'buildings',
    toRow: (item) => {
      const building = item as AppData['buildings'][number];
      return { id: building.id, project_id: building.projectId, name: building.name, notes: building.notes };
    },
    fromRow: (row) => ({
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      name: stringValue(row, 'name'),
      notes: stringValue(row, 'notes'),
    }),
  },
  {
    key: 'floors',
    table: 'floors',
    toRow: (item) => {
      const floor = item as AppData['floors'][number];
      return { id: floor.id, building_id: floor.buildingId, name: floor.name, notes: floor.notes };
    },
    fromRow: (row) => ({
      id: stringValue(row, 'id'),
      buildingId: stringValue(row, 'building_id'),
      name: stringValue(row, 'name'),
      notes: stringValue(row, 'notes'),
    }),
  },
  {
    key: 'units',
    table: 'units',
    toRow: (item) => {
      const unit = item as Unit;
      return {
        id: unit.id,
        project_id: unit.projectId,
        building_id: unit.buildingId || null,
        floor_id: unit.floorId || null,
        unit_number: unit.unitNumber,
        bed_count: unit.bedCount,
        bathroom_count: unit.bathroomCount,
        has_common_area: unit.hasCommonArea,
        overall_status: unit.overallStatus,
        paint_status: unit.paintStatus,
        clean_status: unit.cleanStatus,
        repair_status: unit.repairStatus,
        flooring_status: unit.flooringStatus,
        trash_status: unit.trashStatus,
        inspection_status: unit.inspectionStatus,
        assigned_crew_ids: unit.assignedCrewIds,
        notes: unit.notes,
        created_at: unit.createdAt,
        updated_at: unit.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        buildingId: stringValue(row, 'building_id'),
        floorId: stringValue(row, 'floor_id'),
        unitNumber: stringValue(row, 'unit_number'),
        bedCount: numberValue(row, 'bed_count'),
        bathroomCount: numberValue(row, 'bathroom_count'),
        hasCommonArea: booleanValue(row, 'has_common_area'),
        overallStatus: stringValue(row, 'overall_status') as Unit['overallStatus'],
        paintStatus: stringValue(row, 'paint_status') as Unit['paintStatus'],
        cleanStatus: stringValue(row, 'clean_status') as Unit['cleanStatus'],
        repairStatus: stringValue(row, 'repair_status') as Unit['repairStatus'],
        flooringStatus: stringValue(row, 'flooring_status') as Unit['flooringStatus'],
        trashStatus: stringValue(row, 'trash_status') as Unit['trashStatus'],
        inspectionStatus: stringValue(row, 'inspection_status') as Unit['inspectionStatus'],
        assignedCrewIds: stringArray(row, 'assigned_crew_ids'),
        notes: stringValue(row, 'notes'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies Unit,
  },
  {
    key: 'crewMembers',
    table: 'crew_members',
    toRow: (item) => {
      const crew = item as CrewMember;
      return {
        id: crew.id,
        name: crew.name,
        trade: crew.trade,
        phone: crew.phone,
        company: crew.company,
        language: crew.language,
        assigned_location: crew.assignedLocation,
        notes: crew.notes,
        active: crew.active,
        created_at: crew.createdAt,
        updated_at: crew.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        name: stringValue(row, 'name'),
        trade: stringValue(row, 'trade') as CrewMember['trade'],
        phone: stringValue(row, 'phone'),
        company: stringValue(row, 'company'),
        language: stringValue(row, 'language'),
        assignedLocation: stringValue(row, 'assigned_location'),
        notes: stringValue(row, 'notes'),
        active: booleanValue(row, 'active', true),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies CrewMember,
  },
  {
    key: 'assignments',
    table: 'assignments',
    toRow: (item) => {
      const assignment = item as Assignment;
      return {
        id: assignment.id,
        project_id: assignment.projectId,
        crew_member_id: assignment.crewMemberId || null,
        team_name: assignment.teamName,
        trade: assignment.trade,
        building_id: assignment.buildingId || null,
        floor_id: assignment.floorId || null,
        unit_ids: assignment.unitIds,
        scope: assignment.scope,
        date: assignment.date || null,
        start_time: assignment.startTime,
        expected_completion: assignment.expectedCompletion,
        actual_completion: assignment.actualCompletion,
        status: assignment.status,
        notes: assignment.notes,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        crewMemberId: optionalString(row, 'crew_member_id'),
        teamName: stringValue(row, 'team_name'),
        trade: stringValue(row, 'trade') as Assignment['trade'],
        buildingId: optionalString(row, 'building_id'),
        floorId: optionalString(row, 'floor_id'),
        unitIds: stringArray(row, 'unit_ids'),
        scope: stringValue(row, 'scope'),
        date: stringValue(row, 'date'),
        startTime: stringValue(row, 'start_time'),
        expectedCompletion: stringValue(row, 'expected_completion'),
        actualCompletion: stringValue(row, 'actual_completion'),
        status: stringValue(row, 'status') as Assignment['status'],
        notes: stringValue(row, 'notes'),
      }) satisfies Assignment,
  },
  {
    key: 'issues',
    table: 'issues',
    toRow: (item) => {
      const issue = item as Issue;
      return {
        id: issue.id,
        project_id: issue.projectId,
        building_id: issue.buildingId || null,
        floor_id: issue.floorId || null,
        unit_id: issue.unitId || null,
        title: issue.title,
        category: issue.category,
        priority: issue.priority,
        owner: issue.owner,
        status: issue.status,
        due_at: issue.dueAt,
        notes: issue.notes,
        resolution_notes: issue.resolutionNotes,
        created_at: issue.createdAt,
        updated_at: issue.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        buildingId: optionalString(row, 'building_id'),
        floorId: optionalString(row, 'floor_id'),
        unitId: optionalString(row, 'unit_id'),
        title: stringValue(row, 'title'),
        category: stringValue(row, 'category') as Issue['category'],
        priority: stringValue(row, 'priority') as Issue['priority'],
        owner: stringValue(row, 'owner'),
        status: stringValue(row, 'status') as Issue['status'],
        dueAt: stringValue(row, 'due_at'),
        notes: stringValue(row, 'notes'),
        resolutionNotes: stringValue(row, 'resolution_notes'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies Issue,
  },
  {
    key: 'photoNotes',
    table: 'photo_notes',
    toRow: (item) => {
      const photo = item as PhotoNote;
      return {
        id: photo.id,
        project_id: photo.projectId,
        building_id: photo.buildingId || null,
        floor_id: photo.floorId || null,
        unit_id: photo.unitId || null,
        issue_id: photo.issueId || null,
        storage_path: '',
        category: photo.category,
        caption: photo.caption,
        created_at: photo.createdAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        buildingId: optionalString(row, 'building_id'),
        floorId: optionalString(row, 'floor_id'),
        unitId: optionalString(row, 'unit_id'),
        issueId: optionalString(row, 'issue_id'),
        category: stringValue(row, 'category') as PhotoNote['category'],
        caption: stringValue(row, 'caption'),
        createdAt: stringValue(row, 'created_at', nowISO()),
      }) satisfies PhotoNote,
  },
  {
    key: 'dailyLogs',
    table: 'daily_logs',
    toRow: (item) => {
      const log = item as DailyLog;
      return {
        id: log.id,
        project_id: log.projectId,
        date: log.date,
        morning_plan: log.morningPlan,
        midday_update: log.middayUpdate,
        end_of_day_reflection: log.endOfDayReflection,
        completed_summary: log.completedSummary,
        blockers: log.blockers,
        lessons: log.lessons,
        tomorrow_priorities: log.tomorrowPriorities,
        created_at: log.createdAt,
        updated_at: log.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        date: stringValue(row, 'date'),
        morningPlan: stringValue(row, 'morning_plan'),
        middayUpdate: stringValue(row, 'midday_update'),
        endOfDayReflection: stringValue(row, 'end_of_day_reflection'),
        completedSummary: stringValue(row, 'completed_summary'),
        blockers: stringValue(row, 'blockers'),
        lessons: stringValue(row, 'lessons'),
        tomorrowPriorities: stringValue(row, 'tomorrow_priorities'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies DailyLog,
  },
  {
    key: 'trainingQuestions',
    table: 'training_questions',
    toRow: (item) => {
      const question = item as TrainingQuestion;
      return {
        id: question.id,
        question: question.question,
        category: question.category,
        status: question.status,
        answer: question.answer,
        follow_up: question.followUp,
        created_at: question.createdAt,
        updated_at: question.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        question: stringValue(row, 'question'),
        category: stringValue(row, 'category'),
        status: stringValue(row, 'status') as TrainingQuestion['status'],
        answer: stringValue(row, 'answer'),
        followUp: stringValue(row, 'follow_up'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies TrainingQuestion,
  },
  {
    key: 'activityLogs',
    table: 'activity_logs',
    toRow: (item) => {
      const log = item as ActivityLog;
      return {
        id: log.id,
        project_id: log.projectId,
        entity_type: log.entityType,
        entity_id: log.entityId,
        action: log.action,
        note: log.note,
        created_at: log.createdAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        entityType: stringValue(row, 'entity_type') as ActivityLog['entityType'],
        entityId: stringValue(row, 'entity_id'),
        action: stringValue(row, 'action'),
        note: stringValue(row, 'note'),
        createdAt: stringValue(row, 'created_at', nowISO()),
      }) satisfies ActivityLog,
  },
  {
    key: 'draftActions',
    table: 'draft_actions',
    toRow: (item) => {
      const draft = item as DraftAction;
      return {
        id: draft.id,
        type: draft.type,
        title: draft.title,
        summary: draft.summary,
        target_entity_type: draft.targetEntityType,
        target_entity_id: draft.targetEntityId || null,
        payload: draft.payload,
        confidence: draft.confidence,
        why: draft.why,
        source_text: draft.sourceText,
        status: draft.status,
        error: draft.error || null,
        applied_at: draft.appliedAt || null,
        created_at: draft.createdAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        type: stringValue(row, 'type') as DraftAction['type'],
        title: stringValue(row, 'title'),
        summary: stringValue(row, 'summary'),
        targetEntityType: stringValue(row, 'target_entity_type') as DraftAction['targetEntityType'],
        targetEntityId: optionalString(row, 'target_entity_id'),
        payload: objectValue(row, 'payload'),
        confidence: numberValue(row, 'confidence'),
        why: stringValue(row, 'why'),
        sourceText: stringValue(row, 'source_text'),
        status: stringValue(row, 'status') as DraftAction['status'],
        createdAt: stringValue(row, 'created_at', nowISO()),
        appliedAt: optionalString(row, 'applied_at'),
        error: optionalString(row, 'error'),
      }) satisfies DraftAction,
  },
  {
    key: 'memories',
    table: 'memories',
    toRow: (item) => {
      const memory = item as Memory;
      return {
        id: memory.id,
        memory_type: memory.memoryType,
        content: memory.content,
        source: memory.source,
        source_entity_id: memory.sourceEntityId || null,
        confidence: memory.confidence,
        approved: memory.approved,
        created_at: memory.createdAt,
        updated_at: memory.updatedAt,
        last_used_at: memory.lastUsedAt || null,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        memoryType: stringValue(row, 'memory_type') as Memory['memoryType'],
        content: stringValue(row, 'content'),
        source: stringValue(row, 'source'),
        sourceEntityId: optionalString(row, 'source_entity_id'),
        confidence: numberValue(row, 'confidence'),
        approved: booleanValue(row, 'approved'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
        lastUsedAt: optionalString(row, 'last_used_at'),
      }) satisfies Memory,
  },
  {
    key: 'memoryCandidates',
    table: 'memory_candidates',
    toRow: (item) => {
      const candidate = item as MemoryCandidate;
      return {
        id: candidate.id,
        memory_type: candidate.memoryType,
        content: candidate.content,
        source: candidate.source,
        confidence: candidate.confidence,
        status: candidate.status,
        created_at: candidate.createdAt,
        updated_at: candidate.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        memoryType: stringValue(row, 'memory_type') as MemoryCandidate['memoryType'],
        content: stringValue(row, 'content'),
        source: stringValue(row, 'source'),
        confidence: numberValue(row, 'confidence'),
        status: stringValue(row, 'status') as MemoryCandidate['status'],
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies MemoryCandidate,
  },
  {
    key: 'followUpTasks',
    table: 'follow_up_tasks',
    toRow: (item) => {
      const task = item as FollowUpTask;
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        due_at: task.dueAt,
        owner: task.owner,
        related_entity_type: task.relatedEntityType || null,
        related_entity_id: task.relatedEntityId || null,
        status: task.status,
        created_at: task.createdAt,
        completed_at: task.completedAt || null,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        title: stringValue(row, 'title'),
        description: stringValue(row, 'description'),
        priority: stringValue(row, 'priority') as FollowUpTask['priority'],
        dueAt: stringValue(row, 'due_at'),
        owner: stringValue(row, 'owner'),
        relatedEntityType: optionalString(row, 'related_entity_type') as FollowUpTask['relatedEntityType'],
        relatedEntityId: optionalString(row, 'related_entity_id'),
        status: stringValue(row, 'status') as FollowUpTask['status'],
        createdAt: stringValue(row, 'created_at', nowISO()),
        completedAt: optionalString(row, 'completed_at'),
      }) satisfies FollowUpTask,
  },
];

export const syncedTables = tableConfigs.map((config) => config.table);

const comparableStamp = (item: { id: string; createdAt?: string; updatedAt?: string; completedAt?: string }) =>
  item.updatedAt ?? item.completedAt ?? item.createdAt ?? '';

const mergeRows = <T extends { id: string; createdAt?: string; updatedAt?: string; completedAt?: string }>(
  localRows: T[],
  remoteRows: T[],
) => {
  const byId = new Map(localRows.map((item) => [item.id, item]));

  remoteRows.forEach((remote) => {
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
      return;
    }

    if (comparableStamp(remote) >= comparableStamp(local)) {
      byId.set(remote.id, remote);
    }
  });

  return Array.from(byId.values()).sort((a, b) => comparableStamp(b).localeCompare(comparableStamp(a)));
};

const mergeRemoteData = (local: AppData, remote: SyncRemoteData): AppData => ({
  ...local,
  projects: mergeRows(local.projects, (remote.projects ?? []) as Project[]),
  buildings: mergeRows(local.buildings, (remote.buildings ?? []) as AppData['buildings']),
  floors: mergeRows(local.floors, (remote.floors ?? []) as AppData['floors']),
  units: mergeRows(local.units, (remote.units ?? []) as Unit[]),
  crewMembers: mergeRows(local.crewMembers, (remote.crewMembers ?? []) as CrewMember[]),
  assignments: mergeRows(local.assignments, (remote.assignments ?? []) as Assignment[]),
  issues: mergeRows(local.issues, (remote.issues ?? []) as Issue[]),
  photoNotes: mergeRows(local.photoNotes, (remote.photoNotes ?? []) as PhotoNote[]),
  dailyLogs: mergeRows(local.dailyLogs, (remote.dailyLogs ?? []) as DailyLog[]),
  trainingQuestions: mergeRows(local.trainingQuestions, (remote.trainingQuestions ?? []) as TrainingQuestion[]),
  activityLogs: mergeRows(local.activityLogs, (remote.activityLogs ?? []) as ActivityLog[]),
  draftActions: mergeRows(local.draftActions, (remote.draftActions ?? []) as DraftAction[]),
  memories: mergeRows(local.memories, (remote.memories ?? []) as Memory[]),
  memoryCandidates: mergeRows(local.memoryCandidates, (remote.memoryCandidates ?? []) as MemoryCandidate[]),
  followUpTasks: mergeRows(local.followUpTasks, (remote.followUpTasks ?? []) as FollowUpTask[]),
});

const syncedFingerprint = (data: AppData) =>
  JSON.stringify(
    tableConfigs.reduce<Record<string, unknown>>((fingerprint, config) => {
      fingerprint[config.key] = data[config.key];
      return fingerprint;
    }, {}),
  );

const fetchRemoteData = async (client: SupabaseClient) => {
  const remote: SyncRemoteData = {};
  let rowCount = 0;

  for (const config of tableConfigs) {
    const { data, error } = await client.from(config.table).select('*');
    if (error) {
      throw error;
    }

    const rows = (data ?? []) as Row[];
    rowCount += rows.length;
    remote[config.key] = rows.map(config.fromRow);
  }

  return { remote, rowCount };
};

const uploadLocalData = async (client: SupabaseClient, data: AppData) => {
  for (const config of tableConfigs) {
    const items = data[config.key] as { id: string }[];
    if (items.length === 0) {
      continue;
    }

    const rows = items.map(config.toRow);
    const { error } = await client.from(config.table).upsert(rows, { onConflict: 'id' });
    if (error) {
      throw error;
    }
  }
};

const replaceRemoteData = (local: AppData, remote: SyncRemoteData): AppData => ({
  ...local,
  projects: (remote.projects ?? local.projects) as Project[],
  buildings: (remote.buildings ?? local.buildings) as AppData['buildings'],
  floors: (remote.floors ?? local.floors) as AppData['floors'],
  units: (remote.units ?? local.units) as Unit[],
  crewMembers: (remote.crewMembers ?? local.crewMembers) as CrewMember[],
  assignments: (remote.assignments ?? local.assignments) as Assignment[],
  issues: (remote.issues ?? local.issues) as Issue[],
  photoNotes: (remote.photoNotes ?? local.photoNotes) as PhotoNote[],
  dailyLogs: (remote.dailyLogs ?? local.dailyLogs) as DailyLog[],
  trainingQuestions: (remote.trainingQuestions ?? local.trainingQuestions) as TrainingQuestion[],
  activityLogs: (remote.activityLogs ?? local.activityLogs) as ActivityLog[],
  draftActions: (remote.draftActions ?? local.draftActions) as DraftAction[],
  memories: (remote.memories ?? local.memories) as Memory[],
  memoryCandidates: (remote.memoryCandidates ?? local.memoryCandidates) as MemoryCandidate[],
  followUpTasks: (remote.followUpTasks ?? local.followUpTasks) as FollowUpTask[],
});

export const useSupabaseSync = (
  data: AppData,
  setData: Dispatch<SetStateAction<AppData>>,
  hasStoredData: boolean,
): SyncController => {
  const enabled = isSyncFeatureEnabled;
  const configured = isSupabaseConfigured;
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (!enabled) return 'disabled';
    if (!configured) return 'not_configured';
    if (!navigator.onLine) return 'offline';
    return 'signed_out';
  });
  const [message, setMessage] = useState('Sync is off. Local data is still saved on this device.');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const initializedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const hasStoredDataRef = useRef(hasStoredData);
  const lastUploadedFingerprintRef = useRef('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    hasStoredDataRef.current = hasStoredData;
  }, [hasStoredData]);

  const pullNow = useCallback(async () => {
    if (!client || !session) return;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    setStatus('syncing');
    setMessage('Pulling cloud updates...');
    const { remote, rowCount } = await fetchRemoteData(client);
    const nextData = rowCount > 0
      ? hasStoredDataRef.current
        ? mergeRemoteData(dataRef.current, remote)
        : replaceRemoteData(dataRef.current, remote)
      : dataRef.current;
    applyingRemoteRef.current = true;
    setData(nextData);
    dataRef.current = nextData;
    hasStoredDataRef.current = true;
    lastUploadedFingerprintRef.current = syncedFingerprint(nextData);
    window.setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
    setStatus('synced');
    setLastSyncedAt(nowISO());
    setMessage(rowCount > 0 ? 'Cloud updates pulled into this device.' : 'No cloud records yet.');
  }, [client, session, setData]);

  const uploadNow = useCallback(async () => {
    if (!client || !session) return;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    setStatus('syncing');
    setMessage('Uploading this device...');
    await uploadLocalData(client, dataRef.current);
    lastUploadedFingerprintRef.current = syncedFingerprint(dataRef.current);
    setStatus('synced');
    setLastSyncedAt(nowISO());
    setMessage('This device is synced to Supabase.');
  }, [client, session]);

  const syncNow = useCallback(async () => {
    if (!client || !session) return;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    try {
      setStatus('syncing');
      setMessage('Checking cloud records...');
      const { remote, rowCount } = await fetchRemoteData(client);
      let nextData = dataRef.current;

      if (rowCount > 0) {
        nextData = hasStoredDataRef.current
          ? mergeRemoteData(dataRef.current, remote)
          : replaceRemoteData(dataRef.current, remote);
        applyingRemoteRef.current = true;
        setData(nextData);
        dataRef.current = nextData;
        hasStoredDataRef.current = true;
        lastUploadedFingerprintRef.current = syncedFingerprint(nextData);
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);
      }

      await uploadLocalData(client, nextData);
      lastUploadedFingerprintRef.current = syncedFingerprint(nextData);
      initializedRef.current = true;
      setStatus('synced');
      setLastSyncedAt(nowISO());
      setMessage(rowCount > 0 ? 'Pulled cloud records and uploaded this device.' : 'Cloud was empty. Uploaded this device.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Sync failed.');
    }
  }, [client, session, setData]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) return;
      setStatus('syncing');
      setMessage('Signing in...');
      const { data: authData, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }
      setSession(authData.session);
      setMessage('Signed in. Starting sync...');
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
    initializedRef.current = false;
    setStatus('signed_out');
    setMessage('Signed out. This device still keeps its local cache.');
  }, [client]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      setMessage('Sync is off. Local data is still saved on this device.');
      return;
    }

    if (!configured || !client) {
      setStatus('not_configured');
      setMessage('Sync is enabled but Supabase environment variables are missing.');
      return;
    }

    client.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setStatus(authData.session ? 'syncing' : 'signed_out');
      setMessage(authData.session ? 'Restoring Supabase session...' : 'Sign in to sync this device.');
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'syncing' : 'signed_out');
      setMessage(nextSession ? 'Supabase session active.' : 'Sign in to sync this device.');
    });

    return () => subscription.unsubscribe();
  }, [client, configured, enabled]);

  useEffect(() => {
    if (!client || !session || initializedRef.current) return;
    void syncNow();
  }, [client, session, syncNow]);

  useEffect(() => {
    if (!client || !session) return;

    const handleOnline = () => void syncNow();
    const handleOffline = () => {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [client, session, syncNow]);

  useEffect(() => {
    if (!client || !session) return;
    if (channelRef.current) {
      void client.removeChannel(channelRef.current);
    }

    const channel = client.channel('turn-supervisor-os-sync');
    tableConfigs.forEach((config) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: config.table,
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          void pullNow();
        },
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [client, pullNow, session]);

  useEffect(() => {
    if (!client || !session || !initializedRef.current || applyingRemoteRef.current) return;

    const nextFingerprint = syncedFingerprint(data);
    if (nextFingerprint === lastUploadedFingerprintRef.current) return;

    const uploadTimer = window.setTimeout(() => {
      void uploadNow();
    }, 1200);

    return () => window.clearTimeout(uploadTimer);
  }, [client, data, session, uploadNow]);

  return {
    enabled,
    configured,
    status,
    message,
    email: session?.user.email,
    lastSyncedAt,
    signIn,
    signOut,
    syncNow,
    uploadNow,
    pullNow,
  };
};
