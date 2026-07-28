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
import type {
  LaunchPrimaryDestination,
  LaunchQuickActionId,
} from './types';
import {
  NativeHomeSummaryPage,
  NativeHomeSurface,
  NativeNotificationsPage,
  NativeSearchPage,
  selectNativeHomeSummary,
  type NativeDailyGoal,
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
  TRACK_B_SETUP_QUESTIONS,
  TrackBCrewFormPage,
  TrackBCrewListPage,
  TrackBProfilePage,
  TrackBReportsAndProofPage,
  TrackBSetupQuestionnaire,
  type TrackBCrewDraft,
  type TrackBCrewRecord,
  type TrackBDataStatus,
  type TrackBReportCounts,
  type TrackBSetupQuestionId,
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
  Wave2A2StandaloneRoute,
  Wave2A2UnifiedShell,
  useTurnTheme,
} from '../wave2a2-track-a';
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
import { usePersistentAppData } from '../../lib/storage';
import { getLocalCacheOwner } from '../../lib/supabase/cacheOwnership';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useSupabaseSync } from '../../lib/supabase/sync';
import type { TurnCommandSourceRequest } from '../../lib/turnCommand';
import type { ActivityLog, AppView } from '../../types';
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
import './launchHost.css';

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';
const FULL_PAGE_RETURN_HISTORY_KEY = 'turnOsLaunchFullPageReturn';

type BoardCaptureContext = BoardFirstCaptureRequest | BoardFirstAssistantRequest;

type CrewEditorState =
  | { mode: 'add' }
  | { crewId: string; mode: 'edit' }
  | null;

type MoreDetailPage = 'profile' | 'privacy' | 'storage' | null;

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
  if (view === 'units' || view === 'unitDetail') return 'turnboard';
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
  if (view === 'assignments') return 'Import work';
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
  const { data, setData, hasStoredData, retrySave, saveStatus } = usePersistentAppData();
  const sync = useSupabaseSync(data, setData, hasStoredData);
  const theme = useTurnTheme(
    sync.userId
      ?? sync.lastAuthenticatedUserId
      ?? getLocalCacheOwner()
      ?? 'local-unconfigured-device',
  );
  const [route, setRoute] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).route,
  );
  const [captureOpen, setCaptureOpen] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).captureRequested
      || historyRequestsCapture(),
  );
  const [plusOpen, setPlusOpen] = useState(false);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [homeDialogOpen, setHomeDialogOpen] = useState(false);
  const [boardSessionActivity, setBoardSessionActivity] = useState<BoardFirstActivityItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<BoardFirstActivityItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [notificationTab, setNotificationTab] = useState<NativeNotificationTab>('all');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [dailyGoal, setDailyGoal] = useState<NativeDailyGoal | null>(null);
  const [crewEditor, setCrewEditor] = useState<CrewEditorState>(null);
  const [moreDetailPage, setMoreDetailPage] = useState<MoreDetailPage>(null);
  const [moreStatus, setMoreStatus] = useState(
    'Personal workspace · paper remains authoritative',
  );
  const [setupQuestionIndex, setSetupQuestionIndex] = useState(0);
  const [setupAnswers, setSetupAnswers] = useState<
    Partial<Record<TrackBSetupQuestionId, string>>
  >({});
  const [setupStatus, setSetupStatus] = useState(
    'Provisional session answers · nothing saved',
  );
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
  const now = useMemo(() => new Date(), []);

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

  const launchProjection = useMemo(
    () => projectLaunchAppData(data, now, readNotificationIds),
    [data, now, readNotificationIds],
  );
  const boardRepositoryState = useMemo(() => createLaunchBoardRepository(data), [data]);
  const boardRepository = boardRepositoryState.repository;
  const boardRouteActive = (route.view === 'units' && route.unitStatusFilter === 'All')
    || route.view === 'activity'
    || (
      route.view === 'unitDetail'
      && route.unitSurface !== 'personal'
      && Boolean(route.unitId && boardRepository.getUnit(route.unitId))
    );

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
  const operationalSource = useMemo(
    () => createAppDataOperationalReadSource(operationalScope, data),
    [data, operationalScope],
  );
  const unitNumberById = useMemo(
    () => new Map(launchProjection.commandUnits.map((unit) => [unit.unitId, unit.unitNumber])),
    [launchProjection.commandUnits],
  );
  const persistedActivity = useMemo(() => {
    if (!operationalSource.ok) return launchProjection.activityItems;
    return listOperationalActivity(
      operationalScope,
      operationalRepositories,
      operationalSource.source,
    ).map((activity): BoardFirstActivityItem => ({
      id: activity.id,
      kind: boardActivityKind(activity),
      recordedAt: activity.recordedAt,
      sourceLabel: activity.sourceRefs[0]?.label ?? 'Personal operational memory',
      synthetic: launchProjection.project?.mode === 'demo',
      title: activity.title,
      wording: activity.wording,
      unitId: activity.unitId,
      unitNumber: activity.unitId ? unitNumberById.get(activity.unitId) : undefined,
    }));
  }, [
    launchProjection.activityItems,
    launchProjection.project?.mode,
    operationalRepositories,
    operationalScope,
    operationalSource,
    unitNumberById,
  ]);
  const boardActivity = useMemo(
    () => [...persistedActivity, ...boardSessionActivity],
    [boardSessionActivity, persistedActivity],
  );
  const nativeSearchGroups = useMemo<NativeSearchGroup[]>(() => {
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
  }, [launchProjection.searchGroups]);
  const nativeNotifications = useMemo<NativeNotificationItem[]>(
    () => launchProjection.notifications.map((item) => ({
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
    [launchProjection.notifications],
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
  const goalActual = useMemo(() => {
    if (!dailyGoal || dailyGoal.milestone === 'property-accepted') return 0;
    if (dailyGoal.metric === 'units' && dailyGoal.milestone === 'ready-to-walk') {
      return launchProjection.counts.readyToWalk;
    }

    const matching = boardActivity.filter((item) => {
      if (dailyGoal.milestone === 'crew-reported-complete') return item.kind === 'crew-report';
      if (dailyGoal.milestone === 'los-inspected') return item.kind === 'los-inspection';
      return false;
    });
    if (dailyGoal.metric === 'sections') {
      return matching.filter((item) => Boolean(item.section)).length;
    }
    if (dailyGoal.metric === 'inspections') return matching.length;
    return new Set(matching.flatMap((item) => item.unitId ? [item.unitId] : [])).size;
  }, [boardActivity, dailyGoal, launchProjection.counts.readyToWalk]);
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
    const unitsTouched = new Set(
      boardActivity.flatMap((item) => item.unitId ? [item.unitId] : []),
    ).size;
    return {
      activityCount: boardActivity.length,
      callbacksFound: launchProjection.counts.callbacks,
      callbacksResolved: 0,
      readyToWalk: launchProjection.counts.readyToWalk,
      sectionsInspected: boardActivity.filter(
        (item) => item.kind === 'los-inspection' && Boolean(item.section),
      ).length,
      unitsTouched,
      waiting: launchProjection.counts.blocked,
      working: launchProjection.counts.working,
    };
  }, [boardActivity, launchProjection.counts]);
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
  const contentTitle = contentTitleForRoute(route.view, routeUnitNumber);

  useEffect(() => {
    document.title = `${contentTitle} · Turn OS`;
  }, [contentTitle]);

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
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    handleRouteChange();
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

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

    const nextRoute = routeForNavigation(view, unitId, options);
    const nextHash = buildAppHash(nextRoute);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
  }, []);

  const openFullPage = useCallback((view: 'search' | 'notifications') => {
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
    const view: Record<LaunchPrimaryDestination, AppView> = {
      activity: 'activity',
      home: 'dashboard',
      more: 'more',
      turnboard: 'units',
    };
    navigate(view[destination]);
  }, [navigate]);

  const handleQuickAction = useCallback((action: LaunchQuickActionId) => {
    if (action === 'import-work') {
      navigate('assignments');
      return;
    }
    if (action === 'assign-crews') {
      navigate('crews');
      return;
    }
    if (action === 'start-walk') {
      navigate('units');
      return;
    }
    navigate('reports');
  }, [navigate]);

  const openNativePlus = useCallback(() => {
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
      navigate('assignments');
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
      setMoreStatus(
        'Official PDS Forms stay unavailable until reviewed destinations and privacy treatment are approved.',
      );
      return;
    }
    if (destination === 'profile' || destination === 'privacy' || destination === 'storage') {
      setMoreDetailPage(destination);
      return;
    }
    if (destination === 'crews') {
      navigate('crews');
      return;
    }
    if (destination === 'reports-and-proof') {
      navigate('reports');
      return;
    }
    if (destination === 'setup') {
      setSetupQuestionIndex(0);
      setSetupStatus('Provisional session answers · nothing saved');
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
  }, [navigate]);

  const requestSignOut = useCallback(() => {
    if (!sync.enabled) {
      setMoreStatus('This device is in local-only mode, so there is no Turn OS account session to end.');
      return;
    }
    void sync.signOut();
  }, [sync]);

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

  const hostAlerts = (
    <>
      {saveAlert}
      {cacheAlert}
      {repositoryAlert}
      {offlineContinuityAlert}
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
          setData={setData}
          syncAuthReady={sync.authReady}
          syncSignedIn={sync.signedIn}
        />
      ) : null}
    </div>
  );
  const legacyToolDescription: Partial<Record<AppView, string>> = {
    assignments: 'Review the existing personal assignment and import tools.',
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

  if (route.view === 'search') {
    return (
      <Wave2A2StandaloneRoute routeName="search" theme={theme}>
        <NativeSearchPage
          groups={nativeSearchGroups}
          onBack={closeFullPage}
          onOpenResult={handleSearchResult}
          onQueryChange={setSearchQuery}
          onSelectRecent={(query) => setSearchQuery(query)}
          query={searchQuery}
          recentSearches={recentSearches}
        />
      </Wave2A2StandaloneRoute>
    );
  }

  if (route.view === 'notifications') {
    return (
      <Wave2A2StandaloneRoute routeName="notifications" theme={theme}>
        <NativeNotificationsPage
          activeTab={notificationTab}
          items={nativeNotifications}
          onBack={closeFullPage}
          onOpenNotification={handleNotification}
          onTabChange={setNotificationTab}
        />
      </Wave2A2StandaloneRoute>
    );
  }

  const currentSetupQuestion = TRACK_B_SETUP_QUESTIONS[
    Math.min(setupQuestionIndex, TRACK_B_SETUP_QUESTIONS.length - 1)
  ];
  const editingCrew = crewEditor?.mode === 'edit'
    ? crewRecords.find((crew) => crew.id === crewEditor.crewId)
    : undefined;

  const shellContent = boardRouteActive ? (
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
  ) : route.view === 'dashboard' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      {route.homeSummary ? (
        <NativeHomeSummaryPage
          destination={selectNativeHomeSummary(
            launchProjection.homeRecords,
            route.homeSummary,
          )}
          onBack={() => navigate('dashboard')}
          onOpenRecord={(record: NativeHomeRecord) => openDestination(record.destinationId)}
        />
      ) : (
        <NativeHomeSurface
          dateLabel={launchProjection.dateLabel}
          goal={dailyGoal}
          goalActual={goalActual}
          onDialogOpenChange={setHomeDialogOpen}
          onOpenSummary={(destination) =>
            navigate('dashboard', undefined, { homeSummary: destination.id })}
          onQuickAction={handleQuickAction}
          onSaveGoal={setDailyGoal}
          propertyName={launchProjection.propertyName}
          records={launchProjection.homeRecords}
        />
      )}
    </div>
  ) : route.view === 'more' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      {moreDetailPage === 'profile' ? (
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
      ) : moreDetailPage === 'privacy' ? (
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
      <TrackBSetupQuestionnaire
        currentQuestionId={currentSetupQuestion.id}
        onBack={() => setSetupQuestionIndex((index) => Math.max(0, index - 1))}
        onContinue={() => setSetupQuestionIndex((index) =>
          Math.min(TRACK_B_SETUP_QUESTIONS.length - 1, index + 1))}
        onExit={() => navigate('more')}
        onReview={() => setSetupStatus(
          'Review complete · answers remain session-only and were not activated',
        )}
        statusLabel={setupStatus}
      >
        {currentSetupQuestion.id === 'review' ? (
          <div className="lcc-setup-review">
            {TRACK_B_SETUP_QUESTIONS
              .filter((question) => question.id !== 'review')
              .map((question) => (
                <div key={question.id}>
                  <strong>{question.title}</strong>
                  <span>{setupAnswers[question.id]?.trim() || 'Not recorded'}</span>
                </div>
              ))}
          </div>
        ) : (
          <label className="lcc-setup-answer">
            <span>Provisional answer</span>
            <textarea
              onChange={(event) => setSetupAnswers((answers) => ({
                ...answers,
                [currentSetupQuestion.id]: event.target.value,
              }))}
              placeholder="Enter only reviewed, synthetic, or approved personal context"
              rows={5}
              value={setupAnswers[currentSetupQuestion.id] ?? ''}
            />
          </label>
        )}
      </TrackBSetupQuestionnaire>
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

  return (
    <>
      <Wave2A2UnifiedShell
        activeDestination={primaryDestinationForRoute(route.view)}
        backgroundInert={captureOpen || plusOpen || Boolean(selectedActivity)}
        contentFocusKey={buildAppHash(route)}
        contentContained={boardRouteActive}
        contentDialogOpen={boardDialogOpen || homeDialogOpen}
        contentTitle={contentTitle}
        dateLabel={launchProjection.dateLabel}
        notificationCount={launchProjection.notifications.filter((item) => !item.read).length}
        onNavigate={handlePrimaryNavigation}
        onOpenIntelligence={() => undefined}
        onOpenNotifications={() => openFullPage('notifications')}
        onOpenPlus={openNativePlus}
        onOpenSearch={() => openFullPage('search')}
        propertyName={launchProjection.propertyName}
        restoreContentScroll={
          route.view === 'units'
          && route.unitStatusFilter === 'All'
        }
        theme={theme}
      >
        {shellContent}
      </Wave2A2UnifiedShell>
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
        data={data}
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
    </>
  );
}
