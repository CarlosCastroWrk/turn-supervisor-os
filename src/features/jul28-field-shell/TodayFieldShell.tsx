import { useCallback, useState, type ReactNode } from 'react';
import { FieldNavigation } from './components/FieldNavigation';
import { FieldShellHeader } from './components/FieldShellHeader';
import { MoreSheet } from './components/MoreSheet';
import { NeedsMeSheet } from './components/NeedsMeSheet';
import { TodaySurface } from './components/TodaySurface';
import type {
  FieldDestination,
  FieldShellModel,
  FieldTask,
  FieldWorkspaceDestination,
  MoreDestination,
  NeedsMeItem,
} from './types';
import './field-shell.css';

interface TodayFieldShellProps {
  commandBarSlot?: ReactNode;
  model: FieldShellModel;
  onNavigate: (destination: Exclude<FieldDestination, 'more'>) => void;
  onOpenTask: (task: FieldTask) => void;
  onOpenWorkspace: (destination: FieldWorkspaceDestination, unitNumber: string) => void;
  onSelectMore: (destination: MoreDestination) => void;
  onSelectNeed: (item: NeedsMeItem) => void;
}

type OpenSheet = 'needs-me' | 'more' | null;

export function TodayFieldShell({
  commandBarSlot,
  model,
  onNavigate,
  onOpenTask,
  onOpenWorkspace,
  onSelectMore,
  onSelectNeed,
}: TodayFieldShellProps) {
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const dialogOpen = openSheet !== null;

  const closeSheet = useCallback(() => setOpenSheet(null), []);

  const navigate = (destination: FieldDestination) => {
    if (destination === 'more') {
      setOpenSheet('more');
      return;
    }
    onNavigate(destination);
  };

  const selectNeed = (item: NeedsMeItem) => {
    closeSheet();
    onSelectNeed(item);
  };

  const selectMore = (destination: MoreDestination) => {
    closeSheet();
    onSelectMore(destination);
  };

  return (
    <div className={`j28-field-shell ${dialogOpen ? 'has-dialog' : ''}`}>
      <div aria-hidden={dialogOpen || undefined} inert={dialogOpen || undefined}>
        <FieldShellHeader
          attentionCount={model.needsMe.length}
          context={model.context}
          onOpenNeedsMe={() => setOpenSheet('needs-me')}
        />
        <main className="j28-field-shell__main" id="j28-main">
          <TodaySurface
            assignedWork={model.assignedWork}
            context={model.context}
            endOfDayPaperReconciliation={model.endOfDayPaperReconciliation}
            needsMe={model.needsMe}
            nextPropertyWalk={model.nextPropertyWalk}
            personalPlan={model.personalPlan}
            progressingWork={model.progressingWork}
            recentActivity={model.recentActivity}
            onOpenNeedsMe={() => setOpenSheet('needs-me')}
            onOpenWorkspace={onOpenWorkspace}
            onSelectNeed={selectNeed}
            onSelectTask={onOpenTask}
          />
        </main>
        <div
          className="j28-command-slot"
          data-command-owner="external"
          data-testid="existing-command-slot"
        >
          {commandBarSlot}
        </div>
      </div>

      <FieldNavigation
        activeDestination={openSheet === 'more' ? 'more' : 'today'}
        dialogOpen={dialogOpen}
        onNavigate={navigate}
      />

      <NeedsMeSheet
        items={model.needsMe}
        open={openSheet === 'needs-me'}
        onDismiss={closeSheet}
        onSelect={selectNeed}
      />
      <MoreSheet
        destinations={model.moreDestinations}
        open={openSheet === 'more'}
        onDismiss={closeSheet}
        onSelect={selectMore}
      />
    </div>
  );
}
