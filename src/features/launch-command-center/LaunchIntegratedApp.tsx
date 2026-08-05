import { AlertTriangle, Download, Footprints, RefreshCw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BoardFirstShell,
  type BoardFirstActivityItem,
  type BoardFirstAssistantRequest,
  type BoardFirstCaptureRequest,
  type BoardFirstHostNavigationRequest,
  type BoardFirstView,
} from '../wave1r-board-first';
import {
  createSupabaseAuthAdapter,
  resolvePostAuthOfflineContinuity,
} from '../launch-setup';
import {
  createAppDataOperationalReadSource,
  createInMemoryOperationalMemoryRepositories,
  listOperationalActivity,
  type ActivityItem,
} from '../operational-memory';
import {
  LaunchLoginSurface,
} from './LaunchCommandCenter';
import { projectLaunchAppData } from './appDataProjection';
import { createLaunchBoardRepository } from './boardRepository';
import { projectCanonicalFieldConsumers } from './canonicalFieldConsumers';
import type {
  LaunchPrimaryDestination,
  LaunchQuickActionId,
} from './types';
import {
  NativeHomeSummaryPage,
  NativeNotificationsPage,
  NativeSearchPage,
  selectNativeHomeSummary,
  type NativeHomeRecord,
  type NativeNotificationItem,
  type NativeNotificationTab,
  type NativeSearchGroup,
  type NativeSearchResult,
} from '../wave2a1-native/track-a';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
  TrackBCrewFormPage,
  TrackBCrewListPage,
  TrackBProfilePage,
  TrackBReportsAndProofPage,
  type TrackBCrewDraft,
  type TrackBCrewRecord,
  type TrackBDataStatus,
  type TrackBReportCounts,
  type TrackBToolDestination,
} from '../wave2a1-native/track-b';
import {
  PersonalActivityDetailSheet,
  TrackCNativeFlow,
  type PersonalActivityViewModel,
  type TrackCNativeFileSelection,
  type TrackCPlusAction,
} from '../wave2a1-native/track-c';
import {
  ThemeAwareMorePage,
  Wave2A2OverlayBoundary,
  Wave2A2StandaloneRoute,
  Wave2A2UnifiedShell,
  useTurnTheme,
} from '../wave2a2-track-a';
import {
  createTodayTask,
  createTodayTaskGoal,
  DayTaskWorkspace,
  startDaySession,
  type StartDayReview,
  type StartDayPrefill,
  type TrackBCrewOption,
} from '../wave2a2-track-b';
import {
  TrackCFieldOps,
  type TrackCRouteState,
  buildDailyReportData,
  applyTrackCSectionAction,
  clearTrackCAssignments,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  prewarmDailyReportPdf,
  projectTrackCCrewDetail,
  projectTrackCUnitWork,
  projectTrackCWork,
  saveDailyReportPdf,
  trackCTradeWorkTypeLabel,
  trackCCrewName,
} from '../wave2a2-track-c';
import {
  ManualReleaseReview,
} from '../wave2a2-core/ManualReleaseReview';
import {
  OfficialPdsFormsPage,
} from '../wave2a2-core/OfficialPdsFormsPage';
import { appendPersonalNoteActivity, PERSONAL_NOTE_ACTIVITY_ACTION } from '../wave2a1-native/track-c/personalActivity';
import { TellTurnOS } from './TellTurnOS';
import { TurnPeek, type PeekTarget } from './TurnPeek';
import type { TrackCState } from '../wave2a2-track-c/model';
import { paintWorkTypeLabel } from '../wave2a2-track-c/model';
import type { TurnIntent } from '../../lib/intelligenceClient';
import { MyNotesPage } from '../wave2a1-native/track-b/MyNotesPage';
import { PortalPage, buildPortalUnits } from '../wave2a2-core/PortalPage';
import {
  applyDayTaskStateChange,
  applyTrackCStateChange,
  applyTrackCWalkDraftChange,
  appendManualReleaseBatchOnce,
  appendManualReleaseBatchToActiveDay,
  currentLocalDate,
  projectDailyReleases,
  projectDayEvents,
  projectDaySessions,
  projectPropertyRoster,
  projectTodayTask,
  projectTrackCState,
  projectTrackCWalkDraft,
  setReleaseWorkType,
  setSectionReleaseState,
  setTradeReleaseState,
  setUnitReleaseRestriction,
} from '../wave2a2-core/appDataAdapters';
import {
  adaptAppDataForTrackA,
  buildCanonicalFieldProjectionFromAppData,
  persistPreparedProjectActivation,
  prepareProjectActivation,
  ProfilePrivacyScrollRegion,
  ProjectSetupFlow,
  FastStartDayFlow,
  createConfirmedDailyReleaseBatch,
  createProjectSetupDraftStore,
  formatWalkthroughScheduleWording,
  formatWorkingHoursWording,
  groupFieldActivityBursts,
  resolveStartDayValues,
  TodayTaskDetail,
  type CanonicalFieldProjection,
  type FastStartDaySubmission,
  type ProjectActivationDraft,
  type ProjectRosterUnitOption,
  type StartDayResolvedValues,
  type TrackACrewOption,
} from '../wave2a21-track-a';
import {
  TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS,
  captureTrackCTransientOrigin,
  createTrackCTabRouteMemory,
  getTrackCCurrentTabRoute,
  rememberTrackCTabRoute,
  rememberTrackCTabScroll,
  restoreTrackCTransientOrigin,
  selectTrackCPrimaryTab,
  type TrackCPrimaryTab,
  type TrackCTransientOriginSnapshot,
} from '../wave2a21-track-c';
import {
  addProjectContact,
  createProjectActivationDraft,
  prepareDraftForActivationAttempt,
  removeProjectContact,
} from '../wave2a21-field-activation/model';
import type { CaptureResultReceipt } from '../../lib/captureSession';
import { motionSafeScrollBehavior } from '../../lib/accessibility';
import { addCrewMember, addPhotoNote, archiveProject, updateCrewMember, updateUnit } from '../../lib/actions';
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
import { useAiAuth } from '../../lib/ai/useAiAuth';
import { createId, nowISO } from '../../lib/constants';
import {
  buildAppHash,
  resolveAppHash,
  routeForNavigation,
  type AppNavigate,
} from '../../lib/routing';
import { clearPhotoBlobs } from '../../lib/photoStorage';
import { estimateStorageUsage, persistAppDataNow, usePersistentAppData } from '../../lib/storage';
import { getLocalCacheOwner } from '../../lib/supabase/cacheOwnership';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useSupabaseSync } from '../../lib/supabase/sync';
import type { TurnCommandSourceRequest } from '../../lib/turnCommand';
import type {
  ActivityLog,
  AppData,
  AppView,
  FieldSection,
} from '../../types';
import { SyncPanel } from '../../components/SyncPanel';
import { AssignmentsView } from '../../views/AssignmentsView';
import { CopilotView, type CopilotViewHandle } from '../../views/CopilotView';
import { DailyLogView } from '../../views/DailyLogView';
import { ExportView } from '../../views/ExportView';
import { IssuesView } from '../../views/IssuesView';
import { ReviewView } from '../../views/ReviewView';
import { buildJsonBackupWithLocalPhotos } from '../../lib/photoBackup';
import { downloadTextFile } from '../../lib/exporters';
import { SyncDiagnosticsView } from '../../views/SyncDiagnosticsView';
import { TrainingQuestionsView } from '../../views/TrainingQuestionsView';
import { UnitDetailView } from '../../views/UnitDetailView';
import { UnitsView } from '../../views/UnitsView';
import { RecoveryMode } from './RecoveryMode';
import './launchHost.css';

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';
const FULL_PAGE_RETURN_HISTORY_KEY = 'turnOsLaunchFullPageReturn';

type BoardCaptureContext = BoardFirstCaptureRequest | BoardFirstAssistantRequest;

type CrewEditorState =
  | { mode: 'add' }
  | { crewId: string; mode: 'edit' }
  | null;

type MoreDetailPage = 'crews' | 'day-history' | 'forms' | 'my-notes' | 'portal' | 'profile' | 'privacy' | 'standard' | 'storage' | null;
type HomeMode = 'day' | 'manual-release' | 'start-day';

const FAST_START_DAY_SECTIONS = new Set<FieldSection>([
  'common',
  'A',
  'B',
  'C',
  'D',
  'E',
]);

const toFastStartDaySection = (section: string): FieldSection => {
  if (!FAST_START_DAY_SECTIONS.has(section as FieldSection)) {
    throw new Error(`Unsupported Property roster section: ${section}.`);
  }
  return section as FieldSection;
};

const TRACK_C_TAB_ROOTS = {
  activity: '#/activity',
  home: '#/dashboard',
  more: '#/more',
  turnboard: '#/units',
} as const;

const trackCTabForRoute = (view: AppView): TrackCPrimaryTab => {
  // Crews is its own first-class tab now — routing it under the 'activity'
  // memory slot keeps it OUT of TurnBoard's remembered route, so tapping
  // TurnBoard always lands on the board (the "tap TurnBoard, get Crews" bug).
  if (view === 'activity' || view === 'crews') return 'activity';
  if (
    view === 'units'
    || view === 'unitDetail'
    || view === 'assignments'
  ) return 'turnboard';
  if (
    view === 'more'
    || view === 'setup'
    || view === 'reports'
    || view === 'sync'
    || view === 'export'
  ) return 'more';
  return 'home';
};

const readHistoryState = (): Record<string, unknown> => {
  if (typeof window === 'undefined') return {};
  const state = window.history.state;
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
};

const historyRequestsCapture = () =>
  readHistoryState()[LEGACY_CAPTURE_HISTORY_KEY] === true;

const clearLegacyCaptureHistoryState = () => {
  if (typeof window === 'undefined' || !historyRequestsCapture()) return;
  const nextState = { ...readHistoryState() };
  delete nextState[LEGACY_CAPTURE_HISTORY_KEY];
  window.history.replaceState(
    Object.keys(nextState).length > 0 ? nextState : null,
    '',
    window.location.href,
  );
};

const focusVisibleElementById = (elementId: string) => {
  const element = document.getElementById(elementId);
  if (!element?.isConnected || element.getClientRects().length === 0) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
};

const boardViewForRoute = (view: AppView): BoardFirstView => {
  if (view === 'activity') return 'activity';
  if (view === 'more') return 'more';
  return 'turnboard';
};

const primaryDestinationForRoute = (view: AppView): LaunchPrimaryDestination => {
  if (view === 'dashboard') return 'home';
  if (view === 'crews') return 'crews';
  if (
    view === 'units'
    || view === 'unitDetail'
    || view === 'assignments'
  ) return 'turnboard';
  return 'more';
};

const contentTitleForRoute = (view: AppView, unitNumber?: string) => {
  if (view === 'dashboard') return 'Home';
  if (view === 'activity') return 'Activity';
  if (view === 'more') return 'More';
  if (view === 'search') return 'Search';
  if (view === 'notifications') return 'Notifications';
  if (view === 'unitDetail') return unitNumber ? `Unit ${unitNumber}` : 'Unit';
  if (view === 'units') return 'TurnBoard';
  if (view === 'issues') return 'Issues';
  if (view === 'crews') return 'Crews';
  if (view === 'assignments') return 'Assign Crews';
  if (view === 'daily') return 'Daily log';
  if (view === 'reports') return 'Reports';
  if (view === 'review') return 'Review';
  if (view === 'setup') return 'Setup';
  if (view === 'sync') return 'Sync';
  if (view === 'export') return 'Data and backup';
  if (view === 'training') return 'Training questions';
  return 'Turn OS';
};

const boardActivityKind = (
  activity: ActivityItem,
): BoardFirstActivityItem['kind'] => {
  if (activity.eventKind === 'assignment-recorded') return 'assignment';
  if (activity.eventKind === 'crew-report-recorded') return 'crew-report';
  if (activity.eventKind === 'inspection-recorded') return 'los-inspection';
  if (activity.eventKind === 'callback-recorded') return 'note';
  if (activity.eventKind === 'blocker-recorded') return 'access';
  if (activity.eventKind === 'property-walk-recorded') return 'property-walk';
  if (activity.eventKind === 'reconciliation-recorded') return 'paper-review';
  return 'note';
};

export function LaunchIntegratedApp() {
  const persistence = usePersistentAppData();
  if (persistence.recovery) {
    return (
      <RecoveryMode
        onResetToDemo={persistence.resetToDemo}
        onRestore={persistence.restoreDataNow}
        recovery={persistence.recovery}
      />
    );
  }
  return <LaunchOperationalApp persistence={persistence} />;
}

const localEventDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function LaunchOperationalApp({
  persistence,
}: {
  persistence: ReturnType<typeof usePersistentAppData>;
}) {
  const {
    commitDataNow,
    data,
    setData,
    hasStoredData,
    loadWarnings,
    restoreDataNow,
    retrySave,
    saveStatus,
    storagePersistence,
  } = persistence;
  const sync = useSupabaseSync(data, setData, hasStoredData);
  // The load-warning banner can be tucked away once Los has seen it. It re-shows
  // only if a NEW set of warnings appears (the signature changes), so it never
  // silently hides a fresh problem.
  const loadWarnSignature = loadWarnings.join('|');
  const [dismissedLoadWarn, setDismissedLoadWarn] = useState<string>(() => {
    try {
      return window.localStorage.getItem('turn-os:loadwarn-dismissed') ?? '';
    } catch {
      return '';
    }
  });
  const dismissLoadWarn = () => {
    setDismissedLoadWarn(loadWarnSignature);
    try {
      window.localStorage.setItem('turn-os:loadwarn-dismissed', loadWarnSignature);
    } catch {
      // Session-only then.
    }
  };
  const [route, setRoute] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).route,
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  // When a unit is opened from a Home queue (Needs Crew, Working, …), Back
  // must return to that queue — not dump Los on the TurnBoard.
  const unitDetailOriginRef = useRef<NonNullable<typeof route.homeSummary> | 'home' | undefined>(undefined);
  // Which trade the user was LOOKING AT when they tapped into a unit — from
  // Home's twin boards or the wall grid. Route-level so remounts can't lose it.
  const unitDetailTradeRef = useRef<'paint' | 'clean' | undefined>(undefined);
  // Return to where Los was scrolled on Home (mid-crew-dropdown) after backing
  // out of a unit, instead of snapping to the top.
  const homeScrollRef = useRef(0);
  const restoreHomeScrollRef = useRef(false);
  // Same rule for crews: opened from Home's "Crews right now" → Back returns
  // to Home, not the Crews tab.
  const crewOriginHomeRef = useRef(false);
  // Context-aware Block Unit: Plus on a unit already knows WHICH unit.
  const [blockDialog, setBlockDialog] = useState<{ unitId?: string } | null>(null);
  // Feedback lands WHERE LOS STANDS — a floating toast on every surface, not
  // a status line only the More tab renders (found dead-button feel in audit).
  const [fieldToast, setFieldToast] = useState('');
  useEffect(() => {
    if (!fieldToast) return undefined;
    const timer = window.setTimeout(() => setFieldToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [fieldToast]);
  const [blockReason, setBlockReason] = useState('');
  const [blockTrade, setBlockTrade] = useState<'paint' | 'clean' | 'both'>('both');
  const [walkRequests, setWalkRequests] = useState<
    { at: string; name: string; units: string[] }[]
  >([]);
  const [captureOpen, setCaptureOpen] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).captureRequested
      || historyRequestsCapture(),
  );
  const [plusOpen, setPlusOpen] = useState(false);
  const [tellOsOpen, setTellOsOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<PeekTarget | null>(null);
  // Tell Turn OS applies several intents in one confirm; TrackC-touching ones
  // must chain off each other's state, not the stale render snapshot.
  const tellOsTrackRef = useRef<TrackCState | null>(null);
  const [plusInitialScreen, setPlusInitialScreen] = useState<'menu' | 'note'>('menu');
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [trackCDialogOpen, setTrackCDialogOpen] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>('day');
  const [demoExplored, setDemoExplored] = useState(false);
  const [dayWorkspaceView, setDayWorkspaceView] = useState('home');
  const [boardSessionActivity, setBoardSessionActivity] = useState<BoardFirstActivityItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<BoardFirstActivityItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [notificationTab, setNotificationTab] = useState<NativeNotificationTab>('all');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem('turn-os:read-notifications');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'turn-os:read-notifications',
        JSON.stringify([...readNotificationIds].slice(-500)),
      );
    } catch {
      // Storage full — read state survives the session only.
    }
  }, [readNotificationIds]);
  const [crewEditor, setCrewEditor] = useState<CrewEditorState>(null);
  const [moreDetailPage, setMoreDetailPage] = useState<MoreDetailPage>(null);
  const [moreStatus, setMoreStatus] = useState(
    'Personal workspace · paper remains authoritative',
  );
  const setupDraftStore = useMemo(
    () => typeof window === 'undefined'
      ? undefined
      : createProjectSetupDraftStore(window.localStorage),
    [],
  );
  const setupDraftOwnerKey = sync.userId
    ?? sync.lastAuthenticatedUserId
    ?? getLocalCacheOwner()
    ?? 'local-unconfigured-device';
  const [initialSetupDraftRecord] = useState(
    () => setupDraftStore?.read(setupDraftOwnerKey),
  );
  const [setupStep, setSetupStep] = useState(
    () => initialSetupDraftRecord?.step ?? 0,
  );
  const [setupDraft, setSetupDraft] = useState<ProjectActivationDraft | null>(() => {
    if (initialSetupDraftRecord) return initialSetupDraftRecord.draft;
    try {
      return createProjectActivationDraft(data, nowISO(), 'Los');
    } catch {
      return null;
    }
  });
  const [setupErrors, setSetupErrors] = useState<readonly string[]>([]);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupStatus, setSetupStatus] = useState(
    initialSetupDraftRecord
      ? 'Your unfinished setup draft was restored from this device.'
      : 'Review and activate this personal project before field use.',
  );
  const setupActivationInFlightRef = useRef(false);
  const setupActivationCommittedRef = useRef(false);
  const saveSetupDraft = useCallback((
    draft: ProjectActivationDraft,
    step: number,
  ) => {
    const saved = setupDraftStore?.write(setupDraftOwnerKey, draft, step) ?? false;
    setSetupStatus(
      saved
        ? 'Draft saved on this device.'
        : 'Draft remains open, but this browser could not autosave it.',
    );
    return saved;
  }, [setupDraftOwnerKey, setupDraftStore]);
  const tabRouteMemoryRef = useRef((() => {
    const initialTab = trackCTabForRoute(route.view);
    const initialMemory = createTrackCTabRouteMemory(TRACK_C_TAB_ROOTS, initialTab);
    const initialRouteKey = buildAppHash(route);
    return initialRouteKey === TRACK_C_TAB_ROOTS[initialTab]
      ? initialMemory
      : rememberTrackCTabRoute(initialMemory, initialTab, initialRouteKey);
  })());
  const transientOriginRef = useRef<TrackCTransientOriginSnapshot | null>(null);
  const [scrollRequestToken, setScrollRequestToken] = useState(0);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<string>();
  const aiAuth = useAiAuth();
  const [aiLoginSkipped, setAiLoginSkipped] = useState(false);
  // Device-local stamp: has today's release proof been submitted to the
  // official Backup Safety Submission Box? (No schema impact — Turn freeze.)
  const [historyDayOffset, setHistoryDayOffset] = useState(0);
  const [releaseProofSnooze, setReleaseProofSnooze] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem('turn-os:release-proof-snooze');
    } catch {
      return null;
    }
  });
  const [releaseProofDate, setReleaseProofDate] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : window.localStorage.getItem('turn-os:release-proof-date')
  ));
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const copilotRef = useRef<CopilotViewHandle | null>(null);
  const commandRequestIdRef = useRef(0);
  const [commandSourceRequest, setCommandSourceRequest] = useState<TurnCommandSourceRequest>();
  const boardCaptureContextRef = useRef<BoardCaptureContext | null>(null);
  const boardCaptureReceiptSequenceRef = useRef(0);
  const boardCaptureReturnFocusRef = useRef<BoardCaptureContext['returnFocus'] | null>(null);
  const launchCaptureReturnFocusIdRef = useRef<string | null>(null);
  const activityReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  const supabaseClient = getSupabaseClient();
  const authAdapter = useMemo(
    () => createSupabaseAuthAdapter(supabaseClient?.auth ?? null),
    [supabaseClient],
  );

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  // While online and idle, pull the PDF chunk into the offline cache so the
  // first Daily Report of the day still generates after a deploy even in a
  // dead zone. Re-runs whenever we regain connectivity (new chunk after deploy).
  useEffect(() => {
    if (!online) return undefined;
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let timer: number | undefined;
    let idle: number | undefined;
    if (idleWindow.requestIdleCallback) {
      idle = idleWindow.requestIdleCallback(() => prewarmDailyReportPdf(), { timeout: 5_000 });
    } else {
      timer = window.setTimeout(() => prewarmDailyReportPdf(), 2_000);
    }
    return () => {
      if (idle !== undefined) idleWindow.cancelIdleCallback?.(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [online]);

  // On-device storage usage, recomputed as data changes, so the Storage screen
  // can warn before the localStorage ceiling is hit mid-Turn.
  const storageUsage = useMemo(() => estimateStorageUsage(), [data]);


  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshClock();
    };
    window.addEventListener('pageshow', refreshClock);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('pageshow', refreshClock);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const launchProjection = useMemo(
    () => projectLaunchAppData(data, now, readNotificationIds),
    [data, now, readNotificationIds],
  );
  const boardRepositoryState = useMemo(() => createLaunchBoardRepository(data), [data]);
  const boardRepository = boardRepositoryState.repository;
  const fieldOpsRouteActive = (
    (route.view === 'units' && route.unitStatusFilter === 'All')
    || (
      route.view === 'unitDetail'
      && route.unitSurface !== 'personal'
    )
    || route.view === 'crews'
    || route.view === 'assignments'
    || route.fieldWorkflow === 'walk'
  );
  const boardRouteActive = route.view === 'activity'
    ;

  const operationalRepositories = useMemo(
    () => createInMemoryOperationalMemoryRepositories(),
    [],
  );
  const operationalScope = useMemo(() => ({
    accountId: sync.userId
      ?? sync.lastAuthenticatedUserId
      ?? getLocalCacheOwner()
      ?? 'local-unconfigured-device',
    projectId: data.activeProjectId,
  }), [data.activeProjectId, sync.lastAuthenticatedUserId, sync.userId]);
  const theme = useTurnTheme(operationalScope.accountId);
  const currentDate = useMemo(() => currentLocalDate(now), [now]);
  const propertyRoster = useMemo(() => projectPropertyRoster(data), [data]);
  const dailyReleases = useMemo(() => projectDailyReleases(data), [data]);
  const daySessions = useMemo(
    () => projectDaySessions(data, operationalScope.accountId),
    [data, operationalScope.accountId],
  );
  const dayEvents = useMemo(() => projectDayEvents(data), [data]);
  const activeDaySession = useMemo(
    () => [...daySessions]
      .filter((session) => ['active', 'ending', 'reopened'].includes(session.status))
      .sort((left, right) => (right.startedAt ?? '').localeCompare(left.startedAt ?? ''))
      .slice(0, 1)[0],
    [daySessions],
  );
  const todayTask = useMemo(
    () => projectTodayTask(data, activeDaySession),
    [activeDaySession, data],
  );
  const trackCState = useMemo(() => projectTrackCState(data), [data]);
  // Home glance: who's working what right now, and the property at a glance —
  // Los reads this between walks without tapping into queues.
  // THE LIVE BOARD: every unit-trade in play, organized by unit like the
  // wall. One card = unit + trade + crew + stage; tapping the stage advances
  // the whole trade (crew done → Los passed) with the existing section ops.
  const liveBoard = useMemo(() => {
    const lines: {
      unitId: string;
      unitNumber: string;
      trade: 'paint' | 'clean';
      crewNames: string[];
      stage: 'needs-crew' | 'working' | 'crew-done' | 'passed' | 'callback';
      done: number;
      total: number;
      rooms: string[];
      callbackRooms: string[];
      passedAgo?: string;
      noCrewOnRoster?: boolean;
      workLabel?: string;
    }[] = [];
    const today = localEventDate(new Date().toISOString());
    for (const unit of trackCState.units) {
      for (const trade of ['paint', 'clean'] as const) {
        const work = projectTrackCUnitWork(trackCState, unit.id).filter((item) =>
          item.trade === trade
          && item.release === 'released'
          && item.access === 'clear'
          && item.property !== 'property-accepted');
        if (work.length === 0) continue;
        const crewNames = [...new Set(work
          .flatMap((item) => item.activeCrewIds)
          .map((crewId) => trackCCrewName(trackCState, crewId))
          .filter((name): name is string => Boolean(name)))];
        const hasCallback = work.some((item) => item.callbackOpen);
        const allPassed = work.every((item) => item.inspection === 'los-passed');
        const donePlus = work.filter((item) =>
          item.execution === 'crew-reported-complete'
          || item.inspection === 'los-passed').length;
        const anyActive = work.some((item) =>
          ['assigned', 'working'].includes(item.execution));
        const stage = hasCallback
          ? 'callback' as const
          : allPassed
            ? 'passed' as const
            : donePlus === work.length
              ? 'crew-done' as const
              : anyActive || crewNames.length > 0
                ? 'working' as const
                : 'needs-crew' as const;
        let passedAgo: string | undefined;
        if (stage === 'passed') {
          const latest = trackCState.events
            .filter((event) =>
              event.eventType === 'los-passed'
              && event.target.unitId === unit.id
              && event.target.trade === trade)
            .reduce((max, event) =>
              event.recordedAt > max ? event.recordedAt : max, '');
          if (latest) {
            const day = localEventDate(latest);
            passedAgo = day === today ? 'today' : day === localEventDate(new Date(Date.now() - 86_400_000).toISOString()) ? 'yesterday' : new Date(latest).toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
        }
        // The actual rooms in play (Common · A · B …) so Home shows what's in
        // the unit, not an abstract "5/5 sections".
        const rooms = work
          .map((item) => item.section)
          .sort((left, right) =>
            left === 'common' ? -1 : right === 'common' ? 1 : left.localeCompare(right))
          .map((section) => (section === 'common' ? 'Com' : section));
        // The specific rooms in callback — so Home names the room to go fix.
        const callbackRooms = work
          .filter((item) => item.callbackOpen)
          .map((item) => item.section)
          .sort((left, right) =>
            left === 'common' ? -1 : right === 'common' ? 1 : left.localeCompare(right))
          .map((section) => (section === 'common' ? 'Com' : section));
        lines.push({
          crewNames,
          workLabel: trackCTradeWorkTypeLabel(trackCState, unit.id, trade),
          done: donePlus,
          rooms,
          callbackRooms,
          stage,
          total: work.length,
          trade,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          passedAgo,
          noCrewOnRoster: stage === 'needs-crew'
            && !trackCState.crews.some((crew) => crew.trade === trade),
        });
      }
    }
    return lines.sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true })
      || left.trade.localeCompare(right.trade));
  }, [trackCState]);
  const advanceUnitTrade = useCallback((unitId: string, trade: 'paint' | 'clean') => {
    // One tap moves the whole trade forward: crew reports done, then Los
    // passes — always through the existing section operations (undo intact).
    let nextState = trackCState;
    const work = projectTrackCUnitWork(trackCState, unitId).filter((item) =>
      item.trade === trade
      && item.release === 'released'
      && item.access === 'clear'
      && !item.callbackOpen
      && item.property !== 'property-accepted');
    const pending = work.filter((item) =>
      ['assigned', 'working'].includes(item.execution));
    const targets = pending.length > 0
      ? { action: 'record-crew-complete' as const, items: pending }
      : {
        action: 'record-los-pass' as const,
        items: work.filter((item) => item.inspection === 'needs-los-inspection'),
      };
    if (targets.items.length === 0) return;
    for (const item of targets.items) {
      const result = applyTrackCSectionAction(nextState, {
        action: targets.action,
        eventId: createId(`live-board-${targets.action}`),
        recordedAt: nowISO(),
        recordedBy: 'Los',
        target: { section: item.section, trade: item.trade, unitId: item.unitId },
      });
      if (!result.ok) return;
      nextState = result.value;
    }
    commitDataNow((current) => applyTrackCStateChange(current, nextState));
  }, [commitDataNow, trackCState]);
  const homeGlance = useMemo(() => {
    // These numbers must MATCH the queues below them: blocked units live in
    // Waiting (not "released"), finished units are "approved", and "working"
    // means a crew is actually on it right now.
    let released = 0;
    let working = 0;
    let approved = 0;
    let readyToWalk = 0;
    let unassigned = 0;
    for (const unit of trackCState.units) {
      const work = projectTrackCUnitWork(trackCState, unit.id)
        .filter((item) => item.release === 'released');
      if (work.length === 0) continue;
      if (work.every((item) => item.property === 'property-accepted')) {
        approved += 1;
        continue;
      }
      const inPlay = work.filter((item) =>
        item.access === 'clear' && item.property !== 'property-accepted');
      if (inPlay.length === 0) continue;
      released += 1;
      if (inPlay.some((item) => item.inspection === 'los-passed')) readyToWalk += 1;
      if (inPlay.every((item) => item.activeCrewIds.length === 0)) unassigned += 1;
      // Working = a crew is IN there right now. Crew-done-awaiting-Los and
      // passed-awaiting-walk are their own queues, not "working" — this must
      // agree with the portal's In progress count.
      if (inPlay.some((item) =>
        ['assigned', 'working'].includes(item.execution))) {
        working += 1;
      }
    }
    return { approved, left: trackCState.units.length - approved, readyToWalk, released, unassigned, working };
  }, [trackCState]);
  // "Needs your eyes" — the silent-failure detector. On a heavy day the danger
  // isn't what's in front of Los; it's what quietly stalled. Two classes:
  // blocked work (the ladder/occupied situations to escalate) and carryover
  // (work released on a PRIOR day that still has no crew — the stuff that falls
  // through the cracks when the pile is big). Read-only; empty when all clear.
  const needsEyes = useMemo(() => {
    const releaseDate = new Map<string, string>();
    for (const batch of data.dailyReleaseBatches) {
      if (batch.projectId !== data.activeProjectId) continue;
      for (const item of batch.items) {
        const key = `${item.unitId}:${item.trade}`;
        const prior = releaseDate.get(key);
        if (!prior || batch.date < prior) releaseDate.set(key, batch.date);
      }
    }
    const blocked: { unitId: string; unitNumber: string; trade: 'paint' | 'clean'; label: string }[] = [];
    const carryover: { unitId: string; unitNumber: string; trade: 'paint' | 'clean'; label: string }[] = [];
    for (const unit of trackCState.units) {
      const work = projectTrackCUnitWork(trackCState, unit.id);
      for (const trade of ['paint', 'clean'] as const) {
        const released = work.filter((item) =>
          item.trade === trade && item.release === 'released');
        if (released.length === 0) continue;
        const tradeWord = trade === 'paint' ? 'Paint' : 'Clean';
        if (released.some((item) => item.access !== 'clear')) {
          const reason = (released.find((item) => item.access !== 'clear')?.restrictionLabel ?? '')
            .replace(/^Blocked — /u, '') || 'on hold';
          blocked.push({ label: `${tradeWord} blocked — ${reason}`, trade, unitId: unit.id, unitNumber: unit.unitNumber });
          continue;
        }
        const firstReleased = releaseDate.get(`${unit.id}:${trade}`);
        const stillNoCrew = released.every((item) =>
          item.activeCrewIds.length === 0
          && item.execution === 'unassigned'
          && item.property !== 'property-accepted');
        if (firstReleased && firstReleased < currentDate && stillNoCrew) {
          const [, m, d] = firstReleased.split('-').map(Number);
          const when = new Date(2000, (m ?? 1) - 1, d ?? 1)
            .toLocaleDateString([], { month: 'short', day: 'numeric' });
          carryover.push({ label: `${tradeWord} released ${when} — still no crew`, trade, unitId: unit.id, unitNumber: unit.unitNumber });
        }
      }
    }
    return { blocked, carryover };
  }, [currentDate, data.activeProjectId, data.dailyReleaseBatches, trackCState]);
  const unitNotes = useMemo(() =>
    data.activityLogs
      .filter((log) => log.action === PERSONAL_NOTE_ACTIVITY_ACTION
        && log.entityType === 'Unit'
        && log.projectId === data.activeProjectId
        && Boolean(log.note))
      .map((log) => ({
        createdAt: log.createdAt,
        id: log.id,
        text: log.note ?? '',
        unitId: log.entityId,
      })),
    [data.activityLogs, data.activeProjectId]);
  const releaseWorkTypes = useMemo(() => {
    const map: Record<string, 'full' | 'touch-up' | 'cut-in' | 'full-cut-in'> = {};
    for (const unit of trackCState.units) {
      for (const fact of unit.workFacts) {
        if (fact.release !== 'released' || !fact.workType) continue;
        map[`${unit.id}:${fact.trade}:${fact.section}`] = fact.workType;
      }
    }
    return map;
  }, [trackCState]);
  const acceptedWalkMeta = useMemo(() => {
    const meta: Record<string, { at?: string; contact: string }> = {};
    for (const walk of trackCState.completedWalks) {
      for (const outcome of walk.outcomes ?? []) {
        if (outcome.outcome !== 'accepted') continue;
        meta[outcome.target.unitId] = {
          at: walk.endedAt,
          contact: walk.startedBy && walk.propertyContact
            ? walk.propertyContact
            : walk.propertyContact ?? 'the property',
        };
      }
    }
    return meta;
  }, [trackCState.completedWalks]);
  const doneUnitIds = useMemo(() => new Set(
    trackCState.units
      .filter((unit) => {
        const released = unit.workFacts.filter((fact) => fact.release === 'released');
        if (released.length === 0) return false;
        return released.every((fact) => {
          const work = projectTrackCWork(trackCState, {
            section: fact.section,
            trade: fact.trade,
            unitId: fact.unitId,
          });
          return work?.property === 'property-accepted';
        });
      })
      .map((unit) => unit.id),
  ), [trackCState]);
  const trackCWalkDraft = useMemo(
    () => projectTrackCWalkDraft(data),
    [data],
  );
  const activeProject = useMemo(
    () => data.projects.find((project) => project.id === data.activeProjectId),
    [data.activeProjectId, data.projects],
  );
  const activeProjectContacts = useMemo(
    () => (data.propertyContacts ?? []).filter(
      (contact) => contact.projectId === data.activeProjectId,
    ),
    [data.activeProjectId, data.propertyContacts],
  );
  const startDayResolution = useMemo<{
    error?: string;
    values?: StartDayResolvedValues;
  }>(() => {
    if (!activeProject?.fieldConfiguration) {
      return { error: 'Activate the personal project setup before using saved Start Day defaults.' };
    }
    try {
      return {
        values: resolveStartDayValues(
          activeProject.fieldConfiguration,
          activeProjectContacts,
        ),
      };
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : 'Saved Start Day defaults are unavailable.',
      };
    }
  }, [activeProject?.fieldConfiguration, activeProjectContacts]);
  const startDayPrefill = useMemo<StartDayPrefill | undefined>(() => {
    const values = startDayResolution.values;
    if (!values) return undefined;
    return {
      activeCrewIdsByTrade: {
        Clean: values.activeCrewIdsByTrade.Clean.value,
        Paint: values.activeCrewIdsByTrade.Paint.value,
      },
      propertyContact: values.propertyContact.value.name,
      walkthroughScheduleWording: values.walkthroughScheduleWording.value,
      workingHoursWording: values.workingHoursWording.value,
    };
  }, [startDayResolution.values]);
  const canonicalProjectionResult = useMemo<{
    error?: string;
    projection?: CanonicalFieldProjection;
  }>(() => {
    try {
      return {
        projection: buildCanonicalFieldProjectionFromAppData(
          data,
          operationalScope.accountId,
        ),
      };
    } catch (error) {
      return {
        error: error instanceof Error
          ? error.message
          : 'The canonical field projection is unavailable.',
      };
    }
  }, [data, operationalScope.accountId]);
  const canonicalConsumers = useMemo(
    () => canonicalProjectionResult.projection
      ? projectCanonicalFieldConsumers(
        canonicalProjectionResult.projection,
        readNotificationIds,
      )
      : undefined,
    [canonicalProjectionResult.projection, readNotificationIds],
  );
  // Current Work must show what is STILL OWED across the whole Turn — released
  // but unfinished work carries over from previous days (a unit whose paint was
  // released Day 1 stays in Needs Crew on Day 2). Counts are at Unit+Trade
  // grain to match every other list Los reads.
  const boardQueueCounts = useMemo(() => {
    const projection = canonicalProjectionResult.projection;
    if (!projection) return undefined;
    const unitTradeCount = (records: readonly { target: { unitId: string }; trade: string }[]) =>
      new Set(records.map((record) => `${record.target.unitId}:${record.trade}`)).size;
    return {
      callbacks: unitTradeCount(projection.queues.callbacks),
      'needs-crew': unitTradeCount(projection.queues['needs-crew']),
      'needs-inspection': unitTradeCount(projection.queues['needs-inspection']),
      'ready-to-walk': unitTradeCount(projection.queues['ready-to-walk']),
      waiting: unitTradeCount(projection.queues.waiting),
      working: unitTradeCount(projection.queues.working),
    };
  }, [canonicalProjectionResult.projection]);
  const requiresCanonicalPersonalProjection = Boolean(activeProject?.fieldConfiguration);
  const activeFieldState = canonicalProjectionResult.projection?.trackCState
    ?? (requiresCanonicalPersonalProjection ? undefined : trackCState);
  const trackCRouteState = useMemo<TrackCRouteState>(() => {
    if (route.fieldWorkflow === 'walk') {
      return {
        view: 'walk',
        walkSessionId: route.walkSessionId,
      };
    }
    if (route.view === 'assignments') return { view: 'assign' };
    if (route.view === 'crews') {
      return { crewId: route.crewId, view: 'crews' };
    }
    return {
      unitId: route.view === 'unitDetail' ? route.unitId : undefined,
      unitTrade: route.view === 'unitDetail' ? unitDetailTradeRef.current : undefined,
      view: 'board',
    };
  }, [
    route.crewId,
    route.fieldWorkflow,
    route.unitId,
    route.view,
    route.walkSessionId,
  ]);
  const invalidFieldRouteMessage = useMemo(() => {
    if (!fieldOpsRouteActive) return undefined;
    if (!activeFieldState) {
      return canonicalProjectionResult.error
        ?? 'The active personal-project field state is unavailable.';
    }
    if (
      route.view === 'unitDetail'
      && (!route.unitId || !activeFieldState.units.some((unit) => unit.id === route.unitId))
    ) {
      return 'This Unit is not present in the active personal project.';
    }
    if (
      route.view === 'crews'
      && route.crewId
      && !activeFieldState.crews.some((crew) => crew.id === route.crewId)
    ) {
      return 'This crew record is no longer present in the active personal project.';
    }
    if (
      route.fieldWorkflow === 'walk'
      && route.walkSessionId
      && activeFieldState.activeWalk?.id !== route.walkSessionId
    ) {
      return 'This active Walk Session is no longer available.';
    }
    return undefined;
  }, [
    activeFieldState,
    canonicalProjectionResult.error,
    fieldOpsRouteActive,
    route.crewId,
    route.fieldWorkflow,
    route.unitId,
    route.view,
    route.walkSessionId,
  ]);

  useEffect(() => {
    if (
      route.fieldWorkflow !== 'walk'
      || route.walkSessionId
      || !activeFieldState?.activeWalk
    ) return;

    const nextRoute = routeForNavigation('units', undefined, {
      fieldWorkflow: 'walk',
      walkSessionId: activeFieldState.activeWalk.id,
    });
    window.history.replaceState(null, '', buildAppHash(nextRoute));
    setRoute(nextRoute);
  }, [
    activeFieldState?.activeWalk,
    route.fieldWorkflow,
    route.walkSessionId,
  ]);
  const operationalSource = useMemo(
    () => createAppDataOperationalReadSource(operationalScope, data),
    [data, operationalScope],
  );
  const unitNumberById = useMemo(
    () => new Map(launchProjection.commandUnits.map((unit) => [unit.unitId, unit.unitNumber])),
    [launchProjection.commandUnits],
  );
  const persistedActivity = useMemo(() => {
    const contextualTitle = (activity: {
      section?: string;
      title: string;
      trade?: string;
      unitId?: string;
    }) => {
      const unitNumber = activity.unitId
        ? unitNumberById.get(activity.unitId)
        : undefined;
      if (!unitNumber) return activity.title;
      const trade = activity.trade === 'paint'
        ? 'Paint'
        : activity.trade === 'clean'
          ? 'Clean'
          : undefined;
      const section = activity.section
        ? activity.section === 'common' ? 'Common' : activity.section.toUpperCase()
        : undefined;
      const scope = [trade, section].filter(Boolean).join(' ');
      return `Unit ${unitNumber}${scope ? ` · ${scope}` : ''} — ${activity.title}`;
    };
    const legacyItems = operationalSource.ok
      ? listOperationalActivity(
          operationalScope,
          operationalRepositories,
          operationalSource.source,
        ).map((activity): BoardFirstActivityItem => ({
          id: activity.id,
          kind: boardActivityKind(activity),
          recordedAt: activity.recordedAt,
          sourceLabel: activity.sourceRefs[0]?.label ?? 'Personal operational memory',
          synthetic: launchProjection.project?.mode === 'demo',
          title: contextualTitle(activity),
          wording: activity.wording,
          unitId: activity.unitId,
          unitNumber: activity.unitId ? unitNumberById.get(activity.unitId) : undefined,
        }))
      : launchProjection.activityItems;
    const sectionDisplay = (section: string) =>
      section === 'common' ? 'Common' : section.toUpperCase();
    const canonicalItems = groupFieldActivityBursts(
      canonicalProjectionResult.projection?.activity ?? [],
    ).map((activity): BoardFirstActivityItem => ({
      id: activity.id,
      kind: boardActivityKind(activity),
      recordedAt: activity.recordedAt,
      sourceLabel: activity.sourceRefs[0]?.label ?? 'Personal operational memory',
      synthetic: launchProjection.project?.mode === 'demo',
      title: contextualTitle(activity),
      wording: activity.groupedCount > 1
        ? `${activity.groupedSections.map(sectionDisplay).join(', ')} — ${activity.groupedCount} sections in one update.`
        : activity.wording,
      unitId: activity.unitId,
      unitNumber: activity.unitId ? unitNumberById.get(activity.unitId) : undefined,
    }));
    const selectedItems = canonicalProjectionResult.projection
      ? canonicalItems
      : requiresCanonicalPersonalProjection
        ? []
        : legacyItems;
    return [...new Map(
      selectedItems.map((item) => [item.id, item]),
    ).values()].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  }, [
    canonicalProjectionResult.projection,
    launchProjection.activityItems,
    launchProjection.project?.mode,
    operationalRepositories,
    operationalScope,
    operationalSource,
    requiresCanonicalPersonalProjection,
    unitNumberById,
  ]);
  const boardActivity = useMemo(
    () => [...persistedActivity, ...boardSessionActivity],
    [boardSessionActivity, persistedActivity],
  );
  const noteSearchResults = useMemo<NativeSearchResult[]>(() => {
    const unitNumberById = new Map(data.units.map((unit) => [unit.id, unit.unitNumber]));
    return data.activityLogs
      .filter((entry) =>
        entry.projectId === data.activeProjectId
        && entry.action === 'Added personal note')
      .slice(0, 200)
      .map((entry) => {
        const unitNumber = entry.entityType === 'Unit'
          ? unitNumberById.get(entry.entityId)
          : undefined;
        return {
          destinationId: entry.entityType === 'Unit' ? `unit:${entry.entityId}` : 'activity',
          id: `note:${entry.id}`,
          keywords: ['note', ...(unitNumber ? [unitNumber] : [])],
          meta: `Note${unitNumber ? ` · Unit ${unitNumber}` : ''}`,
          title: entry.note.length > 80 ? `${entry.note.slice(0, 80)}…` : entry.note,
        };
      });
  }, [data.activeProjectId, data.activityLogs, data.units]);
  const nativeSearchGroups = useMemo<NativeSearchGroup[]>(() => {
    // Personal notes always ride the activity group so Search finds them.
    const withNotes = (groups: NativeSearchGroup[]): NativeSearchGroup[] => {
      if (noteSearchResults.length === 0) return groups;
      const activity = groups.find((group) => group.id === 'activity');
      if (!activity) {
        return [...groups, { id: 'activity', results: noteSearchResults }];
      }
      const known = new Set(activity.results.map((result) => result.id));
      return groups.map((group) => group.id !== 'activity' ? group : {
        ...group,
        results: [
          ...noteSearchResults.filter((result) => !known.has(result.id)),
          ...group.results,
        ],
      });
    };
    if (canonicalConsumers) {
      return withNotes(canonicalConsumers.searchGroups.map((group) => ({
        ...group,
        results: group.results.map((result) => ({ ...result })),
      })));
    }
    if (requiresCanonicalPersonalProjection) return withNotes([]);
    const groupIds = {
      crews: 'crews',
      'notes-activity': 'activity',
      units: 'units',
    } as const;
    return withNotes(launchProjection.searchGroups.flatMap((group) => {
      const id = groupIds[group.id as keyof typeof groupIds];
      if (!id) return [];
      return [{
        id,
        results: group.results.map((result) => ({ ...result })),
      }];
    }));
  }, [
    canonicalConsumers,
    launchProjection.searchGroups,
    noteSearchResults,
    requiresCanonicalPersonalProjection,
  ]);
  const nativeNotifications = useMemo<NativeNotificationItem[]>(
    () => canonicalConsumers
      ? canonicalConsumers.notifications.map((item) => ({ ...item }))
      : requiresCanonicalPersonalProjection
        ? []
        : launchProjection.notifications.map((item) => ({
          category: item.category,
          destinationId: item.destinationId,
          destinationLabel: item.destinationLabel,
          group: item.group,
          id: item.id,
          read: item.read,
          reason: item.reason,
          timeLabel: item.timeLabel,
          title: item.unitLabel,
        })),
    [
      canonicalConsumers,
      launchProjection.notifications,
      requiresCanonicalPersonalProjection,
    ],
  );
  const crewRecords = useMemo<TrackBCrewRecord[]>(
    () => data.crewMembers
      .filter((crew) =>
        (!crew.projectId || crew.projectId === data.activeProjectId)
        && (crew.trade === 'Painter' || crew.trade === 'Cleaner')
      )
      .map((crew): TrackBCrewRecord => ({
        activeToday: crew.active,
        id: crew.id,
        name: crew.name,
        phone: crew.phone || undefined,
        trade: crew.trade === 'Painter' ? 'Paint' : 'Clean',
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [data.activeProjectId, data.crewMembers],
  );
  const dayCrewOptions = useMemo<TrackBCrewOption[]>(
    () => crewRecords.map((crew) => ({
      activeToday: crew.activeToday,
      id: crew.id,
      name: crew.name,
      trade: crew.trade,
    })),
    [crewRecords],
  );
  const fastStartDayCrewOptions = useMemo<TrackACrewOption[]>(
    () => crewRecords.map((crew) => ({
      active: crew.activeToday,
      id: crew.id,
      name: crew.name,
      trade: crew.trade === 'Paint' ? 'paint' : 'clean',
    })),
    [crewRecords],
  );
  const fastStartDayRosterUnits = useMemo<ProjectRosterUnitOption[]>(
    () => propertyRoster.units.map((unit) => ({
      applicableSections: unit.applicableSections.map((section) =>
        toFastStartDaySection(section.id)),
      building: unit.building,
      floor: unit.floor,
      id: unit.id,
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
    })),
    [propertyRoster.units],
  );
  const selectedActivityView = useMemo<PersonalActivityViewModel | null>(() => {
    if (!selectedActivity) return null;
    const entityType: ActivityLog['entityType'] = selectedActivity.unitId ? 'Unit' : 'Project';
    return {
      activity: {
        action: selectedActivity.title,
        createdAt: selectedActivity.recordedAt,
        entityId: selectedActivity.unitId ?? data.activeProjectId,
        entityType,
        id: `inspect:${selectedActivity.id}`,
        note: selectedActivity.wording,
        projectId: data.activeProjectId,
      },
      projectLabel: launchProjection.propertyName,
      unitId: selectedActivity.unitId,
      unitNumber: selectedActivity.unitNumber,
    };
  }, [
    data.activeProjectId,
    launchProjection.propertyName,
    selectedActivity,
  ]);
  const reportCounts = useMemo<TrackBReportCounts>(() => {
    const canonical = canonicalProjectionResult.projection;
    if (canonical) {
      return {
        activityCount: canonical.counts.activity,
        callbacksFound: canonical.counts.callbacks,
        callbacksResolved: 0,
        readyToWalk: canonical.counts.ready,
        sectionsInspected: canonical.todayTask.progress.actual,
        unitsTouched: canonical.counts.unitsTouched,
        waiting: canonical.counts.waiting,
        working: canonical.counts.working,
      };
    }
    return {
      activityCount: boardActivity.length,
      callbacksFound: launchProjection.counts.callbacks,
      callbacksResolved: 0,
      readyToWalk: launchProjection.counts.readyToWalk,
      sectionsInspected: boardActivity.filter(
        (item) => item.kind === 'los-inspection' && Boolean(item.section),
      ).length,
      unitsTouched: new Set(
        boardActivity.flatMap((item) => item.unitId ? [item.unitId] : []),
      ).size,
      waiting: launchProjection.counts.blocked,
      working: launchProjection.counts.working,
    };
  }, [boardActivity, canonicalProjectionResult.projection, launchProjection.counts]);
  const backupStatus = useMemo<TrackBDataStatus>(() => {
    if (saveStatus.state === 'failed') {
      return {
        detail: 'The latest local write failed. Keep the app open and use the guarded retry or backup controls.',
        label: 'Needs attention',
        tone: 'attention',
      };
    }
    if (saveStatus.state === 'pending') {
      return {
        detail: 'A local device save is still pending.',
        label: 'Saving',
        tone: 'unknown',
      };
    }
    return {
      detail: 'The latest personal-app state is saved on this device.',
      label: 'Saved locally',
      tone: 'ready',
    };
  }, [saveStatus.state]);
  const syncStatus = useMemo<TrackBDataStatus>(() => {
    if (sync.status === 'error' || sync.status === 'cache_transition_required') {
      return {
        detail: sync.message,
        label: 'Needs attention',
        tone: 'attention',
      };
    }
    if (sync.status === 'synced') {
      return {
        detail: sync.message,
        label: 'Synced',
        tone: 'ready',
      };
    }
    return {
      detail: sync.message || 'Optional account sync is not active.',
      label: sync.status.replaceAll('_', ' '),
      tone: 'unknown',
    };
  }, [sync.message, sync.status]);
  const routeUnitNumber = route.unitId
    ? launchProjection.commandUnits.find((unit) => unit.unitId === route.unitId)?.unitNumber
    : undefined;
  const contentTitle = route.view === 'dashboard' && route.homeSummary === 'today-task'
    ? 'Today’s Task'
    : contentTitleForRoute(route.view, routeUnitNumber);

  useEffect(() => {
    document.title = `${contentTitle} · Turn OS`;
  }, [contentTitle]);

  const rememberRouteInTab = useCallback((
    nextRoute: typeof route,
    historyMode: 'push' | 'replace' = 'push',
  ) => {
    const tab = trackCTabForRoute(nextRoute.view);
    let memory = tabRouteMemoryRef.current;
    if (memory.activeTab !== tab) {
      memory = selectTrackCPrimaryTab(memory, tab).state;
    }
    memory = rememberTrackCTabRoute(
      memory,
      tab,
      buildAppHash(nextRoute),
      { historyMode },
    );
    tabRouteMemoryRef.current = memory;
    setScrollRequestToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const handleRouteChange = () => {
      const nextLocation = resolveAppHash(window.location.hash);
      if (nextLocation.captureRequested) {
        window.history.replaceState(
          { ...readHistoryState(), [LEGACY_CAPTURE_HISTORY_KEY]: true },
          '',
          buildAppHash(nextLocation.route),
        );
      }
      setCaptureOpen(nextLocation.captureRequested || historyRequestsCapture());
      setRoute(nextLocation.route);
      if (nextLocation.route.view !== 'crews') setCrewEditor(null);
      if (nextLocation.route.view !== 'more') setMoreDetailPage(null);
      if (nextLocation.route.view !== 'dashboard') setHomeMode('day');
      if (
        nextLocation.route.view !== 'search'
        && nextLocation.route.view !== 'notifications'
      ) {
        rememberRouteInTab(nextLocation.route, 'replace');
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    handleRouteChange();
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [rememberRouteInTab]);

  const navigate = useCallback<AppNavigate>((view, unitId, options) => {
    if (view === 'copilot') {
      launchCaptureReturnFocusIdRef.current = 'lcc-central-plus';
      setCaptureOpen(true);
      copilotRef.current?.openDefaultCapture();
      return;
    }

    clearLegacyCaptureHistoryState();
    setPlusOpen(false);
    setSelectedActivity(null);
    activityReturnFocusRef.current = null;
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    launchCaptureReturnFocusIdRef.current = null;
    setCaptureOpen(false);
    if (view !== 'crews') setCrewEditor(null);
    if (view !== 'more') setMoreDetailPage(null);
    if (view !== 'dashboard') setHomeMode('day');

    const nextRoute = routeForNavigation(view, unitId, options);
    const nextHash = buildAppHash(nextRoute);
    rememberRouteInTab(nextRoute);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
    setRoute(nextRoute);
    if (restoreHomeScrollRef.current && nextRoute.view === 'dashboard') {
      restoreHomeScrollRef.current = false;
      const y = homeScrollRef.current;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => window.scrollTo(0, y)));
    } else {
      window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
    }
  }, [rememberRouteInTab]);

  const openFullPage = useCallback((view: 'search' | 'notifications') => {
    transientOriginRef.current = captureTrackCTransientOrigin(
      tabRouteMemoryRef.current,
      view,
    );
    const nextRoute = routeForNavigation(view);
    const nextHash = buildAppHash(nextRoute);
    const originHash = buildAppHash(route);
    window.history.pushState(
      { ...readHistoryState(), [FULL_PAGE_RETURN_HISTORY_KEY]: originHash },
      '',
      nextHash,
    );
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  const closeFullPage = useCallback(() => {
    const snapshot = transientOriginRef.current;
    if (snapshot) {
      const restored = restoreTrackCTransientOrigin(
        tabRouteMemoryRef.current,
        snapshot,
      );
      tabRouteMemoryRef.current = restored.state;
      transientOriginRef.current = null;
      setScrollRequestToken((token) => token + 1);
    }
    const originHash = readHistoryState()[FULL_PAGE_RETURN_HISTORY_KEY];
    if (typeof originHash === 'string' && originHash.startsWith('#/')) {
      window.history.back();
      return;
    }
    const fallback = routeForNavigation('dashboard');
    const fallbackHash = buildAppHash(fallback);
    window.history.replaceState(null, '', fallbackHash);
    setRoute(fallback);
  }, []);

  const closeCapture = useCallback(() => {
    const boardReturnFocus = boardCaptureReturnFocusRef.current;
    const launchReturnFocusId = launchCaptureReturnFocusIdRef.current;
    clearLegacyCaptureHistoryState();
    setCaptureOpen(false);
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    launchCaptureReturnFocusIdRef.current = null;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (boardReturnFocus && focusVisibleElementById(boardReturnFocus.triggerId)) return;
        if (launchReturnFocusId && focusVisibleElementById(launchReturnFocusId)) return;
        focusVisibleElementById('lcc-central-plus');
      });
    });
  }, []);

  const openBoardCapture = useCallback((request: BoardFirstCaptureRequest) => {
    if (!copilotRef.current) {
      return {
        accepted: false as const,
        message: 'Capture is not ready. Nothing was handed off or saved.',
      };
    }
    boardCaptureContextRef.current = request;
    boardCaptureReturnFocusRef.current = request.returnFocus;
    launchCaptureReturnFocusIdRef.current = null;
    setCaptureOpen(true);
    if (request.kind === 'voice') copilotRef.current.openVoiceSource();
    else copilotRef.current.openDefaultCapture();
    return {
      accepted: true as const,
      receiptId: `host-open:${request.requestId}`,
      message: 'Capture opened and accepted the handoff. Nothing has been saved yet.',
    };
  }, []);

  const submitBoardAssistant = useCallback((request: BoardFirstAssistantRequest) => {
    if (!copilotRef.current) return;
    boardCaptureContextRef.current = request;
    boardCaptureReturnFocusRef.current = request.returnFocus;
    launchCaptureReturnFocusIdRef.current = null;
    commandRequestIdRef.current += 1;
    const commandRequest = {
      id: commandRequestIdRef.current,
      sourceText: request.sourceText,
    };
    copilotRef.current.openDefaultCapture();
    setCommandSourceRequest(commandRequest);
    setCaptureOpen(true);
  }, []);

  const mirrorCompletedBoardCapture = useCallback((receipt: CaptureResultReceipt) => {
    const context = boardCaptureContextRef.current;
    if (!context) return;
    boardCaptureReceiptSequenceRef.current += 1;
    const voiceCapture = 'kind' in context && context.kind === 'voice';
    const kind: BoardFirstActivityItem['kind'] =
      receipt.destinationKind === 'daily_log'
        ? 'note'
        : voiceCapture
          ? 'transcript'
          : 'capture-receipt';
    const item: BoardFirstActivityItem = {
      id: `host-capture-result:${boardCaptureReceiptSequenceRef.current}`,
      kind,
      nonpersisted: true,
      receiptId: `capture-result:${boardCaptureReceiptSequenceRef.current}`,
      recordedAt: new Date().toISOString(),
      section: 'section' in context ? context.section : undefined,
      sourceLabel: 'Capture result mirror · session-only and nonpersisted',
      synthetic: launchProjection.project?.mode === 'demo',
      title: receipt.headline,
      trade: context.trade,
      unitId: context.unitId,
      unitNumber: context.unitNumber,
      wording: receipt.sourceText,
    };
    setBoardSessionActivity((current) => (
      current.some((candidate) => candidate.id === item.id)
        ? current
        : [...current, item]
    ));
  }, [launchProjection.project?.mode]);

  const openDestination = useCallback((destinationId: string) => {
    if (destinationId.startsWith('unit:')) {
      // Unit ids are colon-composite (project:building:floor:unit), so the
      // trade suffix must be stripped from the END — splitting on the first
      // colon truncated the id to garbage and broke every "ready to walk" tap.
      let unitId = destinationId.slice('unit:'.length);
      unitDetailTradeRef.current = undefined;
      if (unitId.endsWith(':paint')) {
        unitDetailTradeRef.current = 'paint';
        unitId = unitId.slice(0, -':paint'.length);
      } else if (unitId.endsWith(':clean')) {
        unitDetailTradeRef.current = 'clean';
        unitId = unitId.slice(0, -':clean'.length);
      }
      unitDetailOriginRef.current =
        routeRef.current.view === 'dashboard'
          ? routeRef.current.homeSummary ?? 'home'
          : undefined;
      navigate('unitDetail', unitId);
      return;
    }
    if (destinationId.startsWith('issue:')) {
      navigate('issues', undefined, { issueId: destinationId.slice('issue:'.length) });
      return;
    }
    if (destinationId === 'crews') {
      navigate('crews');
      return;
    }
    if (destinationId.startsWith('crew:')) {
      navigate('crews', undefined, {
        crewId: destinationId.slice('crew:'.length),
      });
      return;
    }
    if (destinationId === 'activity') {
      navigate('activity');
      return;
    }
    if (destinationId === 'walk') {
      navigate('units', undefined, { fieldWorkflow: 'walk' });
      return;
    }
    navigate('dashboard');
  }, [navigate]);

  const handleSearchResult = useCallback((result: NativeSearchResult) => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      setRecentSearches((current) => [
        trimmed,
        ...current.filter((query) => query !== trimmed),
      ].slice(0, 5));
    }
    openDestination(result.destinationId);
  }, [openDestination, searchQuery]);

  // Checking notifications clears them — everything on screen counts as seen.
  useEffect(() => {
    if (route.view !== 'notifications') return;
    setReadNotificationIds((current) => {
      const next = new Set(current);
      for (const item of nativeNotifications) next.add(item.id);
      return next.size === current.size ? current : next;
    });
  }, [nativeNotifications, route.view]);

  const handleNotification = useCallback((item: NativeNotificationItem) => {
    setReadNotificationIds((current) => new Set([...current, item.id]));
    openDestination(item.destinationId);
  }, [openDestination]);

  const handlePrimaryNavigation = useCallback((destination: LaunchPrimaryDestination) => {
    // A tab tap is a fresh start — stale "return to where you came from"
    // memory must never redirect a later Back to the wrong surface.
    unitDetailOriginRef.current = undefined;
    unitDetailTradeRef.current = undefined;
    crewOriginHomeRef.current = false;
    if (destination === 'crews') {
      // Crews is a first-class tab: land on the crew command view directly.
      clearLegacyCaptureHistoryState();
      setPlusOpen(false);
      setSelectedActivity(null);
      setCaptureOpen(false);
      setCrewEditor(null);
      setMoreDetailPage(null);
      setHomeMode('day');
      navigate('crews');
      return;
    }
    const tab = destination as TrackCPrimaryTab;
    const decision = selectTrackCPrimaryTab(tabRouteMemoryRef.current, tab);
    // The More tab must land on the More menu, never restore a remembered
    // focused workflow like Setup.
    const restoredRoute = resolveAppHash(decision.target.routeKey).route;
    // Tabs land on their root surface: More never restores Setup, and Home
    // never restores a queue/summary sub-page.
    const nextRoute = destination === 'more' && restoredRoute.view === 'setup'
      ? resolveAppHash('#/more').route
      : destination === 'home'
        && (restoredRoute.view !== 'dashboard' || restoredRoute.homeSummary)
        ? resolveAppHash('#/dashboard').route
        : destination === 'turnboard' && restoredRoute.view !== 'units'
          ? resolveAppHash('#/units').route
          : restoredRoute;
    const nextHash = buildAppHash(nextRoute);

    clearLegacyCaptureHistoryState();
    setPlusOpen(false);
    setSelectedActivity(null);
    activityReturnFocusRef.current = null;
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    launchCaptureReturnFocusIdRef.current = null;
    setCaptureOpen(false);
    setCrewEditor(null);
    setMoreDetailPage(null);
    setHomeMode('day');
    tabRouteMemoryRef.current = decision.state;
    if (decision.historyMode === 'replace') {
      window.history.replaceState(null, '', nextHash);
    } else {
      window.history.pushState(null, '', nextHash);
    }
    setRoute(nextRoute);
    setScrollRequestToken((token) => token + 1);
  }, []);

  const handleQuickAction = useCallback((action: LaunchQuickActionId) => {
    if (action === 'import-work') {
      navigate('dashboard');
      setHomeMode('manual-release');
      return;
    }
    if (action === 'assign-crews') {
      navigate('assignments');
      return;
    }
    if (action === 'start-walk') {
      navigate('units', undefined, { fieldWorkflow: 'walk' });
      return;
    }
    navigate('reports');
  }, [navigate]);

  const startFastDay = useCallback((
    submission: FastStartDaySubmission,
  ) => {
    const recordedAt = nowISO();
    const releaseBatchId = createId('release');
    const daySessionId = createId('day-session');
    let preparationError = '';
    let persisted = false;
    try {
      persisted = commitDataNow((current) => {
        if (current.activeProjectId !== submission.projectId) {
          throw new Error(
            'The active personal project changed. Review Start Day again before saving.',
          );
        }
        const currentRoster = projectPropertyRoster(current);
        const currentRosterUnits: ProjectRosterUnitOption[] =
          currentRoster.units.map((unit) => ({
            applicableSections: unit.applicableSections.map((section) =>
              toFastStartDaySection(section.id)),
            building: unit.building,
            floor: unit.floor,
            id: unit.id,
            unitNumber: unit.unitNumber,
            unitType: unit.unitType,
          }));
        const releaseBatch = createConfirmedDailyReleaseBatch(
          submission.release,
          currentRosterUnits,
          {
            batchId: releaseBatchId,
            confirmedAt: recordedAt,
            confirmedBy: 'Los',
          },
        );
        const withRelease = appendManualReleaseBatchOnce(current, releaseBatch);
        const selectedRelease = projectDailyReleases(withRelease).filter(
          (release) => release.id === releaseBatchId,
        );
        const task = createTodayTask(
          currentRoster,
          selectedRelease,
          submission.date,
          daySessionId,
        );
        if (!task) {
          throw new Error(
            'The confirmed Daily Release did not produce Today’s Task.',
          );
        }
        const review: StartDayReview = {
          accountId: operationalScope.accountId,
          activeCrewIdsByTrade: {
            Clean: submission.activeCrewIdsByTrade.clean,
            Paint: submission.activeCrewIdsByTrade.paint,
          },
          assignmentEvidenceReviewNote:
            `Los reviewed an exact manual release for ${submission.release.selectedUnitIds.length} Units and ${submission.release.items.length} section-trades.`,
          crewReviewConfirmed: {
            Clean: true,
            Paint: true,
          },
          date: submission.date,
          daySessionId,
          explicitConfirmation: true,
          goal: createTodayTaskGoal(task),
          keyStatus: submission.keyStatus,
          morningNote: submission.morningNote,
          propertyContact: submission.propertyContact.name,
          propertyId: submission.projectId,
          releaseBatchIds: [releaseBatchId],
          startedBy: 'Los',
          walkthroughScheduleWording:
            formatWalkthroughScheduleWording(
              submission.schedule.walkthroughTime,
            ),
          workingHoursWording: formatWorkingHoursWording(
            submission.schedule.workStartTime,
            submission.schedule.workEndTime,
          ),
        };
        const started = startDaySession(
          review,
          selectedRelease,
          currentRoster,
          projectDaySessions(current, operationalScope.accountId),
          recordedAt,
        );
        if (!started.session || !started.startEvent || started.errors.length > 0) {
          throw new Error(
            started.errors[0]
            ?? 'Start Day validation failed before anything was saved.',
          );
        }
        return applyDayTaskStateChange(withRelease, {
          event: started.startEvent,
          reason: 'day-started',
          recordedAt,
          session: started.session,
        });
      });
    } catch (error) {
      preparationError = error instanceof Error
        ? error.message
        : 'Start Day could not be prepared.';
    }
    if (!persisted) {
      if (preparationError) {
        console.warn(`Start Day was not saved: ${preparationError}`);
      }
      return false;
    }
    setHomeMode('day');
    return true;
  }, [
    commitDataNow,
    operationalScope.accountId,
  ]);

  const openUnitNote = useCallback(() => {
    setPlusInitialScreen('note');
    setPlusOpen(true);
  }, []);
  const openNativePlus = useCallback(() => {
    setPlusInitialScreen('menu');
    launchCaptureReturnFocusIdRef.current = 'lcc-central-plus';
    setPlusOpen(true);
  }, []);

  const handNativeFilesToCapture = useCallback((
    selection: TrackCNativeFileSelection,
  ) => {
    setPlusOpen(false);
    launchCaptureReturnFocusIdRef.current = 'lcc-central-plus';
    window.requestAnimationFrame(() => {
      setCaptureOpen(true);
      copilotRef.current?.openFileSource(
        selection.files,
        selection.kind === 'files' ? 'file' : 'photo',
      );
    });
  }, []);

  const handleNativePlusAction = useCallback((
    action: Exclude<TrackCPlusAction, 'note' | 'camera' | 'photos' | 'files'>,
  ) => {
    setPlusOpen(false);
    if (action === 'blocker') {
      setBlockReason('');
      setBlockTrade('both');
      setBlockDialog({
        unitId: routeRef.current.view === 'unitDetail' ? routeRef.current.unitId : undefined,
      });
      return;
    }
    if (action === 'import-work') {
      navigate('dashboard');
      setHomeMode('manual-release');
      return;
    }
    if (action === 'assign-units') {
      navigate('crews');
      setFieldToast('Pick the crew — Assign units is right on their card.');
      return;
    }
    if (action === 'tell-os') {
      tellOsTrackRef.current = null;
      setTellOsOpen(true);
      return;
    }
    launchCaptureReturnFocusIdRef.current = 'lcc-central-plus';
    window.requestAnimationFrame(() => {
      setCaptureOpen(true);
      copilotRef.current?.openTextSource();
    });
  }, [navigate]);

  const applyTurnIntent = useCallback((intent: TurnIntent): string => {
    const base = tellOsTrackRef.current ?? trackCState;
    const unit = base.units.find((candidate) => candidate.unitNumber === intent.unitNumber);
    if (!unit) throw new Error('not in the roster');
    const trade = intent.trade ?? 'paint';
    const tradeWord = trade === 'paint' ? 'Paint' : 'Clean';
    switch (intent.kind) {
      case 'set-task': {
        const workType = intent.workType ?? 'full';
        const sections = intent.sections?.length
          ? intent.sections
          : unit.workFacts
            .filter((fact) => fact.trade === 'paint' && fact.release === 'released')
            .map((fact) => fact.section);
        if (sections.length === 0) throw new Error('no released paint rooms');
        const saved = commitDataNow((current) => sections.reduce((acc, section) =>
          setReleaseWorkType(acc, { section, trade: 'paint', unitId: unit.id, workType }), current));
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber} → ${workType} on ${sections.join(', ')}`;
      }
      case 'remove-room': {
        const asked = intent.sections ?? [];
        if (asked.length === 0) throw new Error('say which rooms');
        // Same one hard rule as the unit page: never silently delete a
        // property-approved room. Skip those and say so.
        const accepted = new Set(unit.workFacts
          .filter((fact) => fact.trade === trade)
          .filter((fact) => {
            const projected = projectTrackCWork(base, {
              section: fact.section, trade, unitId: unit.id,
            });
            return projected?.property === 'property-accepted';
          })
          .map((fact) => fact.section));
        const sections = asked.filter((section) => !accepted.has(section));
        const skipped = asked.filter((section) => accepted.has(section));
        if (sections.length === 0) {
          throw new Error(`${asked.join(', ')} already property-approved — can't delete`);
        }
        const tellOsSession = data.daySessions.some((session) =>
          session.projectId === data.activeProjectId
          && ['active', 'ending', 'reopened'].includes(session.status));
        let track = base;
        if (tellOsSession) {
          for (const section of sections) {
            const cleared = clearTrackCAssignments(track, {
              eventIdPrefix: createId('tellos-unrelease'),
              recordedAt: nowISO(),
              recordedBy: 'Los',
              section,
              trade,
              unitId: unit.id,
            });
            if (cleared.ok) track = cleared.value;
          }
          tellOsTrackRef.current = track;
        }
        const saved = commitDataNow((current) => {
          let next = tellOsSession ? applyTrackCStateChange(current, track) : current;
          for (const section of sections) {
            next = setSectionReleaseState(next, {
              idFactory: createId,
              nowIso: nowISO(),
              released: false,
              section,
              trade,
              unitId: unit.id,
            });
          }
          return next;
        });
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber}: removed ${sections.join(', ')} from ${tradeWord}`
          + (skipped.length > 0 ? ` (kept ${skipped.join(', ')} — property-approved)` : '');
      }
      case 'assign': {
        const first = (intent.crewName ?? '').toLowerCase().split(' ')[0];
        const crew = base.crews.find((candidate) =>
          candidate.trade === trade && first
          && candidate.name.toLowerCase().startsWith(first));
        if (!crew) throw new Error(`no ${trade} crew called ${intent.crewName ?? '?'}`);
        const proposal = createTrackCBulkAssignmentProposal(base, {
          createdAt: nowISO(),
          createdBy: 'Los',
          crewId: crew.id,
          proposalId: createId('tellos-proposal'),
          sectionMode: 'all-released',
          sections: [],
          trade,
          unitIds: [unit.id],
        });
        const confirmedResult = confirmTrackCBulkAssignmentProposal(base, proposal, {
          confirmed: true,
          eventIdPrefix: createId('tellos-assign'),
          recordedAt: nowISO(),
          recordedBy: 'Los',
        });
        if (!confirmedResult.ok) throw new Error(confirmedResult.error.message);
        let track = confirmedResult.value.state;
        for (const target of confirmedResult.value.receipt.assignedTargets) {
          const started = applyTrackCSectionAction(track, {
            action: 'start-work',
            eventId: createId('tellos-start'),
            recordedAt: nowISO(),
            recordedBy: 'Los',
            target,
          });
          if (started.ok) track = started.value;
        }
        tellOsTrackRef.current = track;
        const saved = commitDataNow((current) => applyTrackCStateChange(current, track));
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber} ${tradeWord} → ${crew.name} (working)`;
      }
      case 'note': {
        const saved = commitDataNow((current) => {
          const result = appendPersonalNoteActivity(current, {
            unitId: unit.id,
            wording: `Tell Turn OS: ${intent.note ?? intent.summary}`,
          });
          return result.ok ? result.data : current;
        });
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber}: note saved`;
      }
      case 'block': {
        const saved = commitDataNow((current) =>
          setUnitReleaseRestriction(current, unit.id, intent.note ?? 'On hold', intent.trade ?? undefined));
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber}${intent.trade ? ` ${tradeWord}` : ''} blocked`;
      }
      case 'unblock': {
        const saved = commitDataNow((current) =>
          setUnitReleaseRestriction(current, unit.id, undefined, intent.trade ?? undefined));
        if (!saved) throw new Error('could not save');
        return `${unit.unitNumber}${intent.trade ? ` ${tradeWord}` : ''} unblocked — back in play`;
      }
      default:
        throw new Error('not supported yet');
    }
  }, [commitDataNow, trackCState]);

  const saveCrew = useCallback((draft: TrackBCrewDraft) => {
    const editor = crewEditor;
    const timestamp = nowISO();
    setData((current) => {
      if (editor?.mode === 'edit') {
        return updateCrewMember(current, editor.crewId, {
          active: draft.activeToday,
          name: draft.name,
          phone: draft.phone ?? '',
          trade: draft.trade === 'Paint' ? 'Painter' : 'Cleaner',
        });
      }
      return addCrewMember(current, {
        active: draft.activeToday,
        assignedLocation: '',
        company: '',
        createdAt: timestamp,
        id: createId('crew'),
        language: '',
        name: draft.name,
        notes: '',
        phone: draft.phone ?? '',
        projectId: current.activeProjectId,
        trade: draft.trade === 'Paint' ? 'Painter' : 'Cleaner',
        updatedAt: timestamp,
      });
    });
    setCrewEditor(null);
    setMoreStatus(`${draft.name} saved to this personal project.`);
  }, [crewEditor, setData]);

  // Quick-add a crew mid-flow (e.g. during Start Day) — creates and returns the
  // new crew's id so the caller can activate it for today immediately.
  const addDayCrew = useCallback((name: string, trade: 'paint' | 'clean'): string => {
    const timestamp = nowISO();
    const id = createId('crew');
    setData((current) => addCrewMember(current, {
      active: true,
      assignedLocation: '',
      company: '',
      createdAt: timestamp,
      id,
      language: '',
      name,
      notes: '',
      phone: '',
      projectId: current.activeProjectId,
      trade: trade === 'paint' ? 'Painter' : 'Cleaner',
      updatedAt: timestamp,
    }));
    return id;
  }, [setData]);

  const handleMoreNavigation = useCallback((destination: TrackBToolDestination) => {
    setMoreStatus('Personal workspace · paper remains authoritative');
    if (destination === 'official-pds-forms') {
      setMoreDetailPage('forms');
      return;
    }
    if (destination === 'portal') {
      setMoreDetailPage('portal');
      return;
    }
    if (destination === 'my-notes') {
      setMoreDetailPage('my-notes');
      return;
    }
    if (destination === 'field-standard') {
      setMoreDetailPage('standard');
      return;
    }
    if (
      destination === 'profile'
      || destination === 'privacy'
      || destination === 'storage'
      || destination === 'day-history'
    ) {
      setMoreDetailPage(destination);
      return;
    }
    if (destination === 'crews') {
      setCrewEditor(null);
      setMoreDetailPage('crews');
      return;
    }
    if (destination === 'reports-and-proof') {
      navigate('reports');
      return;
    }
    if (destination === 'activity') {
      navigate('activity');
      return;
    }
    if (destination === 'setup') {
      try {
        const projectActive = launchProjection.project?.mode === 'real';
        if (!setupDraft || setupActivationCommittedRef.current) {
          const nextDraft = createProjectActivationDraft(data, nowISO(), 'Los');
          const startStep = projectActive ? 4 : 0;
          setSetupDraft(nextDraft);
          setSetupStep(startStep);
          saveSetupDraft(nextDraft, startStep);
          setupActivationCommittedRef.current = false;
          setSetupStatus(projectActive
            ? `${launchProjection.propertyName} is already active. Review or update its setup; nothing changes until you re-activate.`
            : 'Review all five steps before activating this personal project.');
        } else {
          setSetupStatus('Your unfinished setup draft is restored.');
        }
        setSetupErrors([]);
      } catch (error) {
        setSetupDraft(null);
        setSetupErrors([
          error instanceof Error
            ? error.message
            : 'The personal project setup could not be prepared.',
        ]);
        setSetupStatus('Project setup is unavailable. Nothing was changed.');
      }
      navigate('setup');
      return;
    }
    if (destination === 'unit-import') {
      // Day-to-day imports mean "record what Joseph released TODAY" — open the
      // quick-add / photo / paste review, not the roster setup step. Roster
      // additions live in Project Setup → Units.
      handleQuickAction('import-work');
      return;
    }
    if (destination === 'sync') {
      navigate('sync');
      return;
    }
    navigate('export');
  }, [data, handleQuickAction, launchProjection.project?.mode, launchProjection.propertyName, navigate, saveSetupDraft, setupDraft]);

  const activateProject = useCallback(async () => {
    if (!setupDraft || setupActivationInFlightRef.current) return;

    setupActivationInFlightRef.current = true;
    setSetupBusy(true);
    setSetupErrors([]);
    setSetupStatus('Saving the personal project setup on this device…');

    const attemptDraft = prepareDraftForActivationAttempt(
      setupDraft,
      nowISO(),
      'Los',
    );
    setSetupDraft(attemptDraft);
    saveSetupDraft(attemptDraft, setupStep);
    const prepared = prepareProjectActivation(
      adaptAppDataForTrackA(data),
      attemptDraft,
    );

    if (!prepared.ok) {
      setSetupErrors(prepared.errors);
      setSetupStatus('Project was not activated. Review the highlighted requirements.');
      setupActivationInFlightRef.current = false;
      setSetupBusy(false);
      return;
    }

    const result = await persistPreparedProjectActivation(
      prepared,
      (candidate) => persistAppDataNow(candidate as AppData),
    );

    if (!result.ok) {
      setSetupDraft(result.retry.draft);
      saveSetupDraft(result.retry.draft, setupStep);
      setSetupErrors(result.errors);
      setSetupStatus('The setup remains available to retry. No activation receipt was created.');
      setupActivationInFlightRef.current = false;
      setSetupBusy(false);
      return;
    }

    setData(result.data as AppData);
    setupDraftStore?.clear(setupDraftOwnerKey);
    setSetupStatus('Personal project activated and saved on this device.');
    setupActivationCommittedRef.current = true;
    setupActivationInFlightRef.current = false;
    setSetupBusy(false);
    navigate('dashboard');
  }, [
    data,
    navigate,
    saveSetupDraft,
    setData,
    setupDraft,
    setupDraftOwnerKey,
    setupDraftStore,
    setupStep,
  ]);

  const requestSignOut = useCallback(() => {
    if (!sync.enabled) {
      setMoreStatus('This device is in local-only mode, so there is no Turn OS account session to end.');
      return;
    }
    setupDraftStore?.clear(setupDraftOwnerKey);
    void sync.signOut();
  }, [setupDraftOwnerKey, setupDraftStore, sync]);

  const navigateBoardHost = useCallback((request: BoardFirstHostNavigationRequest) => {
    const destinationView = {
      backup: 'export',
      crews: 'crews',
      reports: 'reports',
      setup: 'setup',
      sync: 'sync',
    }[request.destination] as AppView;
    navigate(destinationView);
    return {
      accepted: true,
      message: `${request.destination} opened in the existing Turn OS tool.`,
    };
  }, [navigate]);

  const navigateBoardUnit = useCallback((unitId?: string) => {
    navigate(unitId ? 'unitDetail' : 'units', unitId);
  }, [navigate]);

  const cacheOwnerMatchesSession = Boolean(
    sync.userId
      && getLocalCacheOwner() === sync.userId,
  );
  const authConfigured = sync.enabled && sync.configured;
  const offlineContinuity = resolvePostAuthOfflineContinuity({
    hasLocalOperationalData: hasStoredData,
    cachedOwnerUserId: getLocalCacheOwner() ?? undefined,
    sessionUserId: sync.userId,
    lastAuthenticatedUserId: sync.lastAuthenticatedUserId,
  });
  const offlineContinuityActive = authConfigured
    && !online
    && !sync.signedIn
    && offlineContinuity.allowLocalApp;

  const saveAlert = saveStatus.state === 'failed' ? (
    <section className="persistence-alert lcc-host-alert" role="alert" aria-live="assertive">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>Changes are not saved on this device</strong>
        <p>
          {saveStatus.canRetry
            ? 'Your latest changes are still in memory. Keep this app open, retry the save, or export a backup.'
            : 'The last save failed. Retry after freeing browser storage, or export a backup of the data still visible here.'}
        </p>
      </div>
      <div className="persistence-alert__actions">
        {saveStatus.canRetry ? (
          <button type="button" onClick={retrySave}>
            <RefreshCw size={17} aria-hidden="true" />
            Retry save
          </button>
        ) : null}
        <button type="button" onClick={() => navigate('export')}>
          <Download size={17} aria-hidden="true" />
          Data &amp; backup
        </button>
      </div>
    </section>
  ) : null;

  const cacheAlert = sync.status === 'cache_transition_required' ? (
    <section className="persistence-alert lcc-host-alert" role="alert" aria-live="assertive">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>Sync cache needs review</strong>
        <p>
          This device’s local Turn data must be reviewed before sync can continue.
          No sync, account, or paper status changes from this warning.
        </p>
      </div>
      <div className="persistence-alert__actions">
        <button type="button" onClick={() => navigate('sync')}>
          Open Sync &amp; diagnostics
        </button>
      </div>
    </section>
  ) : null;

  const repositoryAlert = boardRepositoryState.error ? (
    <section className="persistence-alert lcc-host-alert" role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>TurnBoard source is unavailable</strong>
        <p>{boardRepositoryState.error.message} No synthetic status was substituted.</p>
      </div>
    </section>
  ) : null;

  const offlineContinuityAlert = offlineContinuityActive ? (
    <section className="persistence-alert lcc-host-alert" role="status">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>Offline local continuity</strong>
        <p>
          This saved workspace matches the last authenticated account.
          Cloud access remains paused until the session is revalidated.
        </p>
      </div>
    </section>
  ) : null;

  const loadWarningAlert = loadWarnings.length > 0
    && dismissedLoadWarn !== loadWarnSignature ? (
    <section className="persistence-alert lcc-host-alert" role="status">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>Saved details need a quick review</strong>
        <p>
          {loadWarnings.length} thing{loadWarnings.length === 1 ? '' : 's'} loaded fine but
          should be double-checked. Your records are safe — nothing was replaced.
          Back up from More → Storage when you get a chance.
        </p>
      </div>
      <button
        aria-label="Dismiss this notice"
        className="lcc-host-alert__dismiss"
        onClick={dismissLoadWarn}
        type="button"
      >
        ✕
      </button>
    </section>
  ) : null;


  // LIVE portal: every committed field change republishes automatically —
  // no first manual share needed. Joseph and Paige see the board move while
  // Los assigns, crews work, and he approves. Empty snapshots never publish,
  // so a fresh device can't blank the portal.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const units = buildPortalUnits(trackCState);
    if (units.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = getSupabaseClient();
          const session = client ? (await client.auth.getSession()).data.session : null;
          if (!session?.access_token) return;
          await fetch('/api/portal/publish', {
            body: JSON.stringify({
              generatedAt: new Date().toISOString(),
              propertyName: launchProjection.propertyName,
              supervisor: launchProjection.project?.supervisorName?.trim() || 'Los',
              units,
            }),
            headers: {
              authorization: `Bearer ${session.access_token}`,
              'content-type': 'application/json',
            },
            method: 'POST',
          });
          window.localStorage.setItem('turn-os:portal-last-published', new Date().toISOString());
        } catch {
          // Offline or signed out — the next change retries automatically.
        }
      })();
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [launchProjection.project?.supervisorName, launchProjection.propertyName, trackCState]);

  // Walk requests from the portal (Joseph/Paige) surface on Home.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;
    const fetchRequests = async () => {
      try {
        const client = getSupabaseClient();
        const session = client ? (await client.auth.getSession()).data.session : null;
        if (!session?.access_token) return;
        const response = await fetch('/api/portal/requests', {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) return;
        const body = await response.json() as { items?: { at: string; name: string; units: string[] }[] };
        if (!cancelled && Array.isArray(body.items)) setWalkRequests(body.items);
      } catch {
        // Offline — fine, this is a courtesy signal.
      }
    };
    void fetchRequests();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchRequests();
    }, 180_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const walkRequestAlert = walkRequests.length > 0 ? (
    <div className="lcc-host-alert lcc-walk-request" role="status">
      <Footprints aria-hidden="true" size={18} />
      <span>
        {walkRequests.slice(0, 2).map((request) =>
          `${request.name} wants to walk: ${request.units.join(', ')}`).join(' · ')}
        {walkRequests.length > 2 ? ` · +${walkRequests.length - 2} more` : ''}
      </span>
      <button
        onClick={() => {
          void (async () => {
            try {
              const client = getSupabaseClient();
              const session = client ? (await client.auth.getSession()).data.session : null;
              if (!session?.access_token) return;
              await fetch('/api/portal/requests', {
                headers: { authorization: `Bearer ${session.access_token}` },
                method: 'DELETE',
              });
              setWalkRequests([]);
            } catch {
              setWalkRequests([]);
            }
          })();
        }}
        type="button"
      >
        Got it
      </button>
    </div>
  ) : null;

  const blockDialogElement = blockDialog ? (() => {
    // Ground truth comes straight from the release batches — the same rows
    // the block writes to — so Unblock always shows when a block exists.
    const unitNumberById = new Map(data.units.map((unit) => [unit.id, unit.unitNumber]));
    const releaseUnitIds = new Set(data.dailyReleaseBatches
      .filter((batch) => batch.projectId === data.activeProjectId)
      .flatMap((batch) => batch.items.map((item) => item.unitId)));
    const releasedUnits = [...releaseUnitIds]
      .map((unitId) => ({
        id: unitId,
        unitNumber: unitNumberById.get(unitId) ?? unitId,
      }))
      .sort((left, right) =>
        left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }));
    const selectedId = blockDialog.unitId
      ?? (releasedUnits.length === 1 ? releasedUnits[0].id : undefined);
    const selected = releasedUnits.find((unit) => unit.id === selectedId);
    const blockedTrades = new Set(data.dailyReleaseBatches
      .filter((batch) => batch.projectId === data.activeProjectId)
      .flatMap((batch) => batch.items
        .filter((item) => item.unitId === selectedId && item.restriction?.trim())
        .map((item) => item.trade)));
    const commitBlock = (reason: string | undefined) => {
      if (!selectedId) return;
      const tradeScope = blockTrade === 'both' ? undefined : blockTrade;
      const saved = commitDataNow((current) =>
        setUnitReleaseRestriction(current, selectedId, reason, tradeScope));
      if (saved) {
        setFieldToast(reason === undefined
          ? `Unit ${selected?.unitNumber ?? ''} unblocked — back in the working queues.`
          : `Unit ${selected?.unitNumber ?? ''} marked blocked — it sits in Waiting / Blocked until you unblock it.`);
      }
      setBlockDialog(null);
    };
    return (
      <div aria-modal="true" className="lcc-block-dialog" role="dialog">
        <div className="lcc-block-dialog__card">
          <h2>{selected ? `Block Unit ${selected.unitNumber}` : 'Block a unit'}</h2>
          {!blockDialog.unitId ? (
            <select
              aria-label="Which unit is blocked?"
              onChange={(event) =>
                setBlockDialog({ unitId: event.target.value || undefined })}
              value={selectedId ?? ''}
            >
              <option value="">Which unit?</option>
              {releasedUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>
              ))}
            </select>
          ) : null}
          <div className="lcc-block-dialog__reasons lcc-block-dialog__trades">
            {([['paint', 'Paint only'], ['clean', 'Clean only'], ['both', 'Paint + Clean']] as const)
              .map(([value, label]) => (
                <button
                  aria-pressed={blockTrade === value}
                  className={blockTrade === value ? 'is-selected' : undefined}
                  key={value}
                  onClick={() => setBlockTrade(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="lcc-block-dialog__reasons">
            {['Locked out — no key', 'Occupied — do not enter', 'Maintenance in unit', 'Paint after Turn'].map((reason) => (
              <button
                aria-pressed={blockReason === reason}
                className={blockReason === reason ? 'is-selected' : undefined}
                key={reason}
                onClick={() => setBlockReason(reason)}
                type="button"
              >
                {reason}
              </button>
            ))}
          </div>
          <input
            aria-label="Reason"
            onChange={(event) => setBlockReason(event.target.value)}
            placeholder="Or type the reason"
            value={blockReason}
          />
          {blockedTrades.size > 0 ? (
            <p className="lcc-block-dialog__current">
              Currently blocked: {[...blockedTrades]
                .map((trade) => trade === 'paint' ? 'Paint' : 'Clean').join(' + ')}.
              Unblock uses the trade choice above (Paint + Clean clears everything).
            </p>
          ) : null}
          <div className="lcc-block-dialog__actions">
            <button onClick={() => setBlockDialog(null)} type="button">Cancel</button>
            {blockedTrades.size > 0 ? (
              <button
                className="is-clear"
                onClick={() => commitBlock(undefined)}
                type="button"
              >
                Unblock
              </button>
            ) : null}
            <button
              className="is-primary"
              disabled={!selectedId}
              onClick={() => commitBlock(blockReason)}
              type="button"
            >
              Mark blocked
            </button>
          </div>
        </div>
      </div>
    );
  })() : null;

  const hostAlerts = (
    <>
      {walkRequestAlert}
      {saveAlert}
      {cacheAlert}
      {repositoryAlert}
      {offlineContinuityAlert}
      {loadWarningAlert}
    </>
  );

  const legacySurface = (
    <div className="lcc-unified-tool-content">
      {route.view === 'units' && route.unitStatusFilter !== 'All' ? (
        <UnitsView
          data={data}
          initialStatusFilter={route.unitStatusFilter}
          onNavigate={navigate}
          setData={setData}
        />
      ) : null}
      {route.view === 'unitDetail' ? (
        <UnitDetailView
          data={data}
          setData={setData}
          unitId={route.unitId ?? ''}
          onNavigate={navigate}
        />
      ) : null}
      {route.view === 'issues' ? (
        <IssuesView data={data} setData={setData} focusedIssueId={route.issueId} />
      ) : null}
      {route.view === 'review' ? (
        <ReviewView
          data={data}
          onNavigate={navigate}
          onRetrySave={retrySave}
          saveStatus={saveStatus}
          setData={setData}
          sync={sync}
        />
      ) : null}
      {route.view === 'assignments' ? <AssignmentsView data={data} setData={setData} /> : null}
      {route.view === 'daily' ? <DailyLogView data={data} setData={setData} /> : null}
      {route.view === 'training' ? <TrainingQuestionsView data={data} setData={setData} /> : null}
      {route.view === 'sync' ? <SyncDiagnosticsView sync={sync} /> : null}
      {route.view === 'export' ? (
        <ExportView
          data={data}
          restoreDataNow={restoreDataNow}
          syncAuthReady={sync.authReady}
          syncSignedIn={sync.signedIn}
        />
      ) : null}
    </div>
  );
  const legacyToolDescription: Partial<Record<AppView, string>> = {
    assignments: 'Assign released Paint and Clean work in this personal Alpha.',
    daily: 'Review personal daily notes and end-of-day records.',
    export: 'Use the existing guarded backup, restore, and export controls.',
    issues: 'Review personal blockers and follow-ups without changing paper.',
    review: 'Review pending personal-app changes and save state.',
    sync: 'Review local save and optional account-sync status.',
    training: 'Review field questions recorded in this personal workspace.',
    unitDetail: 'Personal notes and photos for this Unit.',
    units: 'Review the requested personal Unit filter.',
  };
  const legacyToolBack = () => {
    if (route.view === 'unitDetail' || route.view === 'units') {
      navigate('units');
      return;
    }
    if (route.view === 'issues') {
      navigate('dashboard');
      return;
    }
    navigate('more');
  };

  const appAvailable = !authConfigured
    || (
      sync.authReady
      && (
        (sync.signedIn && cacheOwnerMatchesSession)
        || offlineContinuityActive
      )
      && sync.status !== 'cache_transition_required'
    );
  if (!appAvailable) {
    return (
      <Wave2A2StandaloneRoute routeName="login" theme={theme}>
        <LaunchLoginSurface
          busy={authBusy || !sync.authReady}
          email={loginEmail}
          online={online}
          onEmailChange={setLoginEmail}
          onForgotPassword={() => {
            if (!online) {
              setAuthFeedback('Reconnect before requesting a password reset. Saved field data is not deleted.');
              return;
            }
            if (!/^\S+@\S+\.\S+$/u.test(loginEmail.trim())) {
              setAuthFeedback('Enter a valid email before requesting a password reset.');
              return;
            }
            setAuthBusy(true);
            setAuthFeedback(undefined);
            void authAdapter.requestPasswordReset(loginEmail.trim()).then((result) => {
              setAuthFeedback(
                result.ok
                  ? 'Password-reset request sent. Check the email address you entered.'
                  : result.error,
              );
            }).finally(() => setAuthBusy(false));
          }}
          onPasswordChange={setLoginPassword}
          onSubmit={() => {
            if (!/^\S+@\S+\.\S+$/u.test(loginEmail.trim()) || !loginPassword) {
              setAuthFeedback('Enter a valid email and password.');
              return;
            }
            setAuthBusy(true);
            setAuthFeedback(undefined);
            void sync.signIn(loginEmail.trim(), loginPassword)
              .then(() => setLoginPassword(''))
              .finally(() => setAuthBusy(false));
          }}
          password={loginPassword}
          recovery={sync.signedIn && sync.status === 'cache_transition_required'
            ? <SyncPanel presentation="page" sync={sync} />
            : undefined}
          sessionMessage={authFeedback ?? sync.message}
        />
      </Wave2A2StandaloneRoute>
    );
  }

  // Login-first: open on a clean sign-in page before showing the app — but
  // NEVER trap the field. Once signed in, the session persists across reloads
  // (online or offline); the skip link keeps a dead-zone launch usable.
  if (aiAuth.available && aiAuth.ready && !aiAuth.signedIn && !aiLoginSkipped) {
    return (
      <Wave2A2StandaloneRoute routeName="login" theme={theme}>
        <LaunchLoginSurface
          busy={aiAuth.busy}
          email={loginEmail}
          online={online}
          onEmailChange={setLoginEmail}
          onForgotPassword={() => {
            if (!online) {
              setAuthFeedback('Reconnect before requesting a password reset. Saved field data is not deleted.');
              return;
            }
            if (!/^\S+@\S+\.\S+$/u.test(loginEmail.trim())) {
              setAuthFeedback('Enter a valid email before requesting a password reset.');
              return;
            }
            setAuthBusy(true);
            setAuthFeedback(undefined);
            void authAdapter.requestPasswordReset(loginEmail.trim()).then((result) => {
              setAuthFeedback(
                result.ok
                  ? 'Password-reset request sent. Check the email address you entered.'
                  : result.error,
              );
            }).finally(() => setAuthBusy(false));
          }}
          onPasswordChange={setLoginPassword}
          onSubmit={() => {
            if (!/^\S+@\S+\.\S+$/u.test(loginEmail.trim()) || !loginPassword) {
              setAuthFeedback('Enter a valid email and password.');
              return;
            }
            setAuthFeedback(undefined);
            void aiAuth.signIn(loginEmail.trim(), loginPassword).then((ok) => {
              if (ok) setLoginPassword('');
            });
          }}
          password={loginPassword}
          sessionMessage={authFeedback ?? aiAuth.error ?? undefined}
        />
        <button
          className="lcc-login-skip"
          onClick={() => setAiLoginSkipped(true)}
          type="button"
        >
          Continue without signing in — field logging works fully offline
        </button>
      </Wave2A2StandaloneRoute>
    );
  }

  const editingCrew = crewEditor?.mode === 'edit'
    ? crewRecords.find((crew) => crew.id === crewEditor.crewId)
    : undefined;
  const currentRouteKey = buildAppHash(route);
  const currentRouteTab = trackCTabForRoute(route.view);
  const rememberedRoute = getTrackCCurrentTabRoute(
    tabRouteMemoryRef.current,
    currentRouteTab,
  );
  const routeSupportsScrollRestoration = (
    route.view !== 'search'
    && route.view !== 'notifications'
    && rememberedRoute.routeKey === currentRouteKey
  );

  const shellContent = fieldOpsRouteActive ? (
    <div className="lcc-host-stack lcc-host-stack--field-ops">
      {hostAlerts}
      {crewEditor ? (
        <TrackBCrewFormPage
          key={crewEditor.mode === 'edit' ? crewEditor.crewId : 'new-crew'}
          initialCrew={editingCrew}
          mode={crewEditor.mode}
          onBack={() => setCrewEditor(null)}
          onCancel={() => setCrewEditor(null)}
          onSave={saveCrew}
          statusLabel="Personal project contact"
        />
      ) : invalidFieldRouteMessage || !activeFieldState ? (
        <NativeDetailShell
          description={invalidFieldRouteMessage ?? 'Field Operations could not be restored safely.'}
          onBack={() => navigate('units')}
          statusLabel="Nothing was changed"
          title="Field workflow unavailable"
        >
          <div className="lcc-host-alert lcc-host-alert--error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{invalidFieldRouteMessage ?? canonicalProjectionResult.error}</span>
          </div>
        </NativeDetailShell>
      ) : (
        <TrackCFieldOps
          embedded
          crewDirectory={Object.fromEntries(
            crewRecords.map((crew) => [crew.id, { phone: crew.phone }]),
          )}
          propertyContacts={activeProjectContacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            role: contact.title,
          }))}
          initialState={activeFieldState}
          onRequestUnitNote={openUnitNote}
          onSetUnitBeds={(unitId, beds) => {
            const unitNumber = trackCState.units
              .find((unit) => unit.id === unitId)?.unitNumber ?? '';
            const saved = commitDataNow((current) =>
              updateUnit(current, unitId, { bedCount: beds, hasCommonArea: true }, 'Los adjusted the unit rooms.'));
            setFieldToast(saved
              ? `Unit ${unitNumber} set to ${beds === 0 ? 'studio (common only)' : `${beds} room${beds === 1 ? '' : 's'} + common`}.`
              : 'Could not save — try again.');
          }}
          onMoveUnitTrade={(sourceUnitId, trade, targetUnitNumber) => {
            const source = trackCState.units.find((unit) => unit.id === sourceUnitId);
            const target = trackCState.units.find((unit) =>
              unit.unitNumber === targetUnitNumber.trim());
            if (!source) return;
            if (!target) {
              setFieldToast(`No unit ${targetUnitNumber.trim()} in the roster.`);
              return;
            }
            if (target.id === source.id) return;
            // Wrong unit → move this trade's released rooms + tasks to the right
            // unit: release them on the target, unrelease the source. Only rooms
            // the target actually has come over. Re-assign the crew there after.
            const moving = source.workFacts
              .filter((fact) => fact.trade === trade && fact.release === 'released'
                && target.applicableSections.includes(fact.section));
            if (moving.length === 0) {
              setFieldToast(`Nothing released on ${source.unitNumber} ${trade} to move (or ${target.unitNumber} lacks those rooms).`);
              return;
            }
            const saved = commitDataNow((current) => {
              let next = current;
              for (const fact of moving) {
                next = setSectionReleaseState(next, {
                  idFactory: createId,
                  nowIso: nowISO(),
                  released: true,
                  section: fact.section,
                  trade,
                  unitId: target.id,
                });
                if (trade === 'paint' && fact.workType) {
                  next = setReleaseWorkType(next, {
                    section: fact.section,
                    trade,
                    unitId: target.id,
                    workType: fact.workType,
                  });
                }
              }
              const cleared = clearTrackCAssignments(trackCState, {
                eventIdPrefix: createId('move-unrelease'),
                recordedAt: nowISO(),
                recordedBy: 'Los',
                trade,
                unitId: source.id,
              });
              if (cleared.ok) next = applyTrackCStateChange(next, cleared.value);
              return setTradeReleaseState(next, {
                idFactory: createId,
                nowIso: nowISO(),
                released: false,
                trade,
                unitId: source.id,
              });
            });
            setFieldToast(saved
              ? `Moved ${trade === 'paint' ? 'Paint' : 'Clean'} from ${source.unitNumber} to ${target.unitNumber} — assign the crew there.`
              : 'Start the day first, then move it.');
          }}
          onToggleCrewActive={(crewId, active) => {
            const name = crewRecords.find((crew) => crew.id === crewId)?.name ?? 'Crew';
            const saved = commitDataNow((current) =>
              updateCrewMember(current, crewId, { active, updatedAt: nowISO() }));
            setFieldToast(saved
              ? `${name} marked ${active ? 'present today' : 'out today'}.`
              : 'Could not save — try again.');
          }}
          initialView={trackCRouteState.view}
          unitNotes={unitNotes}
          unitPhotos={data.photoNotes.filter((photo) =>
            photo.projectId === data.activeProjectId && Boolean(photo.unitId))}
          onUnblockUnit={(unitId, trade) => {
            const unitNumber = trackCState.units
              .find((unit) => unit.id === unitId)?.unitNumber ?? '';
            const saved = commitDataNow((current) =>
              setUnitReleaseRestriction(current, unitId, undefined, trade));
            setFieldToast(saved
              ? `Unit ${unitNumber} ${trade === 'paint' ? 'Paint' : 'Clean'} unblocked — back in play.`
              : 'The unblock could not be saved — try again.');
          }}
          onRequestBlock={(unitId, trade) => {
            setBlockReason('');
            setBlockTrade(trade);
            setBlockDialog({ unitId });
          }}
          onSetTradeRelease={(unitId, trade, released) => {
            const unitNumber = trackCState.units
              .find((unit) => unit.id === unitId)?.unitNumber ?? '';
            const hasActiveSession = data.daySessions.some((session) =>
              session.projectId === data.activeProjectId
              && ['active', 'ending', 'reopened'].includes(session.status));
            if (released && !hasActiveSession) {
              setFieldToast('Start the day first — then mark what Joseph released.');
              return;
            }
            const saved = commitDataNow((current) => {
              let next = current;
              // Unassigning crews records field events, which need an active Day
              // Session. Removing the release row does NOT — so when the day
              // isn't started, skip the crew-clearing and just drop the rows.
              // (Never let "start the day" block fixing Joseph's mistake.)
              if (!released && hasActiveSession) {
                const cleared = clearTrackCAssignments(trackCState, {
                  eventIdPrefix: createId('unrelease'),
                  recordedAt: nowISO(),
                  recordedBy: 'Los',
                  trade,
                  unitId,
                });
                if (cleared.ok) next = applyTrackCStateChange(next, cleared.value);
              }
              return setTradeReleaseState(next, {
                idFactory: createId,
                nowIso: nowISO(),
                released,
                trade,
                unitId,
              });
            });
            setFieldToast(saved
              ? `Unit ${unitNumber} ${trade === 'paint' ? 'Paint' : 'Clean'} ${released ? 'released — sections are in play' : 'removed — it was never released'}.`
              : 'That change could not be saved — try again.');
          }}
          onSetSectionWorkType={(target, workType) => {
            const unitNumber = trackCState.units
              .find((unit) => unit.id === target.unitId)?.unitNumber ?? '';
            const saved = commitDataNow((current) => setReleaseWorkType(current, {
              section: target.section,
              trade: target.trade,
              unitId: target.unitId,
              workType,
            }));
            const label = workType === 'touch-up'
              ? 'touch-up'
              : workType === 'cut-in'
                ? 'cut-in'
                : workType === 'full-cut-in' ? 'full + cut-in' : 'full paint';
            setFieldToast(saved
              ? `Unit ${unitNumber} ${target.section === 'common' ? 'Common' : target.section} → ${label}.`
              : 'Could not save — try again.');
          }}
          onSetSectionRelease={(target, released) => {
            const unitNumber = trackCState.units
              .find((unit) => unit.id === target.unitId)?.unitNumber ?? '';
            const saved = commitDataNow((current) => setSectionReleaseState(current, {
              idFactory: createId,
              nowIso: nowISO(),
              released,
              section: target.section,
              trade: target.trade,
              unitId: target.unitId,
            }));
            setFieldToast(saved
              ? released
                ? `Unit ${unitNumber} ${target.section === 'common' ? 'Common' : target.section} ${target.trade === 'paint' ? 'Paint' : 'Clean'} marked released.`
                : `Unit ${unitNumber} ${target.section === 'common' ? 'Common' : target.section} ${target.trade === 'paint' ? 'Paint' : 'Clean'} marked NOT released.`
              : 'Start the day first — then adjust the release from the unit page.');
          }}
          onCommitUnitPhoto={(photo) =>
            // Photos are dispute evidence — persist synchronously like field
            // events so a crash can't lose a photo the UI said was saved.
            commitDataNow((current) => addPhotoNote(current, photo))}
          onCrewContactRequested={() => {
            setMoreStatus('No message was sent. Crew contact remains a manual external action.');
          }}
          onAddCrewRequested={() => {
            setCrewEditor({ mode: 'add' });
            setMoreDetailPage('crews');
            navigate('more');
          }}
          onCrewEditRequested={(crewId) => {
            setCrewEditor({ crewId, mode: 'edit' });
            navigate('crews', undefined, { crewId });
          }}
          onDialogOpenChange={setTrackCDialogOpen}
          onNavigate={(nextRoute) => {
            if (nextRoute.view === 'assign') {
              navigate('assignments');
              return;
            }
            if (nextRoute.view === 'crews') {
              if (!nextRoute.crewId && crewOriginHomeRef.current) {
                crewOriginHomeRef.current = false;
                navigate('dashboard');
                return;
              }
              navigate('crews', undefined, { crewId: nextRoute.crewId });
              return;
            }
            if (nextRoute.view === 'walk') {
              navigate('units', undefined, {
                fieldWorkflow: 'walk',
                walkSessionId: nextRoute.walkSessionId,
              });
              return;
            }
            if (nextRoute.unitId) {
              unitDetailTradeRef.current = nextRoute.unitTrade;
              navigate('unitDetail', nextRoute.unitId, { unitSurface: 'board' });
              return;
            }
            unitDetailTradeRef.current = undefined;
            if (unitDetailOriginRef.current) {
              const origin = unitDetailOriginRef.current;
              unitDetailOriginRef.current = undefined;
              if (origin === 'home') {
                restoreHomeScrollRef.current = true;
                navigate('dashboard');
              } else navigate('dashboard', undefined, { homeSummary: origin });
              return;
            }
            navigate('units');
          }}
          onStateChange={(nextState) => {
            // Every committed TrackC change is field truth — a Los pass, an opened
            // callback, a property acceptance, an assignment, or a walk boundary.
            // Persist synchronously so a crash in the ~500ms deferred-write window
            // can't lose a tap the UI already confirmed. High-frequency walk-draft
            // edits stay deferred via onDraftChange below.
            commitDataNow((current) => applyTrackCStateChange(current, nextState));
          }}
          routeState={trackCRouteState}
          walkIntegration={{
            onReturnToBoard: () => navigate('dashboard'),
            contacts: activeProjectContacts.map((contact) => ({
              id: contact.id,
              isPrimary: contact.isPrimary,
              name: contact.name,
              role: contact.title,
            })),
            ...(trackCWalkDraft ? { restoredDraft: trackCWalkDraft } : {}),
            onDraftChange: (draft) => {
              setData((current) =>
                applyTrackCWalkDraftChange(current, draft));
            },
            onOpenTurnSignOff: () => {
              // Straight to the official Turn Sign-Off form — no detour.
              window.open(
                OFFICIAL_PDS_LINKS.find((link) => link.id === 'turn-sign-off')?.url,
                '_blank',
                'noopener,noreferrer',
              );
            },
          }}
        />
      )}
    </div>
  ) : boardRouteActive ? (
    <BoardFirstShell
      activeView={boardViewForRoute(route.view)}
      activityItems={boardActivity}
      embedded
      externalDialogOpen={captureOpen || plusOpen || Boolean(selectedActivity)}
      hostStatusSlot={hostAlerts}
      initialUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
      propertyName={launchProjection.propertyName}
      repository={boardRepository}
      onAssistantSubmit={submitBoardAssistant}
      onCaptureRequest={openBoardCapture}
      onDialogOpenChange={setBoardDialogOpen}
      onHostNavigate={navigateBoardHost}
      onOpenActivity={(item, trigger) => {
        activityReturnFocusRef.current = trigger;
        setSelectedActivity(item);
      }}
      onOpenPersonalUnit={(unitId) =>
        navigate('unitDetail', unitId, { unitSurface: 'personal' })}
      onUnitNavigate={navigateBoardUnit}
    />
  ) : route.view === 'search' ? (
    <NativeSearchPage
      groups={nativeSearchGroups}
      onBack={closeFullPage}
      onOpenResult={handleSearchResult}
      onQueryChange={setSearchQuery}
      onSelectRecent={(query) => setSearchQuery(query)}
      query={searchQuery}
      recentSearches={recentSearches}
    />
  ) : route.view === 'notifications' ? (
    <NativeNotificationsPage
      activeTab={notificationTab}
      items={nativeNotifications}
      onBack={closeFullPage}
      onOpenNotification={handleNotification}
      onTabChange={setNotificationTab}
    />
  ) : route.view === 'dashboard' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      {launchProjection.project?.mode === 'real' && todayTask
        && releaseProofDate !== currentDate && releaseProofSnooze !== currentDate ? (
        <section className="lcc-release-proof" role="note">
          <strong>Submit today’s release proof</strong>
          <p>
            Joseph released {new Set(todayTask.sections.map((section) => section.unitId)).size} unit(s).
            Copy the summary, open the Backup Safety Submission Box, paste, submit — that’s your
            “you told me to work these” receipt.
          </p>
          <div>
            <button
              onClick={() => {
                const byUnit = new Map<string, string[]>();
                for (const section of todayTask.sections) {
                  const list = byUnit.get(section.unitId) ?? [];
                  list.push(section.sectionId === 'common' ? 'Common' : section.sectionId);
                  byUnit.set(section.unitId, list);
                }
                const summary = `Release proof — ${currentDate} — ${launchProjection.propertyName}: `
                  + [...byUnit.entries()]
                    .map(([unitId, sections]) =>
                      `Unit ${unitNumberById.get(unitId) ?? unitId} (${[...new Set(sections)].join(', ')})`)
                    .join('; ')
                  + `. Released by ${todayTask ? 'property contact' : ''} — recorded in Turn OS.`;
                void navigator.clipboard?.writeText(summary).catch(() => undefined);
                setMoreStatus('Release summary copied. Paste it into the Submission Box.');
              }}
              type="button"
            >
              Copy summary
            </button>
            <button
              onClick={() => {
                window.open(
                  OFFICIAL_PDS_LINKS.find((link) => link.id === 'backup-safety')?.url,
                  '_blank',
                  'noopener,noreferrer',
                );
                window.localStorage.setItem('turn-os:release-proof-date', currentDate);
                setReleaseProofDate(currentDate);
              }}
              type="button"
            >
              Open Submission Box
            </button>
            <button
              onClick={() => {
                try {
                  window.localStorage.setItem('turn-os:release-proof-snooze', currentDate);
                } catch {
                  // Session-only snooze then.
                }
                setReleaseProofSnooze(currentDate);
              }}
              type="button"
            >
              Not now
            </button>
          </div>
        </section>
      ) : null}
      {launchProjection.project?.mode !== 'real' && !demoExplored ? (
        <section aria-labelledby="lcc-welcome-title" className="lcc-welcome">
          <span aria-hidden="true" className="lcc-welcome__mark">
            <svg viewBox="0 0 512 512" width="40" height="40" fill="none" stroke="currentColor"
              strokeWidth="58" strokeLinecap="round" strokeLinejoin="round">
              <path d="M150 172 H362 M256 172 V300 Q256 352 308 352 H356" />
            </svg>
          </span>
          <h1 id="lcc-welcome-title">Welcome to Turn OS</h1>
          <p>
            Set up your first property to begin managing crews, Units,
            inspections, and walks. Paper remains the official TurnBoard.
          </p>
          <div className="lcc-welcome__actions">
            <button
              className="lcc-welcome__primary"
              onClick={() => handleMoreNavigation('setup')}
              type="button"
            >
              Start Property Setup
            </button>
            <button
              className="lcc-welcome__secondary"
              onClick={() => setDemoExplored(true)}
              type="button"
            >
              Explore the demo first
            </button>
          </div>
        </section>
      ) : route.homeSummary === 'today-task' ? (
        canonicalProjectionResult.projection && startDayResolution.values ? (
          <TodayTaskDetail
            onBack={() => navigate('dashboard')}
            onOpenUnit={(unitId) => navigate('unitDetail', unitId)}
            todayUnits={[...new Map(
              (todayTask?.sections ?? []).map((section) => [section.unitId, section.unitId]),
            ).keys()].map((unitId) => ({
              sectionCount: (todayTask?.sections ?? [])
                .filter((section) => section.unitId === unitId).length,
              unitId,
              unitNumber: unitNumberById.get(unitId) ?? unitId,
            }))}
            onOpenQueue={(queueId) => navigate(
              'dashboard',
              undefined,
              { homeSummary: queueId },
            )}
            onReviewStartDay={() => {
              setHomeMode('start-day');
              navigate('dashboard');
            }}
            projection={canonicalProjectionResult.projection}
            startDayValues={startDayResolution.values}
          />
        ) : (
          <NativeDetailShell
            description="Turn OS could not build a safe task detail from the current project."
            onBack={() => navigate('dashboard')}
            statusLabel="Nothing was changed"
            title="Today’s Task"
          >
            <div className="lcc-host-alert lcc-host-alert--error" role="alert">
              <AlertTriangle aria-hidden="true" size={18} />
              <span>
                {canonicalProjectionResult.error
                  ?? startDayResolution.error
                  ?? 'Activate the personal project setup before reviewing Today’s Task.'}
              </span>
            </div>
          </NativeDetailShell>
        )
      ) : route.homeSummary ? (
        <NativeHomeSummaryPage
          destination={selectNativeHomeSummary(
            canonicalConsumers?.homeRecords
              ?? (requiresCanonicalPersonalProjection ? [] : launchProjection.homeRecords),
            route.homeSummary,
          )}
          onBack={() => navigate('dashboard')}
          onOpenRecord={(record: NativeHomeRecord) => openDestination(record.destinationId)}
          onStartWalk={() => navigate('units', undefined, { fieldWorkflow: 'walk' })}
        />
      ) : homeMode === 'start-day' ? (
        activeProject?.fieldConfiguration ? (
          <FastStartDayFlow
            configuration={activeProject.fieldConfiguration}
            contacts={activeProjectContacts}
            crewOptions={fastStartDayCrewOptions}
            currentDate={currentDate}
            onAddCrew={addDayCrew}
            onCancel={() => setHomeMode('day')}
            onStartDay={startFastDay}
            projectId={activeProject.id}
            propertyName={propertyRoster.propertyName}
            doneUnitIds={doneUnitIds}
            rosterUnits={fastStartDayRosterUnits}
          />
        ) : (
          <NativeDetailShell
            description="Activate Project Setup before recording a Day Session."
            onBack={() => setHomeMode('day')}
            statusLabel="Nothing was changed"
            title="Start Day unavailable"
          >
            <div className="lcc-host-alert lcc-host-alert--error" role="alert">
              <AlertTriangle aria-hidden="true" size={18} />
              <span>
                The active personal project does not have a confirmed field configuration.
              </span>
            </div>
          </NativeDetailShell>
        )
      ) : homeMode === 'manual-release' ? (
        <ManualReleaseReview
          actor="Los"
          contacts={activeProjectContacts.map((contact) => contact.name)}
          onAttachNotes={(notes) => {
            const saved = commitDataNow((current) => {
              let next = current;
              for (const note of notes) {
                const result = appendPersonalNoteActivity(next, {
                  unitId: note.unitId,
                  wording: `From Joseph's release: ${note.text}`,
                });
                if (result.ok) next = result.data;
              }
              return next;
            });
            if (saved && notes.length > 0) {
              setFieldToast(`${notes.length} note${notes.length === 1 ? '' : 's'} from Joseph's message saved to the units.`);
            }
          }}
          currentDate={activeDaySession?.date ?? currentDate}
          onBack={() => setHomeMode('day')}
          onConfirm={(batch) => {
            const saved = commitDataNow((current) =>
              appendManualReleaseBatchToActiveDay(current, batch));
            if (!saved) return false;
            setFieldToast(
              `Saved — ${batch.items.length} released section${batch.items.length === 1 ? '' : 's'} added to today.`,
            );
            setHomeMode('day');
            return true;
          }}
          roster={propertyRoster}
          unavailableReason={
            activeDaySession
              ? undefined
              : 'Start the day before confirming released work.'
          }
        />
      ) : (
        <DayTaskWorkspace
          key={currentDate}
          accountId={operationalScope.accountId}
          supervisorName={launchProjection.project?.supervisorName?.trim() || 'Los'}
          liveBoard={liveBoard}
          onAdvanceUnitTrade={advanceUnitTrade}
          glance={homeGlance}
          needsEyes={needsEyes}
          onOpenNeedsEyesUnit={(unitId, trade) => {
            unitDetailOriginRef.current = 'home';
            unitDetailTradeRef.current = trade;
            navigate('unitDetail', unitId);
          }}
          onOpenCrew={(crewId) => {
            crewOriginHomeRef.current = true;
            navigate('crews', undefined, { crewId });
          }}
          activeWalkSessionId={trackCState.activeWalk?.id}
          crews={dayCrewOptions}
          currentDate={currentDate}
          events={dayEvents}
          existingSessions={daySessions}
          initialView="home"
          initialSession={activeDaySession}
          initialTask={todayTask}
          onDayStateChange={(change) => {
            // Day lifecycle and recovery decisions are all rare, high-value truth
            // — persist synchronously so none is lost in the deferred-write window.
            return commitDataNow((current) =>
              applyDayTaskStateChange(current, change));
          }}
          onExternalAction={handleQuickAction}
          onOpenQueueId={(queueId) => navigate(
            'dashboard',
            undefined,
            { homeSummary: queueId },
          )}
          onOpenTaskDetail={() => navigate(
            'dashboard',
            undefined,
            { homeSummary: 'today-task' },
          )}
          onOpenActiveWalk={(walkSessionId) => navigate(
            'units',
            undefined,
            { fieldWorkflow: 'walk', walkSessionId },
          )}
          acceptedWalkMeta={acceptedWalkMeta}
          releaseWorkTypes={releaseWorkTypes}
          onOpenCrews={() => navigate('crews')}
          onPeekUnit={(unitId) => setPeekTarget({ kind: 'unit', unitId })}
          onPeekQueue={(queueId, label) => {
            // Which units sit behind this chip right now — computed from live
            // TrackC state so the peek always matches the count.
            const inState = (predicate: (work: ReturnType<typeof projectTrackCUnitWork>[number]) => boolean) =>
              trackCState.units
                .filter((unit) => projectTrackCUnitWork(trackCState, unit.id)
                  .some((work) => work.release === 'released' && predicate(work)))
                .map((unit) => unit.id);
            const unitIds = queueId === 'working'
              ? inState((w) => ['working', 'assigned'].includes(w.execution) && !w.callbackOpen)
              : queueId === 'needs-inspection'
                ? inState((w) => w.execution === 'crew-reported-complete' && !w.callbackOpen)
                : queueId === 'callbacks'
                  ? inState((w) => w.callbackOpen)
                  : queueId === 'ready-to-walk'
                    ? inState((w) => w.inspection === 'los-passed' && w.property !== 'property-accepted')
                    : inState((w) => w.access !== 'clear');
            setPeekTarget({ kind: 'queue', label, unitIds });
          }}
          josephContact={(() => {
            const contact = activeProjectContacts.find((candidate) =>
              /jose/i.test(candidate.name))
              ?? activeProjectContacts.find((candidate) => candidate.isPrimary)
              ?? activeProjectContacts[0];
            return contact?.phone
              ? { name: contact.name.split(' ')[0], phone: contact.phone }
              : undefined;
          })()}
          onOpenUnitFromHome={(unitId, trade) => {
            unitDetailOriginRef.current = 'home';
            unitDetailTradeRef.current = trade;
            homeScrollRef.current = window.scrollY;
            navigate('unitDetail', unitId);
          }}
          onExportBackup={async () => {
            const result = await buildJsonBackupWithLocalPhotos(data);
            downloadTextFile(
              `turn-supervisor-backup-${currentDate}.json`,
              result.text,
              'application/json',
            );
            return result.missingPhotoFiles > 0
              ? `Backup saved with ${result.includedPhotoFiles} photo file(s); ${result.missingPhotoFiles} photo record(s) have no file on this device. Move it to iCloud Drive.`
              : 'Backup saved. Move the file from Downloads to iCloud Drive and tonight is safe.';
          }}
          onExportReport={async (dayNumber) => {
            const report = buildDailyReportData({
              date: activeDaySession?.date ?? currentDate,
              dayNumber,
              state: trackCState,
              supervisor: launchProjection.project?.supervisorName?.trim() || 'Los',
            });
            const filename = await saveDailyReportPdf(report);
            return `Report saved as ${filename}. Share it from Files whenever you need to.`;
          }}
          onRequestStartDay={() => setHomeMode('start-day')}
          onViewChange={setDayWorkspaceView}
          propertyRoster={propertyRoster}
          releases={dailyReleases}
          queueCounts={boardQueueCounts}
          startDayPrefill={startDayPrefill}
          startedBy="Los"
        />
      )}
    </div>
  ) : route.view === 'more' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      {moreDetailPage === 'crews' ? (
        crewEditor ? (
          <TrackBCrewFormPage
            key={crewEditor.mode === 'edit' ? crewEditor.crewId : 'new-crew'}
            initialCrew={editingCrew}
            mode={crewEditor.mode}
            onBack={() => setCrewEditor(null)}
            onCancel={() => setCrewEditor(null)}
            onSave={saveCrew}
            statusLabel="Personal project contact"
          />
        ) : (
          <TrackBCrewListPage
            backLabel="Back from Crews"
            crews={crewRecords}
            onAdd={() => setCrewEditor({ mode: 'add' })}
            onBack={() => setMoreDetailPage(null)}
            onEdit={(crew) => setCrewEditor({ crewId: crew.id, mode: 'edit' })}
            statusLabel="Paint and Clean only"
          />
        )
      ) : moreDetailPage === 'forms' ? (
        <OfficialPdsFormsPage onBack={() => setMoreDetailPage(null)} />
      ) : moreDetailPage === 'my-notes' ? (
        <MyNotesPage
          data={data}
          onBack={() => setMoreDetailPage(null)}
          onNewNote={() => {
            setPlusInitialScreen('note');
            setPlusOpen(true);
          }}
          onOpenUnit={(unitId) => {
            setMoreDetailPage(null);
            navigate('unitDetail', unitId);
          }}
        />
      ) : moreDetailPage === 'portal' ? (
        <PortalPage
          onBack={() => setMoreDetailPage(null)}
          propertyName={launchProjection.propertyName}
          supervisor={launchProjection.project?.supervisorName?.trim() || 'Los'}
          state={activeFieldState ?? trackCState}
        />
      ) : moreDetailPage === 'profile' ? (
        <ProfilePrivacyScrollRegion kind="profile">
          <TrackBProfilePage
            appVersion={`0.1.0 · build ${import.meta.env.VITE_ALPHA_GIT_SHA?.trim() || "dev"}`}
            currentProperty={launchProjection.propertyName}
            dataPermissions={[
              {
                detail: 'No tenant information is permitted in this personal workspace.',
                label: 'Tenant information',
                value: 'Keep out',
              },
              {
                detail: 'Confirm property and company permission before storing field photos.',
                label: 'Field photos',
                value: 'Review needed',
              },
            ]}
            name={launchProjection.project?.supervisorName || 'Los'}
            onBack={() => setMoreDetailPage(null)}
            onRequestSignOut={requestSignOut}
            preferences={[
              'Local-first field capture',
              'Paper remains authoritative',
              'No automatic messages',
            ]}
            role="Turn Supervisor"
            statusLabel={moreStatus}
          />
        </ProfilePrivacyScrollRegion>
      ) : moreDetailPage === 'privacy' ? (
        <ProfilePrivacyScrollRegion kind="privacy">
          <NativeDetailShell
            description="Review the personal-app boundary before recording field information."
            onBack={() => setMoreDetailPage(null)}
            statusLabel="Permissions remain evidence-gated"
            title="Privacy"
          >
            <GroupedInsetSection
              label="Current boundary"
              footer="These labels do not grant company or property permission."
            >
              <GroupedInsetRow
                detail="Do not record resident names, contact details, or other tenant information."
                label="Tenant information"
                value="Keep out"
              />
              <GroupedInsetRow
                detail="Use only after property and company permission is confirmed."
                label="Photos and documents"
                value="Review needed"
              />
              <GroupedInsetRow
                detail="No autonomous approval, payroll, or external communication."
                label="Consequential actions"
                value="Human only"
              />
            </GroupedInsetSection>
          </NativeDetailShell>
        </ProfilePrivacyScrollRegion>
      ) : moreDetailPage === 'day-history' ? (
        <NativeDetailShell
          description="Every day of this Turn, newest first. Paper remains official."
          onBack={() => setMoreDetailPage(null)}
          statusLabel="Personal record"
          title="Day History"
        >
          {daySessions.length === 0 ? (
            <p className="lcc-host-status">No Day Sessions yet — start your first day.</p>
          ) : (() => {
            const sorted = [...daySessions]
              .sort((left, right) => right.date.localeCompare(left.date));
            const index = Math.min(historyDayOffset, sorted.length - 1);
            return [
              <div className="lcc-day-pager" key="pager">
                {index < sorted.length - 1 ? (
                  <button
                    aria-label="Older day"
                    onClick={() => setHistoryDayOffset(index + 1)}
                    type="button"
                  >
                    ← Day {sorted.length - (index + 1)}
                  </button>
                ) : <span />}
                <strong>Day {sorted.length - index}</strong>
                {index > 0 ? (
                  <button
                    aria-label="Newer day"
                    onClick={() => setHistoryDayOffset(index - 1)}
                    type="button"
                  >
                    Day {sorted.length - (index - 1)} →
                  </button>
                ) : <span />}
              </div>,
              ...[sorted[index]].map((historySession) => {
              const sessionEvents = dayEvents.filter((event) =>
                event.daySessionId === historySession.daySessionId);
              const callbacks = sessionEvents.filter((event) =>
                event.eventType === 'callback-opened').length;
              const acceptedByUnit = new Map<string, Set<string>>();
              for (const event of sessionEvents) {
                if (event.eventType !== 'property-accepted' || !event.unitId) continue;
                const trades = acceptedByUnit.get(event.unitId) ?? new Set<string>();
                if (event.trade) trades.add(event.trade);
                acceptedByUnit.set(event.unitId, trades);
              }
              const acceptedLabel = [...acceptedByUnit.entries()]
                .map(([unitId, trades]) =>
                  `${unitNumberById.get(unitId) ?? unitId} (${[...trades].join(' + ')})`)
                .join(', ');
              // Everything reads in beds + common areas (a bed = a bedroom —
              // the property manager's language). Field events carry the
              // section, so split every count; scoped to this day by date.
              const splitLabel = (beds: number, commons: number) => [
                beds > 0 ? `${beds} bed${beds === 1 ? '' : 's'}` : '',
                commons > 0 ? `${commons} common area${commons === 1 ? '' : 's'}` : '',
              ].filter(Boolean).join(' · ') || '0';
              const dayFieldEvents = trackCState.events.filter((event) =>
                localEventDate(event.recordedAt) === historySession.date);
              // A bed counts ONCE even if events repeat (mistap → reopen →
              // re-report emits duplicates): dedupe by unit+trade+section.
              const completeSplit = { beds: 0, commons: 0 };
              const passSplit = { beds: 0, commons: 0 };
              const crewSplit = new Map<string, { beds: number; commons: number }>();
              const seenComplete = new Set<string>();
              const seenCrew = new Set<string>();
              const seenPass = new Set<string>();
              for (const event of dayFieldEvents) {
                const isCommon = event.target.section === 'common';
                const sectionKey = `${event.target.unitId}:${event.target.trade}:${event.target.section}`;
                if (event.eventType === 'crew-reported-complete') {
                  if (!seenComplete.has(sectionKey)) {
                    seenComplete.add(sectionKey);
                    completeSplit[isCommon ? 'commons' : 'beds'] += 1;
                  }
                  if (event.crewId && !seenCrew.has(`${event.crewId}:${sectionKey}`)) {
                    seenCrew.add(`${event.crewId}:${sectionKey}`);
                    const line = crewSplit.get(event.crewId) ?? { beds: 0, commons: 0 };
                    line[isCommon ? 'commons' : 'beds'] += 1;
                    crewSplit.set(event.crewId, line);
                  }
                }
                if (event.eventType === 'los-passed' || event.eventType === 'callback-resolved') {
                  if (!seenPass.has(sectionKey)) {
                    seenPass.add(sectionKey);
                    passSplit[isCommon ? 'commons' : 'beds'] += 1;
                  }
                }
              }
              const crewBreakdown = [...crewSplit.entries()]
                .map(([crewId, line]) => {
                  const name = crewRecords.find((crew) => crew.id === crewId)?.name ?? crewId;
                  return `${name} — ${splitLabel(line.beds, line.commons)}`;
                })
                .join('   ·   ');
              // Per-unit breakdown for the day, in the Home format: who did what,
              // which rooms, the task, and how far it got — grouped Paint/Clean,
              // property-approved included instead of vanishing.
              const dayRowMap = new Map<string, {
                unitId: string; unitNumber: string; trade: string;
                crewIds: Set<string>; beds: Set<string>; commons: number;
                rank: number;
              }>();
              for (const event of dayFieldEvents) {
                if (!event.target.unitId || !event.target.trade) continue;
                const rank = event.eventType === 'property-accepted' ? 4
                  : (event.eventType === 'los-passed' || event.eventType === 'callback-resolved') ? 3
                    : event.eventType === 'crew-reported-complete' ? 2
                      : event.eventType === 'callback-opened' ? 1 : 0;
                if (rank === 0 && event.eventType !== 'assignment-confirmed') continue;
                const key = `${event.target.unitId}:${event.target.trade}`;
                const row = dayRowMap.get(key) ?? {
                  beds: new Set<string>(), commons: 0, crewIds: new Set<string>(),
                  rank: 0, trade: event.target.trade, unitId: event.target.unitId,
                  unitNumber: unitNumberById.get(event.target.unitId) ?? event.target.unitId,
                };
                if (event.crewId) row.crewIds.add(event.crewId);
                if (rank >= 2) {
                  if (event.target.section === 'common') row.commons += 0;
                  else row.beds.add(event.target.section);
                  if (event.target.section === 'common') row.commons = 1;
                }
                row.rank = Math.max(row.rank, rank);
                dayRowMap.set(key, row);
              }
              const rankLabel = (rank: number) => rank === 4
                ? 'Property approved'
                : rank === 3 ? 'Passed my inspection'
                  : rank === 2 ? 'Crew reported done' : 'Callback opened';
              const dayGroup = (trade: 'paint' | 'clean') => {
                const rows = [...dayRowMap.values()]
                  .filter((row) => row.trade === trade && row.rank >= 1)
                  .sort((left, right) =>
                    right.rank - left.rank
                    || left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }));
                if (rows.length === 0) return null;
                return (
                  <div className="lcc-dayhist-group" key={`${historySession.daySessionId}:${trade}`}>
                    <h3>{trade === 'paint' ? 'PAINT' : 'CLEAN'} · {rows.length}</h3>
                    {rows.map((row) => {
                      const crew = [...row.crewIds]
                        .map((id) => crewRecords.find((c) => c.id === id)?.name)
                        .filter(Boolean).join(' + ') || 'unassigned';
                      const task = trade === 'paint'
                        ? trackCTradeWorkTypeLabel(trackCState, row.unitId, 'paint')
                        : '';
                      return (
                        <button
                          className={`lcc-dayhist-row is-rank${row.rank}`}
                          key={`${row.unitId}:${row.trade}`}
                          onClick={() => {
                            setMoreDetailPage(null);
                            unitDetailOriginRef.current = undefined;
                            unitDetailTradeRef.current = trade;
                            navigate('unitDetail', row.unitId);
                          }}
                          type="button"
                        >
                          <strong>{row.unitNumber}</strong>
                          <div className="lcc-dayhist-row__body">
                            <small>
                              <b>{crew}</b>
                              {row.rank >= 2 ? ` · ${splitLabel(row.beds.size, row.commons)}` : ''}
                              {task ? ` · ${task}` : ''}
                            </small>
                            <span className="lcc-dayhist-row__status">{rankLabel(row.rank)}</span>
                          </div>
                          <span aria-hidden="true" className="lcc-dayhist-row__chev">›</span>
                        </button>
                      );
                    })}
                  </div>
                );
              };
              // Paint tasks by crew — Los tracks who did how many cut-ins and
              // on which units. Per crew, per work type, the units they worked.
              const paintTaskByCrew = (() => {
                const byCrew = new Map<string, Map<string, Set<string>>>();
                for (const row of dayRowMap.values()) {
                  if (row.trade !== 'paint' || row.rank < 2) continue;
                  const crew = [...row.crewIds]
                    .map((id) => crewRecords.find((c) => c.id === id)?.name)
                    .filter(Boolean).join(' + ') || 'unassigned';
                  const unit = trackCState.units.find((u) => u.id === row.unitId);
                  if (!unit) continue;
                  const typeMap = byCrew.get(crew) ?? new Map<string, Set<string>>();
                  for (const fact of unit.workFacts) {
                    if (fact.trade !== 'paint' || fact.release !== 'released') continue;
                    const label = paintWorkTypeLabel(fact.workType);
                    const set = typeMap.get(label) ?? new Set<string>();
                    set.add(unit.unitNumber);
                    typeMap.set(label, set);
                  }
                  byCrew.set(crew, typeMap);
                }
                return [...byCrew.entries()];
              })();
              return (
                <div key={historySession.daySessionId}>
                {dayGroup('paint')}
                {dayGroup('clean')}
                {paintTaskByCrew.length > 0 ? (
                  <GroupedInsetSection
                    key={`${historySession.daySessionId}:bycrew`}
                    label="Paint tasks by crew"
                  >
                    <div className="lcc-bycrew">
                      {paintTaskByCrew.map(([crew, typeMap]) => (
                        <div className="lcc-bycrew__crew" key={crew}>
                          <strong>{crew}</strong>
                          {[...typeMap.entries()]
                            .sort((left, right) => right[1].size - left[1].size)
                            .map(([type, units]) => (
                              <p key={type}>
                                <b>{units.size} {type}</b>
                                {' — '}
                                {[...units].sort((a, b) =>
                                  a.localeCompare(b, undefined, { numeric: true })).join(', ')}
                              </p>
                            ))}
                        </div>
                      ))}
                    </div>
                  </GroupedInsetSection>
                ) : null}
                <GroupedInsetSection
                  key={`${historySession.daySessionId}:totals`}
                  label={`Day ${daySessions.length - index} · ${(() => {
                    const [y, m, d] = historySession.date.split('-').map(Number);
                    return new Date(y, (m ?? 1) - 1, d ?? 1)
                      .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                  })()}${historySession.status === 'closed' ? '' : ' · open'}`}
                >
                  <GroupedInsetRow
                    detail={crewBreakdown || undefined}
                    label="Crew reported complete"
                    value={splitLabel(completeSplit.beds, completeSplit.commons)}
                  />
                  <GroupedInsetRow
                    label="Passed my inspection"
                    value={splitLabel(passSplit.beds, passSplit.commons)}
                  />
                  <GroupedInsetRow label="Callbacks opened" value={String(callbacks)} />
                  <GroupedInsetRow
                    detail={acceptedLabel || undefined}
                    label="Units property accepted"
                    value={String(acceptedByUnit.size)}
                  />
                  <button
                    className="lcc-day-history-pdf"
                    onClick={() => {
                      setMoreStatus('Building the day report…');
                      const report = buildDailyReportData({
                        date: historySession.date,
                        dayNumber: daySessions.length - index,
                        state: trackCState,
                        supervisor: launchProjection.project?.supervisorName?.trim() || 'Los',
                      });
                      void saveDailyReportPdf(report)
                        .then((filename) => setMoreStatus(`Report saved as ${filename}.`))
                        .catch(() => setMoreStatus('The report could not be created. Try again.'));
                    }}
                    type="button"
                  >
                    Save Day {daySessions.length - index} report (PDF)
                  </button>
                </GroupedInsetSection>
                </div>
              );
              })];
          })()}
        </NativeDetailShell>
      ) : moreDetailPage === 'standard' ? (
        <NativeDetailShell
          description="The bar, one tap away on a walk. Correct anything that drifts — this is your playbook, not mine."
          onBack={() => setMoreDetailPage(null)}
          statusLabel="Field Standard"
          title="The Standard"
        >
          {[
            ['Clean pass (Paige’s bar)', [
              'Shower heads: orange/white water stains FAIL; green oxidation is borderline.',
              'Zero hair, anywhere. All four corners. Floors not sticky.',
              'Stainless sinks wiped DRY — no water spots.',
            ]],
            ['Paint pass', [
              'Full coverage, clean cut lines, no misses or holidays.',
              'Walk with Joseph sets the bar — match it, then hold every unit to it.',
            ]],
            ['Change orders', [
              'Wall hole bigger than a quarter = change order. Smaller = in scope.',
              'Tubs = change order. Flag Tony immediately (Guillermo / resurfacers).',
              'Resurface BEFORE cleaners, or it needs a re-clean.',
              'Common-area paint: crew flags → you text Tony PICTURES → Tony decides. The thread is the proof.',
            ]],
            ['The X rule (Tony)', [
              'Crew reports done + it looks done → X it, even with small callbacks (fix them on the spot).',
              'Only skip the X if it’s flat-out not done.',
            ]],
            ['Pay', [
              'Did the work = gets paid, checked or not. Unsure? Send Rocky to verify.',
              'Re-clean through no fault of the crew = paid twice.',
            ]],
            ['Walking', [
              'Batches of 5: assign 5, walk 5. Proven crews graduate to 10. Never walk 20 at once.',
            ]],
            ['Wall-board marks', [
              '/ released · name = assigned · X = done · CC = approved · highlight = pay week.',
            ]],
            ['Staff units', [
              'A unit marked Staff = you walk it alone, no crew. See work? Photo Joseph → he approves → then it’s released.',
            ]],
          ].map(([heading, lines]) => (
            <GroupedInsetSection key={heading as string} label={heading as string}>
              <div className="lcc-standard-card">
                {(lines as string[]).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </GroupedInsetSection>
          ))}
        </NativeDetailShell>
      ) : moreDetailPage === 'storage' ? (
        <NativeDetailShell
          description="A read-only view of records currently held by this personal app."
          onBack={() => setMoreDetailPage(null)}
          statusLabel={backupStatus.label}
          title="Storage"
        >
          {storageUsage && storageUsage.level !== 'ok' ? (
            <div
              className="lcc-host-alert"
              role="status"
              style={{
                borderColor: storageUsage.level === 'critical' ? '#c0362c' : '#b07414',
                color: storageUsage.level === 'critical' ? '#c0362c' : '#8a5a10',
              }}
            >
              {storageUsage.level === 'critical'
                ? `Storage is ${storageUsage.percentUsed}% full. Export a backup now, then start a fresh device backup — saving can stop when this device is full.`
                : `Storage is ${storageUsage.percentUsed}% full. Keep exporting your nightly backup; consider a fresh backup file if it keeps climbing.`}
            </div>
          ) : null}
          <GroupedInsetSection
            label="On this device"
            footer="Use Backup and Restore for guarded recovery controls."
          >
            {storageUsage ? (
              <GroupedInsetRow
                detail={`About ${storageUsage.approxMb} MB of this device's app storage.`}
                label="Storage used"
                value={`${storageUsage.percentUsed}%`}
              />
            ) : null}
            <GroupedInsetRow label="Units" value={String(data.units.length)} />
            <GroupedInsetRow label="Activity records" value={String(data.activityLogs.length)} />
            <GroupedInsetRow label="Photo records" value={String(data.photoNotes.length)} />
            <GroupedInsetRow
              detail={backupStatus.detail}
              label="Latest local save"
              value={backupStatus.label}
            />
            <GroupedInsetRow
              detail={storagePersistence === 'persistent'
                ? 'The browser granted protected persistent storage.'
                : 'Saving works normally. Keep a current JSON backup as your guarantee.'}
              label="Protected storage"
              value={storagePersistence === 'persistent' ? 'Granted' : 'Best effort'}
            />
          </GroupedInsetSection>
          {aiAuth.available && aiAuth.signedIn ? (
            <GroupedInsetSection
              label="Account"
              footer="Sign-in powers photo import and AI assist. Field logging never needs it."
            >
              <GroupedInsetRow label="Signed in as" value={aiAuth.email ?? ''} />
              <button
                className="lcc-day-history-pdf"
                disabled={aiAuth.busy}
                onClick={() => {
                  void aiAuth.signOut().then(() =>
                    setMoreStatus('Signed out. Photo import will ask for sign-in again.'));
                }}
                type="button"
              >
                Sign out
              </button>
            </GroupedInsetSection>
          ) : null}
          {launchProjection.project?.mode === 'real' ? (
            <GroupedInsetSection
              label="Start fresh"
              footer="Archiving hides this project and returns you to setup. Every record is kept on this device — nothing is deleted, and it can be restored later."
            >
              <button
                className="lcc-archive-project"
                onClick={() => {
                  const name = launchProjection.propertyName || 'this project';
                  const sure = window.confirm(
                    `Archive ${name} and start fresh?\n\nUse this when the current project was a test run. `
                    + 'All records are kept on this device — nothing is deleted. You will land on property setup for the real Turn.',
                  );
                  if (!sure) return;
                  const saved = commitDataNow((current) =>
                    archiveProject(current, current.activeProjectId));
                  setMoreStatus(saved
                    ? `${name} archived. Set up the official Turn whenever you're ready.`
                    : 'The project could not be archived. Nothing was changed.');
                  if (saved) {
                    setMoreDetailPage(null);
                    navigate('dashboard');
                  }
                }}
                type="button"
              >
                Archive this project — start fresh
              </button>
            </GroupedInsetSection>
          ) : null}
          <GroupedInsetSection
            label="Total fresh start"
            footer="Erases every project, draft, and record saved on this phone (test data included). Sign-in and appearance are kept. This cannot be undone — export a backup first if anything matters."
          >
            <button
              className="lcc-archive-project"
              onClick={async () => {
                const sure = window.confirm(
                  'Erase EVERYTHING on this phone and start completely fresh?\n\n'
                  + 'Every project, roster, day, and draft on this device will be gone. '
                  + 'This cannot be undone.',
                );
                if (!sure) return;
                const again = window.confirm('Last check — erase all Turn OS data on this phone?');
                if (!again) return;
                try {
                  // Keep sign-in (sb-*) and appearance; wipe every app record/draft
                  // AND the photo files in IndexedDB — fresh start means fresh.
                  const keep = (key: string) =>
                    key.startsWith('sb-') || key.startsWith('turn-os:appearance');
                  for (const key of Object.keys(window.localStorage)) {
                    if (!keep(key)) window.localStorage.removeItem(key);
                  }
                  window.sessionStorage.clear();
                  await clearPhotoBlobs().catch(() => undefined);
                } finally {
                  window.location.replace('/');
                }
              }}
              type="button"
            >
              Erase everything on this phone — start over
            </button>
          </GroupedInsetSection>
        </NativeDetailShell>
      ) : (
        <ThemeAwareMorePage
          onBack={() => handlePrimaryNavigation('home')}
          onNavigate={handleMoreNavigation}
          onPreferenceChange={theme.setPreference}
          onRequestSignOut={requestSignOut}
          preference={theme.preference}
          profile={{
            currentProperty: launchProjection.propertyName,
            name: launchProjection.project?.supervisorName || 'Los',
            role: 'Turn Supervisor',
          }}
          reducedMotion={theme.reducedMotion}
          resolvedTheme={theme.resolvedTheme}
          statusLabel={moreStatus}
        />
      )}
    </div>
  ) : route.view === 'crews' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      {crewEditor ? (
        <TrackBCrewFormPage
          key={crewEditor.mode === 'edit' ? crewEditor.crewId : 'new-crew'}
          initialCrew={editingCrew}
          mode={crewEditor.mode}
          onBack={() => setCrewEditor(null)}
          onCancel={() => setCrewEditor(null)}
          onSave={saveCrew}
          statusLabel="Personal project contact"
        />
      ) : (
        <TrackBCrewListPage
          crews={crewRecords}
          onAdd={() => setCrewEditor({ mode: 'add' })}
          onBack={() => navigate('more')}
          onEdit={(crew) => setCrewEditor({ crewId: crew.id, mode: 'edit' })}
          statusLabel="Paint and Clean only"
        />
      )}
    </div>
  ) : route.view === 'setup' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      <p aria-live="polite" className="lcc-host-status">
        {setupBusy ? 'Saving… ' : ''}{setupStatus}
      </p>
      {setupDraft ? (
        <ProjectSetupFlow
          activationErrors={setupErrors}
          crewOptions={dayCrewOptions.map((crew) => ({
            id: crew.id,
            name: crew.name,
            trade: crew.trade === 'Paint' ? 'paint' : 'clean',
          }))}
          currentStep={setupStep}
          draft={setupDraft}
          existingProjectRequiresConfirmation={data.projects.some(
            (project) => project.id === setupDraft.project.id,
          )}
          onActivate={() => {
            void activateProject();
          }}
          onAddContact={() => {
            if (!setupDraft) return;
            const nextDraft = addProjectContact(
              setupDraft,
              createId('property-contact'),
              nowISO(),
            );
            setSetupDraft(nextDraft);
            saveSetupDraft(nextDraft, setupStep);
          }}
          onDraftChange={(draft) => {
            setSetupDraft(draft);
            saveSetupDraft(draft, setupStep);
            setSetupErrors([]);
          }}
          onExit={() => navigate('dashboard')}
          onRemoveContact={(contactId) => {
            if (!setupDraft) return;
            const nextDraft = removeProjectContact(setupDraft, contactId);
            setSetupDraft(nextDraft);
            saveSetupDraft(nextDraft, setupStep);
          }}
          onStepChange={(nextStep) => {
            setSetupStep(nextStep);
            if (setupDraft) saveSetupDraft(setupDraft, nextStep);
          }}
        />
      ) : (
        <NativeDetailShell
          description="Turn OS could not prepare a safe activation draft."
          onBack={() => navigate('more')}
          statusLabel="Nothing was changed"
          title="Project setup unavailable"
        >
          <div className="lcc-host-alert lcc-host-alert--error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{setupErrors[0] ?? 'Return to More and try opening setup again.'}</span>
          </div>
        </NativeDetailShell>
      )}
    </div>
  ) : route.view === 'reports' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      <TrackBReportsAndProofPage
        backupStatus={backupStatus}
        counts={reportCounts}
        dataScopeLabel="Personal app records only"
        onBack={() => navigate('more')}
        syncStatus={syncStatus}
      />
    </div>
  ) : (
    <div className="lcc-host-stack">
      {hostAlerts}
      <NativeDetailShell
        description={legacyToolDescription[route.view] ?? 'Existing guarded Turn OS tool.'}
        onBack={legacyToolBack}
        statusLabel="Existing guarded tool · personal app only"
        title={contentTitle}
      >
        {legacySurface}
      </NativeDetailShell>
    </div>
  );

  const shellDetailMode = route.view === 'search'
    || route.view === 'notifications'
    || route.view === 'setup'
    || route.view === 'unitDetail'
    || route.view === 'assignments'
    || route.fieldWorkflow === 'walk'
    || (route.view === 'dashboard' && homeMode !== 'day')
    || (route.view === 'dashboard'
      && !route.homeSummary
      && homeMode === 'day'
      && dayWorkspaceView !== 'home'
      && dayWorkspaceView !== 'queue')
    || (route.view === 'crews' && Boolean(route.crewId))
    || Boolean(moreDetailPage)
    || Boolean(crewEditor);

  return (
    <>
      <Wave2A2UnifiedShell
        activeDestination={primaryDestinationForRoute(route.view)}
        backgroundInert={
          captureOpen || plusOpen || Boolean(selectedActivity) || trackCDialogOpen
        }
        contentFocusKey={buildAppHash(route)}
        contentContained={
          boardRouteActive
          || fieldOpsRouteActive
          || moreDetailPage === 'profile'
          || moreDetailPage === 'privacy'
        }
        contentDialogOpen={boardDialogOpen || trackCDialogOpen}
        contentOwnsMain={route.view === 'search' || route.view === 'notifications'}
        contentTitle={contentTitle}
        contentScrollRestoration={{
          key: currentRouteKey,
          onScrollTopChange: (scrollTop) => {
            tabRouteMemoryRef.current = rememberTrackCTabScroll(
              tabRouteMemoryRef.current,
              currentRouteTab,
              currentRouteKey,
              scrollTop,
            );
          },
          requestToken: scrollRequestToken,
          restore: routeSupportsScrollRestoration,
          scrollTop: routeSupportsScrollRestoration
            ? rememberedRoute.scrollTop
            : 0,
        }}
        dateLabel={launchProjection.dateLabel}
        detailMode={shellDetailMode}
        onboarding={launchProjection.project?.mode !== 'real' && !demoExplored}
        notificationCount={nativeNotifications.filter((item) => !item.read).length}
        onNavigate={handlePrimaryNavigation}
        onOpenHome={() => handlePrimaryNavigation('home')}
        onOpenIntelligence={() => undefined}
        onOpenNotifications={() => openFullPage('notifications')}
        onOpenPlus={openNativePlus}
        onOpenSearch={() => openFullPage('search')}
        propertyName={launchProjection.propertyName}
        theme={theme}
      >
        {shellContent}
      </Wave2A2UnifiedShell>
      <Wave2A2OverlayBoundary theme={theme}>
        <CopilotView
          ref={copilotRef}
          commandSourceRequest={commandSourceRequest}
          data={data}
          isOpen={captureOpen}
          onCaptureCompleted={mirrorCompletedBoardCapture}
          onClose={closeCapture}
          onOpenBackup={() => navigate('export')}
          onNavigate={navigate}
          onRetrySave={retrySave}
          presentation="overlay"
          saveStatus={saveStatus}
          setData={setData}
        />
        <TrackCNativeFlow
          actionAvailability={TRACK_C_PRIMARY_SAFE_PLUS_ACTIONS}
          data={data}
          initialScreen={plusInitialScreen}
          initialUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
          onDismiss={() => setPlusOpen(false)}
          onExternalAction={handleNativePlusAction}
          onNativeFiles={handNativeFilesToCapture}
          onSave={(nextData) => setData(nextData)}
          open={plusOpen}
        />
        {blockDialogElement}
        <TurnPeek
          onClose={() => setPeekTarget(null)}
          onOpenUnit={(unitId, trade) => {
            setPeekTarget(null);
            unitDetailOriginRef.current = 'home';
            unitDetailTradeRef.current = trade;
            navigate('unitDetail', unitId);
          }}
          state={trackCState}
          target={peekTarget}
        />
        <TellTurnOS
          crews={trackCState.crews.map((crew) => ({ name: crew.name, trade: crew.trade }))}
          onApplyIntent={applyTurnIntent}
          onClose={() => setTellOsOpen(false)}
          onRouteRelease={(text) => {
            try {
              window.localStorage.setItem('turn-os:intake-prefill', text);
            } catch {
              // He can paste it himself.
            }
            setTellOsOpen(false);
            navigate('dashboard');
            setHomeMode('manual-release');
          }}
          open={tellOsOpen}
          rosterUnitNumbers={trackCState.units.map((unit) => unit.unitNumber)}
        />
        {fieldToast ? (
          <div aria-live="polite" className="lcc-field-toast" role="status">
            {fieldToast}
          </div>
        ) : null}
        <PersonalActivityDetailSheet
          item={selectedActivityView}
          onDismiss={() => {
            const returnFocus = activityReturnFocusRef.current;
            setSelectedActivity(null);
            activityReturnFocusRef.current = null;
            window.requestAnimationFrame(() => {
              if (returnFocus?.isConnected && returnFocus.getClientRects().length > 0) {
                returnFocus.focus({ preventScroll: true });
              }
            });
          }}
          onOpenUnit={(unitId) => {
            setSelectedActivity(null);
            activityReturnFocusRef.current = null;
            navigate('unitDetail', unitId);
          }}
        />
      </Wave2A2OverlayBoundary>
    </>
  );
}
