import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SyncPanel } from './components/SyncPanel';
import { motionSafeScrollBehavior } from './lib/accessibility';
import { buildAppHash, resolveAppHash, routeForNavigation } from './lib/routing';
import type { AppNavigate } from './lib/routing';
import { usePersistentAppData } from './lib/storage';
import { useSupabaseSync } from './lib/supabase/sync';
import { buildTurnCommandUnitOptions, type TurnCommandSourceRequest } from './lib/turnCommand';
import { AssignmentsView } from './views/AssignmentsView';
import { CopilotView } from './views/CopilotView';
import { CrewsView } from './views/CrewsView';
import { DailyLogView } from './views/DailyLogView';
import { DashboardView } from './views/DashboardView';
import { ExportView } from './views/ExportView';
import { IssuesView } from './views/IssuesView';
import { ReportsView } from './views/ReportsView';
import { ReviewView } from './views/ReviewView';
import { SetupView } from './views/SetupView';
import { SyncDiagnosticsView } from './views/SyncDiagnosticsView';
import { TrainingQuestionsView } from './views/TrainingQuestionsView';
import { UnitDetailView } from './views/UnitDetailView';
import { UnitsView } from './views/UnitsView';

const LEGACY_CAPTURE_HISTORY_KEY = 'turnOsLegacyCapture';

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
  const [commandSourceRequest, setCommandSourceRequest] = useState<TurnCommandSourceRequest>();
  const [acceptedCommandRequestId, setAcceptedCommandRequestId] = useState<number>();
  const commandUnits = useMemo(() => buildTurnCommandUnitOptions(data), [data]);

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
      setCaptureOpen(true);
      return;
    }

    clearLegacyCaptureHistoryState();
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

  const submitCommand = useCallback((sourceText: string) => {
    commandRequestIdRef.current += 1;
    const request = {
      id: commandRequestIdRef.current,
      sourceText,
    };
    setCommandSourceRequest(request);
    setCaptureOpen(true);
    return request.id;
  }, []);

  const acceptCommandSource = useCallback((requestId: number) => {
    setAcceptedCommandRequestId(requestId);
  }, []);

  return (
    <>
      <AppShell
        acceptedCommandRequestId={acceptedCommandRequestId}
        activeView={route.view}
        captureOpen={captureOpen}
        commandContextUnitId={route.view === 'unitDetail' ? route.unitId : undefined}
        commandUnits={commandUnits}
        onNavigate={navigate}
        onOpenBackup={() => navigate('export')}
        onRetrySave={retrySave}
        onSubmitCommand={submitCommand}
        saveStatus={saveStatus}
        syncSlot={<SyncPanel sync={sync} />}
      >
        {route.view === 'dashboard' ? (
          <DashboardView data={data} onNavigate={navigate} saveStatus={saveStatus} sync={sync} />
        ) : null}
        {route.view === 'setup' ? <SetupView data={data} setData={setData} /> : null}
        {route.view === 'units' ? <UnitsView data={data} setData={setData} onNavigate={navigate} initialStatusFilter={route.unitStatusFilter} /> : null}
        {route.view === 'unitDetail' ? (
          <UnitDetailView data={data} setData={setData} unitId={route.unitId} onNavigate={navigate} />
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
