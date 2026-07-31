import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
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
} from '../wave2a2-track-c';
import {
  ManualReleaseReview,
} from '../wave2a2-core/ManualReleaseReview';
import {
  OfficialPdsFormsPage,
} from '../wave2a2-core/OfficialPdsFormsPage';
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
import { addCrewMember, updateCrewMember } from '../../lib/actions';
import { createId, nowISO } from '../../lib/constants';
import {
  buildAppHash,
  resolveAppHash,
  routeForNavigation,
  type AppNavigate,
} from '../../lib/routing';
import { persistAppDataNow, usePersistentAppData } from '../../lib/storage';
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

type MoreDetailPage = 'crews' | 'forms' | 'profile' | 'privacy' | 'storage' | null;
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
  if (view === 'activity') return 'activity';
  if (
    view === 'units'
    || view === 'unitDetail'
    || view === 'crews'
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
  if (
    view === 'units'
    || view === 'unitDetail'
    || view === 'crews'
    || view === 'assignments'
  ) return 'turnboard';
  if (view === 'activity') return 'activity';
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
  const [route, setRoute] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).route,
  );
  const [captureOpen, setCaptureOpen] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).captureRequested
      || historyRequestsCapture(),
  );
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusInitialScreen, setPlusInitialScreen] = useState<'menu' | 'note'>('menu');
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [trackCDialogOpen, setTrackCDialogOpen] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>('day');
  const [demoExplored, setDemoExplored] = useState(false);
  const [dayWorkspaceView, setDayWorkspaceView] = useState('home');
  const [manualReleaseStatus, setManualReleaseStatus] = useState('');
  const [boardSessionActivity, setBoardSessionActivity] = useState<BoardFirstActivityItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<BoardFirstActivityItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [notificationTab, setNotificationTab] = useState<NativeNotificationTab>('all');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
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
    const canonicalItems = (canonicalProjectionResult.projection?.activity ?? [])
      .map((activity): BoardFirstActivityItem => ({
      id: activity.id,
      kind: boardActivityKind(activity),
      recordedAt: activity.recordedAt,
      sourceLabel: activity.sourceRefs[0]?.label ?? 'Personal operational memory',
      synthetic: launchProjection.project?.mode === 'demo',
      title: contextualTitle(activity),
      wording: activity.wording,
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
  const nativeSearchGroups = useMemo<NativeSearchGroup[]>(() => {
    if (canonicalConsumers) return canonicalConsumers.searchGroups.map((group) => ({
      ...group,
      results: group.results.map((result) => ({ ...result })),
    }));
    if (requiresCanonicalPersonalProjection) return [];
    const groupIds = {
      crews: 'crews',
      'notes-activity': 'activity',
      units: 'units',
    } as const;
    return launchProjection.searchGroups.flatMap((group) => {
      const id = groupIds[group.id as keyof typeof groupIds];
      if (!id) return [];
      return [{
        id,
        results: group.results.map((result) => ({ ...result })),
      }];
    });
  }, [
    canonicalConsumers,
    launchProjection.searchGroups,
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
    window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
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
      navigate('unitDetail', destinationId.slice('unit:'.length));
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

  const handleNotification = useCallback((item: NativeNotificationItem) => {
    setReadNotificationIds((current) => new Set([...current, item.id]));
    openDestination(item.destinationId);
  }, [openDestination]);

  const handlePrimaryNavigation = useCallback((destination: LaunchPrimaryDestination) => {
    const tab = destination as TrackCPrimaryTab;
    const decision = selectTrackCPrimaryTab(tabRouteMemoryRef.current, tab);
    const nextRoute = resolveAppHash(decision.target.routeKey).route;
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
      setManualReleaseStatus('');
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
      navigate('issues');
      return;
    }
    if (action === 'import-work') {
      navigate('dashboard');
      setHomeMode('manual-release');
      return;
    }
    launchCaptureReturnFocusIdRef.current = 'lcc-central-plus';
    window.requestAnimationFrame(() => {
      setCaptureOpen(true);
      copilotRef.current?.openTextSource();
    });
  }, [navigate]);

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

  const handleMoreNavigation = useCallback((destination: TrackBToolDestination) => {
    setMoreStatus('Personal workspace · paper remains authoritative');
    if (destination === 'official-pds-forms') {
      setMoreDetailPage('forms');
      return;
    }
    if (destination === 'profile' || destination === 'privacy' || destination === 'storage') {
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
      navigate('assignments');
      return;
    }
    if (destination === 'daily-goal') {
      navigate('dashboard');
      return;
    }
    if (destination === 'sync') {
      navigate('sync');
      return;
    }
    navigate('export');
  }, [data, launchProjection.project?.mode, launchProjection.propertyName, navigate, saveSetupDraft, setupDraft]);

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

  const loadWarningAlert = loadWarnings.length > 0 ? (
    <section className="persistence-alert lcc-host-alert" role="status">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>Saved lifecycle details need review</strong>
        <p>
          {loadWarnings.length} recoverable validation warning
          {loadWarnings.length === 1 ? '' : 's'} loaded without replacing your records.
          Export a backup before correcting them.
        </p>
      </div>
    </section>
  ) : null;

  const manualReleaseAlert = manualReleaseStatus ? (
    <section className="persistence-alert lcc-host-alert" role="status">
      <div>
        <strong>Midday release saved</strong>
        <p>{manualReleaseStatus}</p>
      </div>
    </section>
  ) : null;

  const hostAlerts = (
    <>
      {saveAlert}
      {cacheAlert}
      {repositoryAlert}
      {offlineContinuityAlert}
      {loadWarningAlert}
      {manualReleaseAlert}
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
          initialState={activeFieldState}
          onRequestUnitNote={openUnitNote}
          initialView={trackCRouteState.view}
          onCrewContactRequested={() => {
            setMoreStatus('No message was sent. Crew contact remains a manual external action.');
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
              navigate('unitDetail', nextRoute.unitId, { unitSurface: 'board' });
              return;
            }
            navigate('units');
          }}
          onStateChange={(nextState, reason) => {
            if (reason === 'walk-started' || reason === 'walk-ended') {
              commitDataNow((current) => applyTrackCStateChange(current, nextState));
              return;
            }
            setData((current) => applyTrackCStateChange(current, nextState));
          }}
          routeState={trackCRouteState}
          walkIntegration={{
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
      {launchProjection.project?.mode !== 'real' && !demoExplored ? (
        <section aria-labelledby="lcc-welcome-title" className="lcc-welcome">
          <span aria-hidden="true" className="lcc-welcome__mark">TO</span>
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
              {setupDraft ? 'Continue Property Setup' : 'Set Up Your Property'}
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
        />
      ) : homeMode === 'start-day' ? (
        activeProject?.fieldConfiguration ? (
          <FastStartDayFlow
            configuration={activeProject.fieldConfiguration}
            contacts={activeProjectContacts}
            crewOptions={fastStartDayCrewOptions}
            currentDate={currentDate}
            onCancel={() => setHomeMode('day')}
            onStartDay={startFastDay}
            projectId={activeProject.id}
            propertyName={propertyRoster.propertyName}
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
          currentDate={activeDaySession?.date ?? currentDate}
          onBack={() => setHomeMode('day')}
          onConfirm={(batch) => {
            const saved = commitDataNow((current) =>
              appendManualReleaseBatchToActiveDay(current, batch));
            if (!saved) return false;
            setManualReleaseStatus(
              `${batch.items.length} released section${batch.items.length === 1 ? '' : 's'} saved to the active Day Session.`,
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
          activeWalkSessionId={trackCState.activeWalk?.id}
          crews={dayCrewOptions}
          currentDate={currentDate}
          events={dayEvents}
          existingSessions={daySessions}
          initialView="home"
          initialSession={activeDaySession}
          initialTask={todayTask}
          onDayStateChange={(change) => {
            if (change.reason === 'day-started' || change.reason === 'day-closed') {
              return commitDataNow((current) =>
                applyDayTaskStateChange(current, change));
            }
            setData((current) => applyDayTaskStateChange(current, change));
            return true;
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
          onRequestStartDay={() => setHomeMode('start-day')}
          onViewChange={setDayWorkspaceView}
          propertyRoster={propertyRoster}
          releases={dailyReleases}
          queueCounts={canonicalProjectionResult.projection?.todayTask.queueCounts}
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
      ) : moreDetailPage === 'profile' ? (
        <ProfilePrivacyScrollRegion kind="profile">
          <TrackBProfilePage
            appVersion="0.1.0"
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
      ) : moreDetailPage === 'storage' ? (
        <NativeDetailShell
          description="A read-only view of records currently held by this personal app."
          onBack={() => setMoreDetailPage(null)}
          statusLabel={backupStatus.label}
          title="Storage"
        >
          <GroupedInsetSection
            label="On this device"
            footer="Use Backup and Restore for guarded recovery controls."
          >
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
        </NativeDetailShell>
      ) : (
        <ThemeAwareMorePage
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
