import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, type FieldSheet } from './components/AppShell';
import { SyncPanel } from './components/SyncPanel';
import {
  JUL28_SYNTHETIC_FIELD_SHELL,
  type FieldWorkspaceDestination,
  type MoreDestination,
  type NeedsMeItem,
} from './features/jul28-field-shell';
import { jul28SyntheticTurnBoardRepository } from './features/jul28-turnboard/syntheticRepository';
import {
  BoardFirstShell,
  WAVE1R_SYNTHETIC_ACTIVITY,
  type BoardFirstActivityItem,
  type BoardFirstAssistantRequest,
  type BoardFirstCaptureRequest,
  type BoardFirstHostNavigationRequest,
} from './features/wave1r-board-first';
import { motionSafeScrollBehavior } from './lib/accessibility';
import type { CaptureResultReceipt } from './lib/captureSession';
import { buildAppHash, resolveAppHash, routeForNavigation } from './lib/routing';
import type { AppNavigate } from './lib/routing';
import { usePersistentAppData } from './lib/storage';
import { useSupabaseSync } from './lib/supabase/sync';
import type { TurnCommandSourceRequest, TurnCommandUnitOption } from './lib/turnCommand';
import { AssignmentsView } from './views/AssignmentsView';
import { CopilotView, type CopilotViewHandle } from './views/CopilotView';
import { CrewsView } from './views/CrewsView';
import { DailyLogView } from './views/DailyLogView';
import { ExportView } from './views/ExportView';
import { IssuesView } from './views/IssuesView';
import { ReportsView } from './views/ReportsView';
import { ReviewView } from './views/ReviewView';
import { SetupView } from './views/SetupView';
import { SyncDiagnosticsView } from './views/SyncDiagnosticsView';
import { TrainingQuestionsView } from './views/TrainingQuestionsView';
import { UnitDetailView } from './views/UnitDetailView';

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';
const FIELD_SHEET_HISTORY_KEY = 'turnOsFieldSheet';
const JUL28_TURNBOARD_UNITS = jul28SyntheticTurnBoardRepository.listUnits();
const JUL28_COMMAND_UNITS: TurnCommandUnitOption[] = JUL28_TURNBOARD_UNITS
  .map((unit) => ({
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    buildingName: unit.buildingLabel,
    floorName: unit.floorLabel,
  }))
  .sort((left, right) =>
    left.unitNumber.localeCompare(right.unitNumber, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
const JUL28_UNIT_IDS_BY_NUMBER = new Map(
  JUL28_TURNBOARD_UNITS.map((unit) => [unit.unitNumber, unit.id]),
);

type BoardCaptureContext = BoardFirstCaptureRequest | BoardFirstAssistantRequest;

const isBoardFirstRoute = (view: ReturnType<typeof resolveAppHash>['route']['view'], unitId?: string) =>
  view === 'dashboard'
  || view === 'units'
  || (view === 'unitDetail' && Boolean(
    unitId && jul28SyntheticTurnBoardRepository.getUnit(unitId),
  ));

const focusVisibleElementById = (elementId: string) => {
  const element = document.getElementById(elementId);
  if (!element?.isConnected || element.getClientRects().length === 0) {
    return false;
  }
  element.focus({ preventScroll: true });
  return document.activeElement === element;
};

const readHistoryState = (): Record<string, unknown> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const state = window.history.state;
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
};

const historyRequestsCapture = () => readHistoryState()[LEGACY_CAPTURE_HISTORY_KEY] === true;

const historyRequestedFieldSheet = (): Exclude<FieldSheet, null> | null => {
  const requestedSheet = readHistoryState()[FIELD_SHEET_HISTORY_KEY];
  return requestedSheet === 'needs-me' || requestedSheet === 'more'
    ? requestedSheet
    : null;
};

const clearLegacyCaptureHistoryState = () => {
  if (typeof window === 'undefined' || !historyRequestsCapture()) {
    return;
  }

  const nextState = { ...readHistoryState() };
  delete nextState[LEGACY_CAPTURE_HISTORY_KEY];
  window.history.replaceState(
    Object.keys(nextState).length > 0 ? nextState : null,
    '',
    window.location.href,
  );
};

function App() {
  const { data, setData, hasStoredData, retrySave, saveStatus } = usePersistentAppData();
  const sync = useSupabaseSync(data, setData, hasStoredData);
  const [route, setRoute] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).route,
  );
  const [captureOpen, setCaptureOpen] = useState(
    () => resolveAppHash(typeof window === 'undefined' ? '' : window.location.hash).captureRequested
      || historyRequestsCapture(),
  );
  const commandRequestIdRef = useRef(0);
  const copilotRef = useRef<CopilotViewHandle | null>(null);
  const [commandSourceRequest, setCommandSourceRequest] = useState<TurnCommandSourceRequest>();
  const [acceptedCommandRequestId, setAcceptedCommandRequestId] = useState<number>();
  const [fieldSheet, setFieldSheet] = useState<FieldSheet>(null);
  const [boardSessionActivity, setBoardSessionActivity] = useState<BoardFirstActivityItem[]>([]);
  const boardCaptureContextRef = useRef<BoardCaptureContext | null>(null);
  const boardCaptureReceiptSequenceRef = useRef(0);
  const boardCaptureReturnFocusRef = useRef<BoardCaptureContext['returnFocus'] | null>(null);
  const boardActivity = useMemo(
    () => [...WAVE1R_SYNTHETIC_ACTIVITY, ...boardSessionActivity],
    [boardSessionActivity],
  );
  const boardFirstActive = isBoardFirstRoute(route.view, route.unitId);

  useEffect(() => {
    const handleRouteChange = () => {
      const nextLocation = resolveAppHash(window.location.hash);

      if (nextLocation.captureRequested) {
        const safeHash = buildAppHash(nextLocation.route);
        window.history.replaceState(
          { ...readHistoryState(), [LEGACY_CAPTURE_HISTORY_KEY]: true },
          '',
          safeHash,
        );
      }

      setFieldSheet(historyRequestedFieldSheet());
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
      setFieldSheet(null);
      setCaptureOpen(true);
      return;
    }

    const replacesFieldSheetEntry = historyRequestedFieldSheet() !== null;
    clearLegacyCaptureHistoryState();
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    setFieldSheet(null);
    setCaptureOpen(false);

    const nextRoute = routeForNavigation(view, unitId, options);
    const nextHash = buildAppHash(nextRoute);

    if (replacesFieldSheetEntry) {
      if (window.location.hash === nextHash) {
        window.history.back();
      } else {
        const nextState = { ...readHistoryState() };
        delete nextState[FIELD_SHEET_HISTORY_KEY];
        window.history.replaceState(
          Object.keys(nextState).length > 0 ? nextState : null,
          '',
          nextHash,
        );
      }
    } else if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }

    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
  }, []);

  const closeCapture = useCallback(() => {
    const returnFocus = boardCaptureReturnFocusRef.current;
    clearLegacyCaptureHistoryState();
    setCaptureOpen(false);
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;

    if (returnFocus || boardFirstActive) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (returnFocus && focusVisibleElementById(returnFocus.triggerId)) {
            return;
          }
          focusVisibleElementById('w1r-assistant-launcher');
        });
      });
    }
  }, [boardFirstActive]);

  const openFieldSheet = useCallback((sheet: Exclude<FieldSheet, null>) => {
    const nextState = {
      ...readHistoryState(),
      [FIELD_SHEET_HISTORY_KEY]: sheet,
    };
    if (historyRequestedFieldSheet()) {
      window.history.replaceState(nextState, '', window.location.href);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }
    setFieldSheet(sheet);
  }, []);

  const closeFieldSheet = useCallback(() => {
    setFieldSheet(null);
    if (historyRequestedFieldSheet()) {
      window.history.back();
    }
  }, []);

  const openCapture = useCallback((entry: 'plus' | 'microphone') => {
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    setFieldSheet(null);
    setCaptureOpen(true);
    if (entry === 'microphone') {
      copilotRef.current?.openVoiceSource();
      return;
    }
    copilotRef.current?.openDefaultCapture();
  }, []);

  const submitCommand = useCallback((sourceText: string) => {
    boardCaptureContextRef.current = null;
    boardCaptureReturnFocusRef.current = null;
    commandRequestIdRef.current += 1;
    const request = {
      id: commandRequestIdRef.current,
      sourceText,
    };
    copilotRef.current?.openDefaultCapture();
    setCommandSourceRequest(request);
    setFieldSheet(null);
    setCaptureOpen(true);
    return request.id;
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
    setFieldSheet(null);
    setCaptureOpen(true);

    if (request.kind === 'voice') {
      copilotRef.current.openVoiceSource();
    } else {
      copilotRef.current.openDefaultCapture();
    }

    return {
      accepted: true as const,
      receiptId: `host-open:${request.requestId}`,
      message: 'Capture opened and accepted the handoff. Nothing has been saved yet.',
    };
  }, []);

  const submitBoardAssistant = useCallback((request: BoardFirstAssistantRequest) => {
    if (!copilotRef.current) {
      return;
    }

    boardCaptureContextRef.current = request;
    boardCaptureReturnFocusRef.current = request.returnFocus;
    commandRequestIdRef.current += 1;
    const commandRequest = {
      id: commandRequestIdRef.current,
      sourceText: request.sourceText,
    };
    copilotRef.current.openDefaultCapture();
    setCommandSourceRequest(commandRequest);
    setFieldSheet(null);
    setCaptureOpen(true);
  }, []);

  const acceptCommandSource = useCallback((requestId: number) => {
    setAcceptedCommandRequestId(requestId);
  }, []);

  const mirrorCompletedBoardCapture = useCallback((receipt: CaptureResultReceipt) => {
    const context = boardCaptureContextRef.current;
    if (!context) {
      return;
    }

    boardCaptureReceiptSequenceRef.current += 1;
    const voiceCapture = 'kind' in context && context.kind === 'voice';
    const activityKind: BoardFirstActivityItem['kind'] =
      receipt.destinationKind === 'daily_log'
        ? 'note'
        : voiceCapture
          ? 'transcript'
          : 'capture-receipt';
    const item: BoardFirstActivityItem = {
      id: `host-capture-result:${boardCaptureReceiptSequenceRef.current}`,
      kind: activityKind,
      nonpersisted: true,
      receiptId: `capture-result:${boardCaptureReceiptSequenceRef.current}`,
      recordedAt: new Date().toISOString(),
      section: 'section' in context ? context.section : undefined,
      sourceLabel: 'Capture result mirror · session-only and nonpersisted',
      synthetic: true,
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
  }, []);

  const openJul28Unit = useCallback((unitNumber: string) => {
    const unitId = JUL28_UNIT_IDS_BY_NUMBER.get(unitNumber);
    navigate(unitId ? 'unitDetail' : 'units', unitId);
  }, [navigate]);

  const openFieldWorkspace = useCallback((
    destination: FieldWorkspaceDestination,
    unitNumber: string,
  ) => {
    if (destination.workspace === 'today') {
      navigate('dashboard');
      return;
    }
    if (destination.workspace === 'capture-review') {
      navigate('review');
      return;
    }
    if (destination.workspace === 'sync-diagnostics') {
      navigate('sync');
      return;
    }
    if (destination.workspace === 'paper-reconciliation') {
      navigate('reports');
      return;
    }
    openJul28Unit(unitNumber);
  }, [navigate, openJul28Unit]);

  const selectFieldNeed = useCallback((item: NeedsMeItem) => {
    setFieldSheet(null);
    openFieldWorkspace(item.destination, item.unitNumber);
  }, [openFieldWorkspace]);

  const selectFieldMore = useCallback((destination: MoreDestination) => {
    const destinationView = {
      backup: 'export',
      crews: 'crews',
      reports: 'reports',
      setup: 'setup',
      sync: 'sync',
    }[destination.id] as Parameters<AppNavigate>[0];
    navigate(destinationView);
  }, [navigate]);

  const navigateBoardHost = useCallback((request: BoardFirstHostNavigationRequest) => {
    const destinationView = {
      backup: 'export',
      crews: 'crews',
      reports: 'reports',
      setup: 'setup',
      sync: 'sync',
    }[request.destination] as Parameters<AppNavigate>[0];
    navigate(destinationView);
    return {
      accepted: true,
      message: `${request.destination} opened in the existing Turn OS tool.`,
    };
  }, [navigate]);

  const navigateBoardUnit = useCallback((unitId?: string) => {
    navigate(unitId ? 'unitDetail' : 'units', unitId);
  }, [navigate]);

  const boardSaveAlert = saveStatus.state === 'failed' ? (
    <section className="persistence-alert w1r-host-alert" role="alert" aria-live="assertive">
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

  const boardCacheAlert = sync.status === 'cache_transition_required' ? (
    <section className="persistence-alert w1r-host-alert" role="alert" aria-live="assertive">
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

  return (
    <>
      {boardFirstActive ? (
        <BoardFirstShell
          activityItems={boardActivity}
          externalDialogOpen={captureOpen}
          hostStatusSlot={(
            <>
              {boardSaveAlert}
              {boardCacheAlert}
            </>
          )}
          initialUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
          onAssistantSubmit={submitBoardAssistant}
          onCaptureRequest={openBoardCapture}
          onHostNavigate={navigateBoardHost}
          onUnitNavigate={navigateBoardUnit}
        />
      ) : (
        <AppShell
          acceptedCommandRequestId={acceptedCommandRequestId}
          activeView={route.view}
          captureOpen={captureOpen}
          commandContextUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
          commandUnits={JUL28_COMMAND_UNITS}
          fieldShellModel={JUL28_SYNTHETIC_FIELD_SHELL}
          fieldSheet={fieldSheet}
          onCloseFieldSheet={closeFieldSheet}
          onNavigate={navigate}
          onOpenCapture={openCapture}
          onOpenBackup={() => navigate('export')}
          onOpenFieldSheet={openFieldSheet}
          onRetrySave={retrySave}
          onSelectFieldMore={selectFieldMore}
          onSelectFieldNeed={selectFieldNeed}
          onSubmitCommand={submitCommand}
          saveStatus={saveStatus}
          syncSlot={<SyncPanel sync={sync} />}
        >
          {route.view === 'setup' ? <SetupView data={data} setData={setData} /> : null}
          {route.view === 'unitDetail' ? (
            <UnitDetailView data={data} setData={setData} unitId={route.unitId ?? ''} onNavigate={navigate} />
          ) : null}
          {route.view === 'issues' ? <IssuesView data={data} setData={setData} focusedIssueId={route.issueId} /> : null}
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
        </AppShell>
      )}
      <CopilotView
        ref={copilotRef}
        commandSourceRequest={commandSourceRequest}
        data={data}
        isOpen={captureOpen}
        onCaptureCompleted={mirrorCompletedBoardCapture}
        onCommandSourceAccepted={acceptCommandSource}
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

export default App;
