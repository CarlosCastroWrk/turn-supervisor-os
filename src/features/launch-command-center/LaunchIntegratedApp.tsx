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
  calculateDailyGoalProgress,
  createDefaultDailyGoal,
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
  LaunchCommandCenterShell,
  LaunchHome,
  LaunchLoginSurface,
  LaunchNotificationsPage,
  LaunchSearchPage,
} from './LaunchCommandCenter';
import { projectLaunchAppData } from './appDataProjection';
import { createLaunchBoardRepository } from './boardRepository';
import { filterLaunchSearchGroups } from './model';
import type {
  LaunchDailyGoalMilestone,
  LaunchDailyGoalMetric,
  LaunchNotificationItem,
  LaunchNotificationTab,
  LaunchPrimaryDestination,
  LaunchQuickActionId,
  LaunchSearchResult,
} from './types';
import type { CaptureResultReceipt } from '../../lib/captureSession';
import { motionSafeScrollBehavior } from '../../lib/accessibility';
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
import type { AppView } from '../../types';
import { SyncPanel } from '../../components/SyncPanel';
import { AssignmentsView } from '../../views/AssignmentsView';
import { CopilotView, type CopilotViewHandle } from '../../views/CopilotView';
import { CrewsView } from '../../views/CrewsView';
import { DailyLogView } from '../../views/DailyLogView';
import { ExportView } from '../../views/ExportView';
import { IssuesView } from '../../views/IssuesView';
import { ReportsView } from '../../views/ReportsView';
import { ReviewView } from '../../views/ReviewView';
import { SetupView } from '../../views/SetupView';
import { SyncDiagnosticsView } from '../../views/SyncDiagnosticsView';
import { TrainingQuestionsView } from '../../views/TrainingQuestionsView';
import { UnitDetailView } from '../../views/UnitDetailView';
import { UnitsView } from '../../views/UnitsView';
import './launchHost.css';

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';
const FULL_PAGE_RETURN_HISTORY_KEY = 'turnOsLaunchFullPageReturn';

type BoardCaptureContext = BoardFirstCaptureRequest | BoardFirstAssistantRequest;

const metricLabels: Record<string, LaunchDailyGoalMetric> = {
  inspections: 'Inspections',
  sections: 'Sections',
  units: 'Units',
};

const milestoneLabels: Record<string, LaunchDailyGoalMilestone> = {
  'crew-reported-complete': 'Crew reported complete',
  'los-inspected': 'Los inspected',
  'property-accepted': 'Property accepted',
  'ready-to-walk': 'Ready to walk',
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
  if (view === 'assignments') return 'Assignments';
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
  const [route, setRoute] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).route,
  );
  const [captureOpen, setCaptureOpen] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).captureRequested
      || historyRequestsCapture(),
  );
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [boardSessionActivity, setBoardSessionActivity] = useState<BoardFirstActivityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [notificationTab, setNotificationTab] = useState<LaunchNotificationTab>('all');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
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
    || route.view === 'more'
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

  const dailyGoal = useMemo(
    () => createDefaultDailyGoal(launchProjection.dateISO),
    [launchProjection.dateISO],
  );
  const dailyGoalProgress = useMemo(
    () => calculateDailyGoalProgress(dailyGoal, []),
    [dailyGoal],
  );
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
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    launchCaptureReturnFocusIdRef.current = null;
    setCaptureOpen(false);

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

  const openCapture = useCallback((
    entry: 'plus' | 'microphone',
    returnFocusId: string,
  ) => {
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    launchCaptureReturnFocusIdRef.current = returnFocusId;
    setCaptureOpen(true);
    if (entry === 'microphone') {
      copilotRef.current?.openVoiceSource();
      return;
    }
    copilotRef.current?.openDefaultCapture();
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

  const handleSearchResult = useCallback((result: LaunchSearchResult) => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      setRecentSearches((current) => [
        trimmed,
        ...current.filter((query) => query !== trimmed),
      ].slice(0, 5));
    }
    openDestination(result.destinationId);
  }, [openDestination, searchQuery]);

  const handleNotification = useCallback((item: LaunchNotificationItem) => {
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
    <div className="lcc-legacy-surface">
      {route.view === 'setup' ? <SetupView data={data} setData={setData} /> : null}
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
      {route.view === 'crews' ? <CrewsView data={data} setData={setData} /> : null}
      {route.view === 'assignments' ? <AssignmentsView data={data} setData={setData} /> : null}
      {route.view === 'daily' ? <DailyLogView data={data} setData={setData} /> : null}
      {route.view === 'reports' ? <ReportsView data={data} setData={setData} /> : null}
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
    );
  }

  if (route.view === 'search') {
    return (
      <LaunchSearchPage
        groups={filterLaunchSearchGroups(launchProjection.searchGroups, searchQuery)}
        onBack={closeFullPage}
        onOpenResult={handleSearchResult}
        onQueryChange={setSearchQuery}
        onSelectRecent={setSearchQuery}
        query={searchQuery}
        recentSearches={recentSearches}
      />
    );
  }

  if (route.view === 'notifications') {
    return (
      <LaunchNotificationsPage
        activeTab={notificationTab}
        items={launchProjection.notifications}
        onBack={closeFullPage}
        onOpenNotification={handleNotification}
        onTabChange={setNotificationTab}
      />
    );
  }

  const shellContent = boardRouteActive ? (
        <BoardFirstShell
      activeView={boardViewForRoute(route.view)}
      activityItems={boardActivity}
      embedded
      externalDialogOpen={captureOpen}
      hostStatusSlot={hostAlerts}
      initialUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
      propertyName={launchProjection.propertyName}
      repository={boardRepository}
      onAssistantSubmit={submitBoardAssistant}
      onCaptureRequest={openBoardCapture}
      onDialogOpenChange={setBoardDialogOpen}
          onHostNavigate={navigateBoardHost}
          onOpenPersonalUnit={(unitId) =>
            navigate('unitDetail', unitId, { unitSurface: 'personal' })}
          onUnitNavigate={navigateBoardUnit}
    />
  ) : route.view === 'dashboard' ? (
    <div className="lcc-host-stack">
      {hostAlerts}
      <LaunchHome
        blockers={launchProjection.blockers}
        counts={launchProjection.counts}
        goal={{
          actual: dailyGoalProgress.actual,
          configured: false,
          dateISO: dailyGoal.date,
          dateLabel: launchProjection.dateLabel,
          metric: metricLabels[dailyGoal.metric],
          milestone: milestoneLabels[dailyGoal.milestone],
          target: dailyGoal.target,
        }}
        onOpenBlocker={(blocker) => openDestination(blocker.destinationId)}
        onOpenSummary={(summary) => {
          if (summary === 'blocked') navigate('issues');
          else if (summary === 'callbacks') navigate('activity');
          else navigate('units');
        }}
        onQuickAction={handleQuickAction}
      />
    </div>
  ) : (
    <div className="lcc-host-stack">
      {hostAlerts}
      {legacySurface}
    </div>
  );

  return (
    <>
      <LaunchCommandCenterShell
        activeDestination={primaryDestinationForRoute(route.view)}
        backgroundInert={captureOpen}
        contentFocusKey={buildAppHash(route)}
        contentContained={boardRouteActive}
        contentDialogOpen={boardDialogOpen}
        contentTitle={contentTitle}
        dateLabel={launchProjection.dateLabel}
        notificationCount={launchProjection.notifications.filter((item) => !item.read).length}
        onNavigate={handlePrimaryNavigation}
        onOpenIntelligence={() => openCapture('plus', 'lcc-intelligence')}
        onOpenNotifications={() => openFullPage('notifications')}
        onOpenPlus={() => openCapture('plus', 'lcc-central-plus')}
        onOpenSearch={() => openFullPage('search')}
        propertyName={launchProjection.propertyName}
      >
        {shellContent}
      </LaunchCommandCenterShell>
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
    </>
  );
}
