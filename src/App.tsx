import { useCallback, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SyncPanel } from './components/SyncPanel';
import { usePersistentAppData } from './lib/storage';
import { useSupabaseSync } from './lib/supabase/sync';
import type { AppView, UnitStatusFilter } from './types';
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
  const { data, setData, hasStoredData } = usePersistentAppData();
  const sync = useSupabaseSync(data, setData, hasStoredData);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [activeUnitId, setActiveUnitId] = useState<string | undefined>();
  const [unitStatusFilter, setUnitStatusFilter] = useState<UnitStatusFilter>('All');

  const navigate = useCallback((view: AppView, unitId?: string, options?: { unitStatusFilter?: UnitStatusFilter }) => {
    if (view === 'units') {
      setUnitStatusFilter(options?.unitStatusFilter ?? 'All');
    }
    if (unitId) {
      setActiveUnitId(unitId);
    }
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <AppShell activeView={activeView} onNavigate={navigate} syncSlot={<SyncPanel sync={sync} />}>
      {activeView === 'dashboard' ? <DashboardView data={data} onNavigate={navigate} /> : null}
      {activeView === 'copilot' ? <CopilotView data={data} setData={setData} onNavigate={navigate} /> : null}
      {activeView === 'setup' ? <SetupView data={data} setData={setData} /> : null}
      {activeView === 'units' ? <UnitsView data={data} setData={setData} onNavigate={navigate} initialStatusFilter={unitStatusFilter} /> : null}
      {activeView === 'unitDetail' ? (
        <UnitDetailView data={data} setData={setData} unitId={activeUnitId} onNavigate={navigate} />
      ) : null}
      {activeView === 'issues' ? <IssuesView data={data} setData={setData} /> : null}
      {activeView === 'crews' ? <CrewsView data={data} setData={setData} /> : null}
      {activeView === 'assignments' ? <AssignmentsView data={data} setData={setData} /> : null}
      {activeView === 'daily' ? <DailyLogView data={data} setData={setData} /> : null}
      {activeView === 'reports' ? <ReportsView data={data} /> : null}
      {activeView === 'training' ? <TrainingQuestionsView data={data} setData={setData} /> : null}
      {activeView === 'export' ? <ExportView data={data} setData={setData} /> : null}
    </AppShell>
  );
}

export default App;
