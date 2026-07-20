import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SyncPanel } from './components/SyncPanel';
import { motionSafeScrollBehavior } from './lib/accessibility';
import { buildAppHash, parseAppHash, routeForNavigation } from './lib/routing';
import type { AppNavigate } from './lib/routing';
import { usePersistentAppData } from './lib/storage';
import { useSupabaseSync } from './lib/supabase/sync';
import { AssignmentsView } from './views/AssignmentsView';
import { CopilotView } from './views/CopilotView';
import { CrewsView } from './views/CrewsView';
import { DailyLogView } from './views/DailyLogView';
import { DashboardView } from './views/DashboardView';
import { ExportView } from './views/ExportView';
import { IssuesView } from './views/IssuesView';
import { ReportsView } from './views/ReportsView';
import { SetupView } from './views/SetupView';
import { TrainingQuestionsView } from './views/TrainingQuestionsView';
import { UnitDetailView } from './views/UnitDetailView';
import { UnitsView } from './views/UnitsView';

function App() {
  const { data, setData, hasStoredData, retrySave, saveStatus } = usePersistentAppData();
  const sync = useSupabaseSync(data, setData, hasStoredData);
  const [route, setRoute] = useState(() => parseAppHash(typeof window === 'undefined' ? '' : window.location.hash));
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(parseAppHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

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

    setCaptureOpen(false);

    const nextRoute = routeForNavigation(view, unitId, options);
    const nextHash = buildAppHash(nextRoute);

    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }

    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() });
  }, []);

  return (
    <>
      <AppShell
        activeView={route.view}
        captureOpen={captureOpen}
        onNavigate={navigate}
        onOpenBackup={() => navigate('export')}
        onRetrySave={retrySave}
        saveStatus={saveStatus}
        syncSlot={<SyncPanel sync={sync} />}
      >
        {route.view === 'dashboard' ? <DashboardView data={data} onNavigate={navigate} /> : null}
        {route.view === 'copilot' ? <CopilotView data={data} setData={setData} onNavigate={navigate} /> : null}
        {route.view === 'setup' ? <SetupView data={data} setData={setData} /> : null}
        {route.view === 'units' ? <UnitsView data={data} setData={setData} onNavigate={navigate} initialStatusFilter={route.unitStatusFilter} /> : null}
        {route.view === 'unitDetail' ? (
          <UnitDetailView data={data} setData={setData} unitId={route.unitId} onNavigate={navigate} />
        ) : null}
        {route.view === 'issues' ? <IssuesView data={data} setData={setData} focusedIssueId={route.issueId} /> : null}
        {route.view === 'crews' ? <CrewsView data={data} setData={setData} /> : null}
        {route.view === 'assignments' ? <AssignmentsView data={data} setData={setData} /> : null}
        {route.view === 'daily' ? <DailyLogView data={data} setData={setData} /> : null}
        {route.view === 'reports' ? <ReportsView data={data} setData={setData} /> : null}
        {route.view === 'training' ? <TrainingQuestionsView data={data} setData={setData} /> : null}
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
        data={data}
        isOpen={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onNavigate={navigate}
        presentation="overlay"
        setData={setData}
      />
    </>
  );
}

export default App;
