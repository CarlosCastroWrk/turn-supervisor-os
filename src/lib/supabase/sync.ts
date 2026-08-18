import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityLog,
  AiUsageEvent,
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
  ReportDocumentDraft,
  TrainingQuestion,
  Unit,
  DailyReleaseBatch,
  DaySession,
  FieldEvent,
  PropertyContact,
  TodayTask,
  WalkSession,
} from '../../types';
import { ACTIVITY_LOG_RETENTION_LIMIT } from '../activityRetention';
import { normalizeAppData } from '../dataMigrations';
import { nowISO } from '../constants';
import { reconcileDailyLogs } from '../dailyLogs';
import {
  getSessionBoundSupabaseClient,
  getSupabaseClient,
  isSupabaseConfigured,
  isSyncFeatureEnabled,
} from './client';
import {
  createDemoSyncBoundary,
  isDemoScopedSyncItem,
  withLocalDemoRows,
  type SyncBoundaryKey,
  type SyncRemoteData,
} from './syncBoundary';
import { mergePhotoNotes, mergeRows, syncRowFingerprint } from './syncCore';
import {
  assertSyncIdentity,
  cacheBelongsToUser,
  clearLastAuthenticatedUserId,
  getLastAuthenticatedUserId,
  setLastAuthenticatedUserId,
  setLocalCacheOwner,
  SyncSessionChangedError,
  type SyncIdentity,
} from './cacheOwnership';
import {
  uploadPendingPhotoFiles,
  type PhotoFileUploadResult,
  type PhotoSyncDependencies,
} from './photoSync';

type SyncStatus = 'disabled' | 'not_configured' | 'signed_out' | 'syncing' | 'synced' | 'pending_upload' | 'offline' | 'error' | 'cache_transition_required';
type SyncTrigger = 'startup' | 'manual' | 'pull' | 'upload' | 'realtime' | 'reconnect' | 'local_edit';
type Row = Record<string, unknown>;
type SyncedKey = SyncBoundaryKey;
type SyncBaseline = Partial<Record<SyncedKey, Map<string, string>>> & {
  activityWindowStart?: string;
};
type SyncRunOptions = {
  quiet?: boolean;
  trigger: SyncTrigger;
};

export interface SyncDiagnostics {
  backgroundCheckCount: number;
  lastError?: string;
  lastEvent?: string;
  lastFinishedAt?: string;
  lastPhotoError?: string;
  lastPulledRows?: number;
  lastStartedAt?: string;
  lastTable?: string;
  lastTrigger?: SyncTrigger;
  lastUploadedPhotoFiles?: number;
  lastUploadedRows?: number;
  lastUploadedTables?: string[];
  pendingPhotoFiles?: number;
  queued: boolean;
  runCount: number;
  unavailableLocalPhotoFiles?: number;
}

interface SyncTable<T extends { id: string }> {
  key: SyncedKey;
  table: string;
  toRow: (item: T) => Row;
  fromRow: (row: Row) => T;
  pullLimit?: number;
  pullOrder?: Array<{ ascending: boolean; column: string }>;
}

export interface SyncController {
  enabled: boolean;
  configured: boolean;
  authReady: boolean;
  signedIn: boolean;
  userId?: string;
  lastAuthenticatedUserId?: string;
  status: SyncStatus;
  message: string;
  diagnostics: SyncDiagnostics;
  email?: string;
  lastSyncedAt?: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  uploadNow: () => Promise<void>;
  pullNow: () => Promise<void>;
  claimLocalCache: () => Promise<void>;
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

const reportSectionsValue = (row: Row, key: string): ReportDocumentDraft['sections'] => {
  const value = row[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((section) => {
    const raw = section && typeof section === 'object' && !Array.isArray(section) ? (section as Record<string, unknown>) : {};
    return {
      title: typeof raw.title === 'string' ? raw.title : '',
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
      body: typeof raw.body === 'string' ? raw.body : '',
      bodyEdited: raw.bodyEdited === true,
    };
  });
};


// The field world (the Turn ledger). Rows carry the WHOLE record as jsonb so
// local shape changes never need a column migration; updated_at is the app's
// own stamp (events are immutable) so merges stay deterministic.
const fieldWorldConfig = <T extends { id: string; projectId: string }>(
  key: SyncedKey,
  table: string,
  stamps: (item: T) => { created: string; updated: string },
): SyncTable<{ id: string }> => ({
  fromRow: (row) => {
    const data = (row.data ?? {}) as T;
    return (data.id ? data : { ...data, id: stringValue(row, 'id') }) as { id: string };
  },
  key,
  table,
  toRow: (item) => {
    const record = item as T;
    const stamp = stamps(record);
    return {
      created_at: stamp.created,
      data: record as unknown as Row[string],
      id: record.id,
      project_id: record.projectId,
      updated_at: stamp.updated,
    };
  },
});

const fieldWorldConfigs: SyncTable<{ id: string }>[] = [
  fieldWorldConfig<DaySession>('daySessions', 'day_sessions',
    (item) => ({ created: item.createdAt, updated: item.updatedAt })),
  fieldWorldConfig<DailyReleaseBatch>('dailyReleaseBatches', 'daily_release_batches',
    (item) => ({ created: item.createdAt, updated: item.updatedAt })),
  fieldWorldConfig<TodayTask>('todayTasks', 'today_tasks',
    (item) => ({ created: item.createdAt, updated: item.updatedAt })),
  fieldWorldConfig<FieldEvent>('fieldEvents', 'field_events',
    (item) => ({ created: item.recordedAt, updated: item.recordedAt })),
  fieldWorldConfig<WalkSession>('walkSessions', 'walk_sessions',
    (item) => ({ created: item.createdAt, updated: item.updatedAt })),
  fieldWorldConfig<PropertyContact>('propertyContacts', 'property_contacts',
    (item) => ({ created: item.createdAt, updated: item.updatedAt })),
];

const tableConfigs: SyncTable<{ id: string }>[] = [
  {
    key: 'projects',
    table: 'projects',
    toRow: (item) => {
      const project = item as Project;
      return {
        id: project.id,
        project_mode: project.mode,
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
        ai_budget_usd: project.aiBudgetUsd,
        archived_at: project.archivedAt ?? null,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        mode: stringValue(row, 'project_mode', 'demo') as Project['mode'],
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
        aiBudgetUsd: numberValue(row, 'ai_budget_usd', 10),
        archivedAt: optionalString(row, 'archived_at'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies Project,
  },
  {
    key: 'buildings',
    table: 'buildings',
    toRow: (item) => {
      const building = item as AppData['buildings'][number];
      return {
        id: building.id,
        project_id: building.projectId,
        name: building.name,
        notes: building.notes,
        created_at: building.createdAt,
        updated_at: building.updatedAt,
      };
    },
    fromRow: (row) => ({
      id: stringValue(row, 'id'),
      projectId: stringValue(row, 'project_id'),
      name: stringValue(row, 'name'),
      notes: stringValue(row, 'notes'),
      createdAt: stringValue(row, 'created_at', nowISO()),
      updatedAt: stringValue(row, 'updated_at', nowISO()),
    }),
  },
  {
    key: 'floors',
    table: 'floors',
    toRow: (item) => {
      const floor = item as AppData['floors'][number];
      return {
        id: floor.id,
        building_id: floor.buildingId,
        name: floor.name,
        notes: floor.notes,
        created_at: floor.createdAt,
        updated_at: floor.updatedAt,
      };
    },
    fromRow: (row) => ({
      id: stringValue(row, 'id'),
      buildingId: stringValue(row, 'building_id'),
      name: stringValue(row, 'name'),
      notes: stringValue(row, 'notes'),
      createdAt: stringValue(row, 'created_at', nowISO()),
      updatedAt: stringValue(row, 'updated_at', nowISO()),
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
        project_id: crew.projectId || null,
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
        projectId: optionalString(row, 'project_id'),
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
        created_at: assignment.createdAt,
        updated_at: assignment.updatedAt,
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
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
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
        storage_path: photo.storagePath ?? '',
        category: photo.category,
        caption: photo.caption,
        created_at: photo.createdAt,
        updated_at: photo.updatedAt,
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
        storagePath: optionalString(row, 'storage_path'),
        category: stringValue(row, 'category') as PhotoNote['category'],
        caption: stringValue(row, 'caption'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
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
    key: 'reportDrafts',
    table: 'report_drafts',
    toRow: (item) => {
      const draft = item as ReportDocumentDraft;
      return {
        id: draft.id,
        project_id: draft.projectId,
        date: draft.date,
        title: draft.title,
        title_edited: draft.titleEdited,
        summary: draft.summary,
        summary_edited: draft.summaryEdited,
        sections: draft.sections,
        created_at: draft.createdAt,
        updated_at: draft.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        date: stringValue(row, 'date'),
        title: stringValue(row, 'title'),
        titleEdited: booleanValue(row, 'title_edited'),
        summary: stringValue(row, 'summary'),
        summaryEdited: booleanValue(row, 'summary_edited'),
        sections: reportSectionsValue(row, 'sections'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies ReportDocumentDraft,
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
    pullLimit: ACTIVITY_LOG_RETENTION_LIMIT,
    pullOrder: [
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: true },
    ],
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
        project_id: memory.projectId || null,
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
        projectId: optionalString(row, 'project_id'),
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
        project_id: candidate.projectId || null,
        memory_type: candidate.memoryType,
        content: candidate.content,
        source: candidate.source,
        source_entity_id: candidate.sourceEntityId || null,
        confidence: candidate.confidence,
        status: candidate.status,
        created_at: candidate.createdAt,
        updated_at: candidate.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: optionalString(row, 'project_id'),
        memoryType: stringValue(row, 'memory_type') as MemoryCandidate['memoryType'],
        content: stringValue(row, 'content'),
        source: stringValue(row, 'source'),
        sourceEntityId: optionalString(row, 'source_entity_id'),
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
  {
    key: 'aiUsageEvents',
    table: 'ai_usage_events',
    toRow: (item) => {
      const event = item as AiUsageEvent;
      return {
        id: event.id,
        project_id: event.projectId,
        task: event.task,
        model: event.model,
        model_class: event.modelClass,
        route_reason: event.routeReason,
        input_tokens: event.inputTokens,
        cached_input_tokens: event.cachedInputTokens,
        output_tokens: event.outputTokens,
        total_tokens: event.totalTokens,
        estimated_cost_usd: event.estimatedCostUsd,
        pricing_version: event.pricingVersion,
        created_at: event.createdAt,
        updated_at: event.updatedAt,
      };
    },
    fromRow: (row) =>
      ({
        id: stringValue(row, 'id'),
        projectId: stringValue(row, 'project_id'),
        task: stringValue(row, 'task', 'capture') as AiUsageEvent['task'],
        model: stringValue(row, 'model'),
        modelClass: stringValue(row, 'model_class', 'override') as AiUsageEvent['modelClass'],
        routeReason: stringValue(row, 'route_reason'),
        inputTokens: numberValue(row, 'input_tokens'),
        cachedInputTokens: numberValue(row, 'cached_input_tokens'),
        outputTokens: numberValue(row, 'output_tokens'),
        totalTokens: numberValue(row, 'total_tokens'),
        estimatedCostUsd: numberValue(row, 'estimated_cost_usd'),
        pricingVersion: stringValue(row, 'pricing_version'),
        createdAt: stringValue(row, 'created_at', nowISO()),
        updatedAt: stringValue(row, 'updated_at', nowISO()),
      }) satisfies AiUsageEvent,
  },
  ...fieldWorldConfigs,
];

export const syncedTables = tableConfigs.map((config) => config.table);
export const remotePullPageSize = 1000;
export const remoteUploadBatchSize = 500;
export const remoteActivityPullLimit = ACTIVITY_LOG_RETENTION_LIMIT;

const preserveLocalProjectConfiguration = (
  localProjects: readonly Project[],
  nextProjects: readonly Project[],
): Project[] => {
  const localById = new Map(localProjects.map((project) => [project.id, project]));
  return nextProjects.map((project) => {
    const localConfiguration = localById.get(project.id)?.fieldConfiguration;
    return localConfiguration
      ? { ...project, fieldConfiguration: structuredClone(localConfiguration) }
      : project;
  });
};

export const mergeRemoteData = (local: AppData, remote: SyncRemoteData): AppData =>
  normalizeAppData({
    ...local,
    projects: preserveLocalProjectConfiguration(
      local.projects,
      mergeRows(local.projects, (remote.projects ?? []) as Project[]),
    ),
    buildings: mergeRows(local.buildings, (remote.buildings ?? []) as AppData['buildings']),
    floors: mergeRows(local.floors, (remote.floors ?? []) as AppData['floors']),
    units: mergeRows(local.units, (remote.units ?? []) as Unit[]),
    crewMembers: mergeRows(local.crewMembers, (remote.crewMembers ?? []) as CrewMember[]),
    assignments: mergeRows(local.assignments, (remote.assignments ?? []) as Assignment[]),
    issues: mergeRows(local.issues, (remote.issues ?? []) as Issue[]),
    photoNotes: mergePhotoNotes(local.photoNotes, (remote.photoNotes ?? []) as PhotoNote[]),
    dailyLogs: reconcileDailyLogs(local.dailyLogs, (remote.dailyLogs ?? []) as DailyLog[]),
    reportDrafts: mergeRows(local.reportDrafts, (remote.reportDrafts ?? []) as ReportDocumentDraft[]),
    trainingQuestions: mergeRows(local.trainingQuestions, (remote.trainingQuestions ?? []) as TrainingQuestion[]),
    activityLogs: mergeRows(local.activityLogs, (remote.activityLogs ?? []) as ActivityLog[]),
    draftActions: mergeRows(local.draftActions, (remote.draftActions ?? []) as DraftAction[]),
    memories: mergeRows(local.memories, (remote.memories ?? []) as Memory[]),
    memoryCandidates: mergeRows(local.memoryCandidates, (remote.memoryCandidates ?? []) as MemoryCandidate[]),
    followUpTasks: mergeRows(local.followUpTasks, (remote.followUpTasks ?? []) as FollowUpTask[]),
    aiUsageEvents: mergeRows(local.aiUsageEvents, (remote.aiUsageEvents ?? []) as AiUsageEvent[]),
    daySessions: mergeRows(local.daySessions ?? [], (remote.daySessions ?? []) as DaySession[]),
    dailyReleaseBatches: mergeRows(local.dailyReleaseBatches ?? [], (remote.dailyReleaseBatches ?? []) as DailyReleaseBatch[]),
    todayTasks: mergeRows(local.todayTasks ?? [], (remote.todayTasks ?? []) as TodayTask[]),
    fieldEvents: mergeRows(local.fieldEvents ?? [], (remote.fieldEvents ?? []) as FieldEvent[]),
    walkSessions: mergeRows(local.walkSessions ?? [], (remote.walkSessions ?? []) as WalkSession[]),
    propertyContacts: mergeRows(local.propertyContacts ?? [], (remote.propertyContacts ?? []) as PropertyContact[]),
  });

const rowFingerprint = (config: SyncTable<{ id: string }>, item: { id: string }) => syncRowFingerprint(config.toRow(item));

const cloneBaseline = (baseline: SyncBaseline = {}) => {
  const next: SyncBaseline = { activityWindowStart: baseline.activityWindowStart };
  tableConfigs.forEach((config) => {
    const tableBaseline = baseline[config.key];
    if (tableBaseline) {
      next[config.key] = new Map(tableBaseline);
    }
  });
  return next;
};

const baselineFromRemoteData = (remote: SyncRemoteData): SyncBaseline => {
  const baseline: SyncBaseline = {};
  tableConfigs.forEach((config) => {
    const rows = (remote[config.key] ?? []) as { id: string }[];
    baseline[config.key] = new Map(rows.map((item) => [item.id, rowFingerprint(config, item)]));
  });
  const activityLogs = (remote.activityLogs ?? []) as ActivityLog[];
  if (activityLogs.length >= ACTIVITY_LOG_RETENTION_LIMIT) {
    const validTimes = activityLogs
      .map((log) => Date.parse(log.createdAt))
      .filter((time) => Number.isFinite(time));
    if (validTimes.length > 0) {
      baseline.activityWindowStart = new Date(Math.min(...validTimes)).toISOString();
    }
  }
  return baseline;
};

const changedItemsForConfig = (data: AppData, baseline: SyncBaseline, config: SyncTable<{ id: string }>) => {
  const tableBaseline = baseline[config.key];
  const items = (data[config.key] ?? []) as { id: string }[];
  const changedItems = items.filter((item) => rowFingerprint(config, item) !== tableBaseline?.get(item.id));
  if (config.key !== 'activityLogs' || !baseline.activityWindowStart) {
    return changedItems;
  }

  const windowStart = Date.parse(baseline.activityWindowStart);
  return changedItems.filter((item) => {
    if (tableBaseline?.has(item.id) || !Number.isFinite(windowStart)) {
      return true;
    }
    const createdAt = Date.parse((item as ActivityLog).createdAt);
    return !Number.isFinite(createdAt) || createdAt >= windowStart;
  });
};

const hasChangedRows = (data: AppData, baseline: SyncBaseline) => {
  const boundary = createDemoSyncBoundary(data);
  return tableConfigs.some((config) =>
    changedItemsForConfig(data, baseline, config).some((item) => !isDemoScopedSyncItem(boundary, config.key, item)),
  );
};

export interface UploadLocalDataResult {
  baseline: SyncBaseline;
  failures: string[];
  uploadedRows: number;
  uploadedTables: string[];
}

const uploadFailureMessage = (failures: string[]) =>
  `Upload failed for ${failures.length} table(s): ${failures.join('; ')}`;

const photoUploadMessage = (result: PhotoFileUploadResult) => {
  const parts: string[] = [];
  if (result.uploadedFiles > 0) {
    parts.push(`Uploaded ${result.uploadedFiles} private photo file(s).`);
  }
  if (result.failedFiles > 0) {
    parts.push(`${result.failedFiles} photo file(s) still waiting for cloud upload.`);
  }
  if (result.unavailableLocalFiles > 0) {
    parts.push(`${result.unavailableLocalFiles} older photo file(s) are not on this device.`);
  }
  return parts.join(' ');
};

const initialDiagnostics: SyncDiagnostics = {
  backgroundCheckCount: 0,
  queued: false,
  runCount: 0,
};

export const fetchRemoteData = async (client: SupabaseClient, requestGuard?: () => void) => {
  const remote: SyncRemoteData = {};
  let rowCount = 0;

  for (const config of tableConfigs) {
    const tableRows: Row[] = [];
    const pullLimit = config.pullLimit ?? Number.POSITIVE_INFINITY;
    let from = 0;

    while (tableRows.length < pullLimit) {
      const requestedRows = Math.min(remotePullPageSize, pullLimit - tableRows.length);
      const to = from + requestedRows - 1;
      let query = client.from(config.table).select('*');
      (config.pullOrder ?? [{ column: 'id', ascending: true }]).forEach((order) => {
        query = query.order(order.column, { ascending: order.ascending });
      });
      requestGuard?.();
      const { data, error } = await query.range(from, to);
      requestGuard?.();
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as Row[];
      tableRows.push(...rows);

      if (rows.length < requestedRows || tableRows.length >= pullLimit) {
        break;
      }

      from += requestedRows;
    }

    rowCount += tableRows.length;
    remote[config.key] = tableRows.map(config.fromRow);
  }

  return { remote, rowCount, baseline: baselineFromRemoteData(remote) };
};

export const uploadLocalData = async (
  client: SupabaseClient,
  data: AppData,
  baseline: SyncBaseline,
  requestGuard?: () => void,
): Promise<UploadLocalDataResult> => {
  const nextBaseline = cloneBaseline(baseline);
  const boundary = createDemoSyncBoundary(data);
  const failures: string[] = [];
  const uploadedTables: string[] = [];
  let uploadedRows = 0;

  for (const config of tableConfigs) {
    const items = changedItemsForConfig(data, baseline, config).filter((item) => !isDemoScopedSyncItem(boundary, config.key, item));
    if (items.length === 0) {
      continue;
    }

    const tableBaseline = nextBaseline[config.key] ?? new Map<string, string>();
    let uploadedAnyRows = false;
    for (let from = 0; from < items.length; from += remoteUploadBatchSize) {
      const batchItems = items.slice(from, from + remoteUploadBatchSize);
      const rows = batchItems.map(config.toRow);
      requestGuard?.();
      const { error } = await client.from(config.table).upsert(rows, { onConflict: 'id' });
      requestGuard?.();
      if (error) {
        const firstRow = from + 1;
        const lastRow = from + batchItems.length;
        failures.push(`${config.table} rows ${firstRow}-${lastRow}: ${error.message}`);
        break;
      }

      uploadedAnyRows = true;
      uploadedRows += rows.length;
      batchItems.forEach((item) => tableBaseline.set(item.id, rowFingerprint(config, item)));
      nextBaseline[config.key] = tableBaseline;
    }
    if (uploadedAnyRows) {
      uploadedTables.push(config.table);
    }
  }

  return { baseline: nextBaseline, failures, uploadedRows, uploadedTables };
};

export interface UploadLocalDataWithPhotosResult extends UploadLocalDataResult {
  data: AppData;
  photoUpload: PhotoFileUploadResult;
}

export const uploadLocalDataWithPhotos = async (
  client: SupabaseClient,
  userId: string,
  data: AppData,
  baseline: SyncBaseline,
  photoDependencies?: Partial<PhotoSyncDependencies>,
  requestGuard?: () => void,
): Promise<UploadLocalDataWithPhotosResult> => {
  const recordUpload = await uploadLocalData(client, data, baseline, requestGuard);
  requestGuard?.();
  const emptyPhotoUpload: PhotoFileUploadResult = {
    data,
    failedFiles: 0,
    failures: [],
    unavailableLocalFiles: 0,
    uploadedFiles: 0,
  };

  if (recordUpload.failures.length > 0) {
    return { ...recordUpload, data, photoUpload: emptyPhotoUpload };
  }

  const photoUpload = await uploadPendingPhotoFiles(client, userId, data, photoDependencies, requestGuard);
  requestGuard?.();
  if (photoUpload.uploadedFiles === 0) {
    return { ...recordUpload, data, photoUpload };
  }

  const pathUpload = await uploadLocalData(client, photoUpload.data, recordUpload.baseline, requestGuard);
  requestGuard?.();
  const failures = [...recordUpload.failures, ...pathUpload.failures];
  return {
    baseline: pathUpload.baseline,
    data: failures.length > 0 ? data : photoUpload.data,
    failures,
    photoUpload,
    uploadedRows: recordUpload.uploadedRows + pathUpload.uploadedRows,
    uploadedTables: Array.from(new Set([...recordUpload.uploadedTables, ...pathUpload.uploadedTables])),
  };
};

const appendRequiredLocalRows = <T extends { id: string }>(
  remoteRows: T[],
  localRows: T[],
  requiredIds: Set<string>,
) => {
  const remoteIds = new Set(remoteRows.map((row) => row.id));
  return [
    ...remoteRows,
    ...localRows.filter((row) => requiredIds.has(row.id) && !remoteIds.has(row.id)),
  ];
};

const appendRequiredProjectRows = <T extends { id: string; projectId: string }>(
  remoteRows: T[],
  localRows: T[],
  requiredProjectIds: Set<string>,
) => {
  const remoteIds = new Set(remoteRows.map((row) => row.id));
  return [
    ...remoteRows,
    ...localRows.filter(
      (row) => requiredProjectIds.has(row.projectId) && !remoteIds.has(row.id),
    ),
  ];
};

const projectIdentity = (project: Project) => [
  project.propertyName,
  project.location,
]
  .map((value) => value.trim().toLocaleLowerCase())
  .join('|');

const assertUnambiguousRetainedProjectIdentity = (
  localProjects: readonly Project[],
  remoteProjects: readonly Project[],
  retainedProjectIds: ReadonlySet<string>,
) => {
  const retainedProjects = localProjects.filter((project) =>
    retainedProjectIds.has(project.id));

  retainedProjects.forEach((localProject) => {
    const identity = projectIdentity(localProject);
    const remoteMatches = remoteProjects.filter(
      (remoteProject) => projectIdentity(remoteProject) === identity,
    );
    if (
      remoteMatches.length > 1
      || remoteMatches.some((remoteProject) => remoteProject.id !== localProject.id)
    ) {
      throw new Error(
        `Remote project identity conflicts with retained local project ${localProject.id}. Sync stopped without replacing local data.`,
      );
    }
  });
};

const localFieldParentScope = (local: AppData) => {
  const projectIds = new Set<string>();
  const unitIds = new Set<string>();
  const crewIds = new Set<string>();
  const buildingIds = new Set<string>();
  const floorIds = new Set<string>();

  local.projects.forEach((project) => {
    if (project.id === local.activeProjectId || project.fieldConfiguration) {
      projectIds.add(project.id);
    }
  });
  (local.daySessions ?? []).forEach((session) => {
    projectIds.add(session.projectId);
    session.activePaintCrewIds.forEach((crewId) => crewIds.add(crewId));
    session.activeCleanCrewIds.forEach((crewId) => crewIds.add(crewId));
  });
  (local.dailyReleaseBatches ?? []).forEach((batch) => {
    projectIds.add(batch.projectId);
    batch.items.forEach((item) => unitIds.add(item.unitId));
  });
  (local.todayTasks ?? []).forEach((task) => {
    projectIds.add(task.projectId);
    if (task.unitId) unitIds.add(task.unitId);
  });
  (local.fieldEvents ?? []).forEach((event) => {
    projectIds.add(event.projectId);
    if (event.unitId) unitIds.add(event.unitId);
    if (event.actorType === 'crew' && event.actorId) crewIds.add(event.actorId);
  });
  (local.walkSessions ?? []).forEach((session) => projectIds.add(session.projectId));

  local.units.forEach((unit) => {
    if (projectIds.has(unit.projectId)) unitIds.add(unit.id);
  });
  local.crewMembers.forEach((crew) => {
    if (crew.projectId && projectIds.has(crew.projectId)) crewIds.add(crew.id);
  });
  local.buildings.forEach((building) => {
    if (projectIds.has(building.projectId)) buildingIds.add(building.id);
  });
  local.floors.forEach((floor) => {
    if (buildingIds.has(floor.buildingId)) floorIds.add(floor.id);
  });
  local.units.forEach((unit) => {
    if (!unitIds.has(unit.id)) return;
    projectIds.add(unit.projectId);
    if (unit.buildingId) buildingIds.add(unit.buildingId);
    if (unit.floorId) floorIds.add(unit.floorId);
  });
  local.crewMembers.forEach((crew) => {
    if (!crewIds.has(crew.id)) return;
    if (crew.projectId) projectIds.add(crew.projectId);
  });
  local.floors.forEach((floor) => {
    if (floorIds.has(floor.id) && floor.buildingId) buildingIds.add(floor.buildingId);
  });
  local.buildings.forEach((building) => {
    if (buildingIds.has(building.id)) projectIds.add(building.projectId);
  });

  return { buildingIds, crewIds, floorIds, projectIds, unitIds };
};

export const replaceRemoteData = (local: AppData, remote: SyncRemoteData): AppData => {
  const remoteWithLocalDemo = withLocalDemoRows(local, remote);
  const required = localFieldParentScope(local);
  const remoteProjects = (remoteWithLocalDemo.projects ?? local.projects) as Project[];
  assertUnambiguousRetainedProjectIdentity(
    local.projects,
    remoteProjects,
    required.projectIds,
  );
  const projects = preserveLocalProjectConfiguration(
    local.projects,
    appendRequiredLocalRows(
      remoteProjects,
      local.projects,
      required.projectIds,
    ),
  );
  const buildings = appendRequiredLocalRows(
    (remoteWithLocalDemo.buildings ?? local.buildings) as AppData['buildings'],
    local.buildings,
    required.buildingIds,
  );
  const floors = appendRequiredLocalRows(
    (remoteWithLocalDemo.floors ?? local.floors) as AppData['floors'],
    local.floors,
    required.floorIds,
  );
  const units = appendRequiredLocalRows(
    (remoteWithLocalDemo.units ?? local.units) as Unit[],
    local.units,
    required.unitIds,
  );
  const crewMembers = appendRequiredLocalRows(
    (remoteWithLocalDemo.crewMembers ?? local.crewMembers) as CrewMember[],
    local.crewMembers,
    required.crewIds,
  );

  return normalizeAppData({
    ...local,
    projects,
    buildings,
    floors,
    units,
    crewMembers,
    assignments: appendRequiredProjectRows(
      (remoteWithLocalDemo.assignments ?? local.assignments) as Assignment[],
      local.assignments,
      required.projectIds,
    ),
    issues: appendRequiredProjectRows(
      (remoteWithLocalDemo.issues ?? local.issues) as Issue[],
      local.issues,
      required.projectIds,
    ),
    photoNotes: appendRequiredProjectRows(
      (remoteWithLocalDemo.photoNotes ?? local.photoNotes) as PhotoNote[],
      local.photoNotes,
      required.projectIds,
    ),
    dailyLogs: reconcileDailyLogs([], appendRequiredProjectRows(
      (remoteWithLocalDemo.dailyLogs ?? local.dailyLogs) as DailyLog[],
      local.dailyLogs,
      required.projectIds,
    )),
    reportDrafts: appendRequiredProjectRows(
      (remoteWithLocalDemo.reportDrafts ?? local.reportDrafts) as ReportDocumentDraft[],
      local.reportDrafts,
      required.projectIds,
    ),
    trainingQuestions: (remote.trainingQuestions ?? local.trainingQuestions) as TrainingQuestion[],
    daySessions: appendRequiredProjectRows(
      (remoteWithLocalDemo.daySessions ?? local.daySessions ?? []) as DaySession[],
      local.daySessions ?? [],
      required.projectIds,
    ),
    dailyReleaseBatches: appendRequiredProjectRows(
      (remoteWithLocalDemo.dailyReleaseBatches ?? local.dailyReleaseBatches ?? []) as DailyReleaseBatch[],
      local.dailyReleaseBatches ?? [],
      required.projectIds,
    ),
    todayTasks: appendRequiredProjectRows(
      (remoteWithLocalDemo.todayTasks ?? local.todayTasks ?? []) as TodayTask[],
      local.todayTasks ?? [],
      required.projectIds,
    ),
    fieldEvents: appendRequiredProjectRows(
      (remoteWithLocalDemo.fieldEvents ?? local.fieldEvents ?? []) as FieldEvent[],
      local.fieldEvents ?? [],
      required.projectIds,
    ),
    walkSessions: appendRequiredProjectRows(
      (remoteWithLocalDemo.walkSessions ?? local.walkSessions ?? []) as WalkSession[],
      local.walkSessions ?? [],
      required.projectIds,
    ),
    propertyContacts: appendRequiredProjectRows(
      (remoteWithLocalDemo.propertyContacts ?? local.propertyContacts ?? []) as PropertyContact[],
      local.propertyContacts ?? [],
      required.projectIds,
    ),
    activityLogs: appendRequiredProjectRows(
      (remoteWithLocalDemo.activityLogs ?? local.activityLogs) as ActivityLog[],
      local.activityLogs,
      required.projectIds,
    ),
    draftActions: (remoteWithLocalDemo.draftActions ?? local.draftActions) as DraftAction[],
    memories: (remoteWithLocalDemo.memories ?? local.memories) as Memory[],
    memoryCandidates: (remoteWithLocalDemo.memoryCandidates ?? local.memoryCandidates) as MemoryCandidate[],
    followUpTasks: (remoteWithLocalDemo.followUpTasks ?? local.followUpTasks) as FollowUpTask[],
    aiUsageEvents: appendRequiredProjectRows(
      (remoteWithLocalDemo.aiUsageEvents ?? local.aiUsageEvents) as AiUsageEvent[],
      local.aiUsageEvents,
      required.projectIds,
    ),
  });
};

export const useSupabaseSync = (
  data: AppData,
  setData: Dispatch<SetStateAction<AppData>>,
  hasStoredData: boolean,
): SyncController => {
  const enabled = isSyncFeatureEnabled;
  const configured = isSupabaseConfigured;
  const client = useMemo(() => getSupabaseClient(), []);
  const [authReady, setAuthReady] = useState(() => !enabled || !configured);
  const [session, setSession] = useState<Session | null>(null);
  const [lastAuthenticatedUserId, setRememberedAuthenticatedUserId] = useState(
    () => getLastAuthenticatedUserId() ?? undefined,
  );
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (!enabled) return 'disabled';
    if (!configured) return 'not_configured';
    if (!navigator.onLine) return 'offline';
    return 'signed_out';
  });
  const [message, setMessage] = useState('Sync is off. Local data is still saved on this device.');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics>(initialDiagnostics);
  const initializedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const hasStoredDataRef = useRef(hasStoredData);
  const syncBaselineRef = useRef<SyncBaseline>({});
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const pendingSyncOptionsRef = useRef<SyncRunOptions | undefined>(undefined);
  const pendingSyncGenerationRef = useRef<number | undefined>(undefined);
  const syncNowRef = useRef<((options?: SyncRunOptions) => Promise<void>) | undefined>(undefined);
  const realtimePullTimerRef = useRef<number | undefined>(undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dataRef = useRef(data);
  const realtimeEventRef = useRef<{ event: string; table: string } | undefined>(undefined);
  const sessionUserIdRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    hasStoredDataRef.current = hasStoredData;
  }, [hasStoredData]);

  const updateActiveSession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null;
    if (nextUserId) {
      const remembered = setLastAuthenticatedUserId(nextUserId);
      setRememberedAuthenticatedUserId(remembered ? nextUserId : undefined);
    }
    if (sessionUserIdRef.current !== nextUserId) {
      sessionUserIdRef.current = nextUserId;
      sessionGenerationRef.current += 1;
      initializedRef.current = false;
      syncBaselineRef.current = {};
      pendingSyncRef.current = false;
      pendingSyncOptionsRef.current = undefined;
      pendingSyncGenerationRef.current = undefined;
    }
    setSession(nextSession);
  }, []);

  const startDiagnostics = useCallback((trigger: SyncTrigger, quiet = false) => {
    const realtimeEvent = realtimeEventRef.current;
    setDiagnostics((current) => ({
      ...current,
      backgroundCheckCount: current.backgroundCheckCount + (quiet ? 1 : 0),
      lastError: undefined,
      lastEvent: trigger === 'realtime' ? realtimeEvent?.event : current.lastEvent,
      lastStartedAt: nowISO(),
      lastTable: trigger === 'realtime' ? realtimeEvent?.table : current.lastTable,
      lastTrigger: trigger,
      queued: false,
      runCount: current.runCount + 1,
    }));
  }, []);

  const finishDiagnostics = useCallback(
    (
      patch: Pick<SyncDiagnostics, 'lastPulledRows' | 'lastUploadedRows'> & {
        lastPhotoError?: string;
        lastUploadedPhotoFiles?: number;
        lastUploadedTables?: string[];
        pendingPhotoFiles?: number;
        unavailableLocalPhotoFiles?: number;
      },
    ) => {
      setDiagnostics((current) => ({
        ...current,
        ...patch,
        lastError: undefined,
        lastFinishedAt: nowISO(),
        queued: false,
      }));
    },
    [],
  );

  const failDiagnostics = useCallback((error: unknown) => {
    setDiagnostics((current) => ({
      ...current,
      lastError: error instanceof Error ? error.message : 'Sync failed.',
      lastFinishedAt: nowISO(),
      queued: false,
    }));
  }, []);

  const getSyncIdentity = useCallback((): SyncIdentity | null => {
    const userId = session?.user.id;
    if (!userId || sessionUserIdRef.current !== userId) return null;
    if (cacheBelongsToUser(userId)) {
      return { generation: sessionGenerationRef.current, userId };
    }
    setStatus('cache_transition_required');
    setMessage('This device\'s local data is not linked to the signed-in account. Claim it explicitly or sign out before syncing.');
    return null;
  }, [session]);

  const getSyncContext = useCallback(() => {
    const identity = getSyncIdentity();
    if (!identity || !session) return null;
    const requestClient = getSessionBoundSupabaseClient(session.access_token);
    if (!requestClient) {
      setStatus('not_configured');
      setMessage('Sync is enabled but Supabase environment variables are missing.');
      return null;
    }
    return { identity, requestClient };
  }, [getSyncIdentity, session]);

  const guardSyncIdentity = useCallback((identity: SyncIdentity) => {
    assertSyncIdentity(identity, sessionUserIdRef.current, sessionGenerationRef.current);
  }, []);

  const finishSyncRun = useCallback(() => {
    syncInFlightRef.current = false;
    if (!pendingSyncRef.current) return;

    const pendingOptions = pendingSyncOptionsRef.current ?? { trigger: 'manual' };
    const pendingGeneration = pendingSyncGenerationRef.current;
    pendingSyncRef.current = false;
    pendingSyncOptionsRef.current = undefined;
    pendingSyncGenerationRef.current = undefined;

    if (pendingGeneration !== sessionGenerationRef.current) return;
    window.setTimeout(() => void syncNowRef.current?.(pendingOptions), 250);
  }, []);

  const handleInterruptedSync = useCallback((identity: SyncIdentity) => {
    if (sessionUserIdRef.current === identity.userId && !cacheBelongsToUser(identity.userId)) {
      setStatus('cache_transition_required');
      setMessage('This device\'s local data is not linked to the signed-in account. Claim it explicitly or sign out before syncing.');
    }
  }, []);

  const markQueued = useCallback(() => {
    setDiagnostics((current) => ({ ...current, queued: true }));
  }, []);

  const pullNow = useCallback(async () => {
    if (!client || !session) return;
    const context = getSyncContext();
    if (!context) return;
    const { identity, requestClient } = context;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      pendingSyncOptionsRef.current = { trigger: 'pull' };
      pendingSyncGenerationRef.current = identity.generation;
      markQueued();
      setStatus('syncing');
      setMessage('A sync is already running. One more pass is queued.');
      return;
    }

    syncInFlightRef.current = true;
    try {
      startDiagnostics('pull');
      setStatus('syncing');
      setMessage('Pulling cloud updates...');
      const requestGuard = () => guardSyncIdentity(identity);
      const { remote, rowCount, baseline } = await fetchRemoteData(requestClient, requestGuard);
      requestGuard();
      // Merge INSIDE a flushSync'd functional update so the base is React's
      // freshest committed state, not a snapshot taken before this await.
      // Otherwise a local tap dispatched during the pull would be silently
      // overwritten by the wholesale replace. flushSync runs the updater
      // synchronously, so `nextData` is correct before we mirror it into refs.
      let nextData = dataRef.current;
      applyingRemoteRef.current = true;
      flushSync(() => {
        setData((current) => {
          nextData = rowCount > 0
            ? hasStoredDataRef.current
              ? mergeRemoteData(current, remote)
              : replaceRemoteData(current, remote)
            : current;
          return nextData;
        });
      });
      syncBaselineRef.current = baseline;
      dataRef.current = nextData;
      hasStoredDataRef.current = true;
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);

      const hasPendingUpload = hasChangedRows(nextData, syncBaselineRef.current);
      setStatus(hasPendingUpload ? 'pending_upload' : 'synced');
      setLastSyncedAt(nowISO());
      finishDiagnostics({
        lastPulledRows: rowCount,
        lastUploadedRows: 0,
        lastUploadedTables: [],
      });
      setMessage(
        hasPendingUpload
          ? 'Cloud updates pulled. This device still has local changes; tap Sync now to upload.'
          : rowCount > 0
            ? 'Cloud updates pulled. No local changes were uploaded.'
            : 'No cloud records found. No local changes were uploaded.',
      );
    } catch (error) {
      if (error instanceof SyncSessionChangedError) {
        handleInterruptedSync(identity);
        return;
      }
      failDiagnostics(error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Pull failed.');
    } finally {
      finishSyncRun();
    }
  }, [client, failDiagnostics, finishDiagnostics, finishSyncRun, getSyncContext, guardSyncIdentity, handleInterruptedSync, markQueued, session, setData, startDiagnostics]);

  const uploadNow = useCallback(async (options: SyncRunOptions = { trigger: 'upload' }) => {
    if (!client || !session) return;
    const context = getSyncContext();
    if (!context) return;
    const { identity, requestClient } = context;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      pendingSyncOptionsRef.current = options;
      pendingSyncGenerationRef.current = identity.generation;
      markQueued();
      if (!options.quiet) {
        setStatus('syncing');
        setMessage('A sync is already running. One more pass is queued.');
      }
      return;
    }

    syncInFlightRef.current = true;
    try {
      startDiagnostics(options.trigger, options.quiet);
      if (!options.quiet) {
        setStatus('syncing');
        setMessage('Checking cloud before upload...');
      }

      const requestGuard = () => guardSyncIdentity(identity);
      const { remote, rowCount, baseline } = await fetchRemoteData(requestClient, requestGuard);
      requestGuard();
      let nextData = dataRef.current;
      syncBaselineRef.current = baseline;

      if (rowCount > 0) {
        // Same race guard as pullNow: merge against freshest committed state so
        // a local tap during the pre-upload pull is not dropped before upload.
        let merged = dataRef.current;
        applyingRemoteRef.current = true;
        flushSync(() => {
          setData((current) => {
            merged = hasStoredDataRef.current
              ? mergeRemoteData(current, remote)
              : replaceRemoteData(current, remote);
            return merged;
          });
        });
        nextData = merged;
        dataRef.current = nextData;
        hasStoredDataRef.current = true;
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);
      }

      const uploadResult = await uploadLocalDataWithPhotos(
        requestClient,
        identity.userId,
        nextData,
        syncBaselineRef.current,
        undefined,
        requestGuard,
      );
      requestGuard();
      const photoUploadResult = uploadResult.photoUpload;
      nextData = uploadResult.data;
      syncBaselineRef.current = uploadResult.baseline;
      if (uploadResult.failures.length > 0) {
        throw new Error(uploadFailureMessage(uploadResult.failures));
      }
      if (photoUploadResult.uploadedFiles > 0) {
        applyingRemoteRef.current = true;
        setData(nextData);
        dataRef.current = nextData;
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);
      }
      setStatus(photoUploadResult.failedFiles > 0 ? 'pending_upload' : 'synced');
      setLastSyncedAt(nowISO());
      finishDiagnostics({
        lastPhotoError: photoUploadResult.failures[0],
        lastPulledRows: rowCount,
        lastUploadedPhotoFiles: photoUploadResult.uploadedFiles,
        lastUploadedRows: uploadResult.uploadedRows,
        lastUploadedTables: uploadResult.uploadedTables,
        pendingPhotoFiles: photoUploadResult.failedFiles,
        unavailableLocalPhotoFiles: photoUploadResult.unavailableLocalFiles,
      });
      const photoMessage = photoUploadMessage(photoUploadResult);
      setMessage(
        `${
          uploadResult.uploadedRows > 0
          ? `Checked cloud first, then uploaded ${uploadResult.uploadedRows} local change(s).`
          : 'No local record changes to upload.'
        }${photoMessage ? ` ${photoMessage}` : ''}`,
      );
    } catch (error) {
      if (error instanceof SyncSessionChangedError) {
        handleInterruptedSync(identity);
        return;
      }
      failDiagnostics(error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      finishSyncRun();
    }
  }, [client, failDiagnostics, finishDiagnostics, finishSyncRun, getSyncContext, guardSyncIdentity, handleInterruptedSync, markQueued, session, setData, startDiagnostics]);

  const syncNow = useCallback(async (options: SyncRunOptions = { trigger: 'manual' }) => {
    if (!client || !session) return;
    const context = getSyncContext();
    if (!context) return;
    const { identity, requestClient } = context;
    if (!navigator.onLine) {
      setStatus('offline');
      setMessage('Offline. Changes are saved locally and will sync after reconnect.');
      return;
    }

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      pendingSyncOptionsRef.current = options;
      pendingSyncGenerationRef.current = identity.generation;
      markQueued();
      if (!options.quiet) {
        setStatus('syncing');
        setMessage('A sync is already running. One more pass is queued.');
      }
      return;
    }

    syncInFlightRef.current = true;
    try {
      startDiagnostics(options.trigger, options.quiet);
      if (!options.quiet) {
        setStatus('syncing');
        setMessage('Checking cloud records...');
      }
      const requestGuard = () => guardSyncIdentity(identity);
      const { remote, rowCount, baseline } = await fetchRemoteData(requestClient, requestGuard);
      requestGuard();
      let nextData = dataRef.current;
      syncBaselineRef.current = baseline;

      if (rowCount > 0) {
        // Same race guard as pullNow: merge against freshest committed state so
        // a local tap during the pre-upload pull is not dropped before upload.
        let merged = dataRef.current;
        applyingRemoteRef.current = true;
        flushSync(() => {
          setData((current) => {
            merged = hasStoredDataRef.current
              ? mergeRemoteData(current, remote)
              : replaceRemoteData(current, remote);
            return merged;
          });
        });
        nextData = merged;
        dataRef.current = nextData;
        hasStoredDataRef.current = true;
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);
      }

      const uploadResult = await uploadLocalDataWithPhotos(
        requestClient,
        identity.userId,
        nextData,
        syncBaselineRef.current,
        undefined,
        requestGuard,
      );
      requestGuard();
      const photoUploadResult = uploadResult.photoUpload;
      nextData = uploadResult.data;
      syncBaselineRef.current = uploadResult.baseline;
      if (uploadResult.failures.length > 0) {
        throw new Error(uploadFailureMessage(uploadResult.failures));
      }
      if (photoUploadResult.uploadedFiles > 0) {
        applyingRemoteRef.current = true;
        setData(nextData);
        dataRef.current = nextData;
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);
      }
      initializedRef.current = true;
      setStatus(photoUploadResult.failedFiles > 0 ? 'pending_upload' : 'synced');
      setLastSyncedAt(nowISO());
      finishDiagnostics({
        lastPhotoError: photoUploadResult.failures[0],
        lastPulledRows: rowCount,
        lastUploadedPhotoFiles: photoUploadResult.uploadedFiles,
        lastUploadedRows: uploadResult.uploadedRows,
        lastUploadedTables: uploadResult.uploadedTables,
        pendingPhotoFiles: photoUploadResult.failedFiles,
        unavailableLocalPhotoFiles: photoUploadResult.unavailableLocalFiles,
      });
      const photoMessage = photoUploadMessage(photoUploadResult);
      setMessage(
        `${
          options.quiet && uploadResult.uploadedRows === 0 && photoUploadResult.uploadedFiles === 0
          ? `Synced. Background ${options.trigger === 'realtime' ? 'Realtime' : 'cloud'} check found no local uploads.`
          : rowCount > 0
          ? `Pulled cloud records and uploaded ${uploadResult.uploadedRows} local change(s).`
          : `Cloud was empty. Uploaded ${uploadResult.uploadedRows} local record(s).`
        }${photoMessage ? ` ${photoMessage}` : ''}`,
      );
    } catch (error) {
      if (error instanceof SyncSessionChangedError) {
        handleInterruptedSync(identity);
        return;
      }
      failDiagnostics(error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      finishSyncRun();
    }
  }, [client, failDiagnostics, finishDiagnostics, finishSyncRun, getSyncContext, guardSyncIdentity, handleInterruptedSync, markQueued, session, setData, startDiagnostics]);

  const claimLocalCache = useCallback(async () => {
    if (!session || sessionUserIdRef.current !== session.user.id) return;
    if (!setLocalCacheOwner(session.user.id)) {
      setStatus('cache_transition_required');
      setMessage('This browser could not securely save the account link. Check site storage settings or sign out; sync remains blocked.');
      return;
    }
    initializedRef.current = false;
    syncBaselineRef.current = {};
    setStatus('syncing');
    setMessage('Local cache claimed for this account. Starting a checked sync...');
    await syncNow({ trigger: 'manual' });
  }, [session, syncNow]);

  syncNowRef.current = syncNow;

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) return;
      setAuthReady(false);
      setStatus('syncing');
      setMessage('Signing in...');
      const { data: authData, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthReady(true);
        setStatus('error');
        setMessage(
          error.message.toLowerCase().includes('email logins')
            ? 'Email/password login is disabled in Supabase. Re-enable the Email provider, then try again.'
            : error.message,
        );
        return;
      }
      updateActiveSession(authData.session);
      setAuthReady(true);
      setMessage('Signed in. Starting sync...');
    },
    [client, updateActiveSession],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    setAuthReady(false);
    const { error } = await client.auth.signOut();
    if (error) {
      setAuthReady(true);
      setStatus('error');
      setMessage(`Could not sign out: ${error.message}`);
      return;
    }
    updateActiveSession(null);
    clearLastAuthenticatedUserId();
    setRememberedAuthenticatedUserId(undefined);
    setAuthReady(true);
    setStatus('signed_out');
    setMessage('Signed out. This device still keeps its local cache.');
  }, [client, updateActiveSession]);

  useEffect(() => {
    if (!enabled) {
      setAuthReady(true);
      setStatus('disabled');
      setMessage('Sync is off. Local data is still saved on this device.');
      return;
    }

    if (!configured || !client) {
      setAuthReady(true);
      setStatus('not_configured');
      setMessage('Sync is enabled but Supabase environment variables are missing.');
      return;
    }

    let active = true;
    const sessionLookupGeneration = sessionGenerationRef.current;
    setAuthReady(false);
    void client.auth
      .getSession()
      .then(({ data: authData, error }) => {
        if (!active) return;
        if (sessionLookupGeneration !== sessionGenerationRef.current) return;
        if (error) {
          setAuthReady(true);
          setStatus('error');
          setMessage('Could not verify the Supabase session. Backup restore remains locked for safety.');
          return;
        }
        updateActiveSession(authData.session);
        setAuthReady(true);
        setStatus(authData.session ? 'syncing' : 'signed_out');
        setMessage(authData.session ? 'Restoring Supabase session...' : 'Sign in to sync this device.');
      })
      .catch(() => {
        if (!active) return;
        if (sessionLookupGeneration !== sessionGenerationRef.current) return;
        setAuthReady(true);
        setStatus('error');
        setMessage('Could not verify the Supabase session. Backup restore remains locked for safety.');
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        clearLastAuthenticatedUserId();
        setRememberedAuthenticatedUserId(undefined);
      }
      updateActiveSession(nextSession);
      setAuthReady(true);
      setDiagnostics((current) => ({
        ...current,
        lastEvent: event,
        lastTrigger: current.lastTrigger ?? 'startup',
      }));

      if (!nextSession) {
        setStatus('signed_out');
        setMessage('Sign in to sync this device.');
        return;
      }

      if (!cacheBelongsToUser(nextSession.user.id)) {
        initializedRef.current = false;
        setStatus('cache_transition_required');
        setMessage('This device\'s local data is not linked to the signed-in account. Claim it explicitly or sign out before syncing.');
        return;
      }

      if (initializedRef.current) {
        setStatus((current) => (current === 'signed_out' ? 'synced' : current));
        return;
      }

      setStatus('syncing');
      setMessage('Supabase session active. Starting sync...');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, configured, enabled, updateActiveSession]);

  useEffect(() => {
    if (!client || !session || initializedRef.current) return;
    void syncNow({ trigger: 'startup' });
  }, [client, session, syncNow]);

  useEffect(() => {
    if (!client || !session) return;

    const handleOnline = () => void syncNow({ trigger: 'reconnect' });
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

    const scheduleRealtimeSync = (table: string, event: string) => {
      realtimeEventRef.current = { event, table };
      setDiagnostics((current) => ({
        ...current,
        lastEvent: event,
        lastTable: table,
        lastTrigger: 'realtime',
      }));

      if (realtimePullTimerRef.current) {
        window.clearTimeout(realtimePullTimerRef.current);
      }

      realtimePullTimerRef.current = window.setTimeout(() => {
        realtimePullTimerRef.current = undefined;
        void syncNowRef.current?.({ quiet: true, trigger: 'realtime' });
      }, 2500);
    };

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
        (payload) => scheduleRealtimeSync(config.table, String(payload.eventType ?? 'change')),
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (realtimePullTimerRef.current) {
        window.clearTimeout(realtimePullTimerRef.current);
        realtimePullTimerRef.current = undefined;
      }
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [client, session]);

  useEffect(() => {
    if (!client || !session || !initializedRef.current || applyingRemoteRef.current) return;

    if (!hasChangedRows(data, syncBaselineRef.current)) return;

    const uploadTimer = window.setTimeout(() => {
      void uploadNow({ trigger: 'local_edit' });
    }, 1200);

    return () => window.clearTimeout(uploadTimer);
  }, [client, data, session, uploadNow]);

  return {
    enabled,
    configured,
    authReady,
    signedIn: Boolean(session),
    userId: session?.user.id,
    lastAuthenticatedUserId,
    status,
    message,
    diagnostics,
    email: session?.user.email,
    lastSyncedAt,
    signIn,
    signOut,
    syncNow,
    uploadNow,
    pullNow,
    claimLocalCache,
  };
};
