import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, type FieldSheet } from './components/AppShell';
import { SyncPanel } from './components/SyncPanel';
import {
  JUL28_SYNTHETIC_FIELD_SHELL,
  TodaySurface,
  type FieldTask,
  type FieldWorkspaceDestination,
  type MoreDestination,
  type NeedsMeItem,
} from './features/jul28-field-shell';
import { TurnBoardFeature } from './features/jul28-turnboard/TurnBoardFeature';
import { jul28SyntheticTurnBoardRepository } from './features/jul28-turnboard/syntheticRepository';
import { motionSafeScrollBehavior } from './lib/accessibility';
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

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';
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

const readHistoryState = (): Record<string, unknown> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const state = window.history.state;
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
};

const historyRequestsCapture = () => readHistoryState()[LEGACY_CAPTURE_HISTORY_KEY] === true;

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

      setFieldSheet(null);
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

    clearLegacyCaptureHistoryState();
    setFieldSheet(null);
    setCaptureOpen(false);

    const nextRoute = routeForNavigation(view, unitId, options);
    const nextHash = buildAppHash(nextRoute);

    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }

    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
  }, []);

  const closeCapture = useCallback(() => {
    clearLegacyCaptureHistoryState();
    setCaptureOpen(false);
  }, []);

  const openCapture = useCallback((entry: 'plus' | 'microphone') => {
    setFieldSheet(null);
    setCaptureOpen(true);
    if (entry === 'microphone') {
      copilotRef.current?.openVoiceSource();
      return;
    }
    copilotRef.current?.openDefaultCapture();
  }, []);

  const submitCommand = useCallback((sourceText: string) => {
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

  const acceptCommandSource = useCallback((requestId: number) => {
    setAcceptedCommandRequestId(requestId);
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

  const selectFieldTask = useCallback((task: FieldTask) => {
    openJul28Unit(task.unitNumber);
  }, [openJul28Unit]);

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

  return (
    <>
      <AppShell
        acceptedCommandRequestId={acceptedCommandRequestId}
        activeView={route.view}
        captureOpen={captureOpen}
        commandContextUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
        commandUnits={JUL28_COMMAND_UNITS}
        fieldShellModel={JUL28_SYNTHETIC_FIELD_SHELL}
        fieldSheet={fieldSheet}
        onCloseFieldSheet={() => setFieldSheet(null)}
        onNavigate={navigate}
        onOpenCapture={openCapture}
        onOpenBackup={() => navigate('export')}
        onOpenFieldSheet={setFieldSheet}
        onRetrySave={retrySave}
        onSelectFieldMore={selectFieldMore}
        onSelectFieldNeed={selectFieldNeed}
        onSubmitCommand={submitCommand}
        saveStatus={saveStatus}
        syncSlot={<SyncPanel sync={sync} />}
      >
        {route.view === 'dashboard' ? (
          <TodaySurface
            assignedWork={JUL28_SYNTHETIC_FIELD_SHELL.assignedWork}
            context={JUL28_SYNTHETIC_FIELD_SHELL.context}
            endOfDayPaperReconciliation={JUL28_SYNTHETIC_FIELD_SHELL.endOfDayPaperReconciliation}
            needsMe={JUL28_SYNTHETIC_FIELD_SHELL.needsMe}
            nextPropertyWalk={JUL28_SYNTHETIC_FIELD_SHELL.nextPropertyWalk}
            personalPlan={JUL28_SYNTHETIC_FIELD_SHELL.personalPlan}
            progressingWork={JUL28_SYNTHETIC_FIELD_SHELL.progressingWork}
            recentActivity={JUL28_SYNTHETIC_FIELD_SHELL.recentActivity}
            onOpenNeedsMe={() => setFieldSheet('needs-me')}
            onOpenWorkspace={openFieldWorkspace}
            onSelectNeed={selectFieldNeed}
            onSelectTask={selectFieldTask}
          />
        ) : null}
        {route.view === 'setup' ? <SetupView data={data} setData={setData} /> : null}
        {route.view === 'units' || route.view === 'unitDetail' ? (
          <TurnBoardFeature
            initialUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
            onUnitClose={() => navigate('units')}
            onUnitSelected={(unitId) => navigate('unitDetail', unitId)}
          />
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
      <CopilotView
        ref={copilotRef}
        commandSourceRequest={commandSourceRequest}
        data={data}
        isOpen={captureOpen}
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
