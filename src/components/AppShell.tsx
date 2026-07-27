import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  FieldNavigation,
  FieldShellHeader,
  MoreSheet,
  NeedsMeSheet,
  type FieldDestination,
  type FieldShellModel,
  type MoreDestination,
  type NeedsMeItem,
} from '../features/jul28-field-shell';
import type { AppNavigate } from '../lib/routing';
import type { AppDataSaveStatus } from '../lib/storage';
import type { TurnCommandUnitOption } from '../lib/turnCommand';
import type { AppView } from '../types';
import { TurnCommandBar, type TurnCommandEntry } from './TurnCommandBar';
import '../features/jul28-field-shell/field-shell.css';

export type FieldSheet = 'needs-me' | 'more' | null;

interface AppShellProps {
  acceptedCommandRequestId?: number;
  activeView: AppView;
  captureOpen?: boolean;
  commandContextUnitId?: string;
  commandUnits: TurnCommandUnitOption[];
  fieldShellModel: FieldShellModel;
  fieldSheet: FieldSheet;
  onCloseFieldSheet: () => void;
  onNavigate: AppNavigate;
  onOpenBackup?: () => void;
  onOpenCapture: (entry: TurnCommandEntry) => void;
  onOpenFieldSheet: (sheet: Exclude<FieldSheet, null>) => void;
  onRetrySave?: () => boolean;
  onSelectFieldMore: (destination: MoreDestination) => void;
  onSelectFieldNeed: (item: NeedsMeItem) => void;
  onSubmitCommand: (sourceText: string) => number;
  saveStatus?: AppDataSaveStatus;
  syncSlot?: React.ReactNode;
  children: React.ReactNode;
}

const viewTitles: Record<AppView, string> = {
  activity: 'Activity',
  assignments: 'Assignments',
  copilot: 'Capture',
  crews: 'Crews',
  daily: 'Daily Log',
  dashboard: 'Today',
  export: 'Export',
  issues: 'Issues',
  more: 'More',
  notifications: 'Notifications',
  review: 'Queue',
  reports: 'Reports',
  search: 'Search',
  setup: 'Setup',
  sync: 'Sync & Diagnostics',
  training: 'Training Questions',
  unitDetail: 'Unit Detail',
  units: 'TurnBoard',
};

const commandBarViews = new Set<AppView>(['dashboard', 'review', 'unitDetail', 'units']);

const fieldDestinationForView = (view: AppView): FieldDestination => {
  if (view === 'dashboard') {
    return 'today';
  }
  if (view === 'units' || view === 'unitDetail') {
    return 'turnboard';
  }
  return 'more';
};

export function AppShell({
  acceptedCommandRequestId,
  activeView,
  captureOpen = false,
  commandContextUnitId,
  commandUnits,
  fieldShellModel,
  fieldSheet,
  onCloseFieldSheet,
  onNavigate,
  onOpenBackup,
  onOpenCapture,
  onOpenFieldSheet,
  onRetrySave,
  onSelectFieldMore,
  onSelectFieldNeed,
  onSubmitCommand,
  saveStatus,
  syncSlot,
  children,
}: AppShellProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const commandMicrophoneRef = useRef<HTMLButtonElement | null>(null);
  const captureOriginElementRef = useRef<HTMLElement | null>(null);
  const captureOriginViewRef = useRef<AppView | null>(null);
  const previousViewRef = useRef(activeView);
  const commandBarVisible = commandBarViews.has(activeView);
  const fieldDialogOpen = fieldSheet !== null;
  const backgroundHidden = captureOpen || fieldDialogOpen;

  useEffect(() => {
    document.title = `${viewTitles[activeView]} | Turn Supervisor OS`;
    if (previousViewRef.current !== activeView) {
      mainRef.current?.focus({ preventScroll: true });
      previousViewRef.current = activeView;
    }
  }, [activeView]);

  useEffect(() => {
    if (captureOpen) {
      captureOriginViewRef.current = activeView;
      return;
    }

    if (captureOriginViewRef.current === activeView) {
      const visibleTrigger = [captureOriginElementRef.current, commandMicrophoneRef.current]
        .find((element) => element?.isConnected && element.getClientRects().length > 0);
      visibleTrigger?.focus({ preventScroll: true });
    }
    captureOriginElementRef.current = null;
    captureOriginViewRef.current = null;
  }, [activeView, captureOpen]);

  const focusMainContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus({ preventScroll: true });
  };

  const openCapture = (entry: TurnCommandEntry, trigger: HTMLElement) => {
    captureOriginElementRef.current = trigger;
    onOpenCapture(entry);
  };

  const submitCommand = (sourceText: string, trigger: HTMLElement) => {
    captureOriginElementRef.current = trigger;
    return onSubmitCommand(sourceText);
  };

  const openUnit = (unitId: string) => {
    onNavigate('unitDetail', unitId);
  };

  const navigateField = (destination: FieldDestination) => {
    if (destination === 'more') {
      onOpenFieldSheet('more');
      return;
    }
    onCloseFieldSheet();
    onNavigate(destination === 'today' ? 'dashboard' : 'units');
  };

  return (
    <div
      className={`app-shell j28-field-shell ${captureOpen ? 'is-capture-open' : ''} ${fieldDialogOpen ? 'is-more-open has-dialog' : ''} ${commandBarVisible ? 'has-turn-command-bar' : ''}`}
    >
      <div
        className="j28-shell-background"
        aria-hidden={backgroundHidden || undefined}
        inert={backgroundHidden || undefined}
      >
        <a className="skip-link" href="#main-content" onClick={focusMainContent}>
          Skip to main content
        </a>

        <FieldShellHeader
          attentionCount={fieldShellModel.needsMe.length}
          context={fieldShellModel.context}
          onOpenNeedsMe={() => onOpenFieldSheet('needs-me')}
        />

        <main
          className="app-main j28-field-shell__main"
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
        >
          <div className="j28-sync-slot">{syncSlot}</div>

          {saveStatus?.state === 'failed' ? (
            <section className="persistence-alert" role="alert" aria-live="assertive">
              <AlertTriangle size={22} aria-hidden="true" />
              <div>
                <strong>Changes are not saved on this device</strong>
                <p>
                  {saveStatus.canRetry
                    ? 'Your latest changes are still in memory. Keep this app open, retry the save, or export a backup.'
                    : 'The last save failed. Retry the action after freeing browser storage, or export a backup of the data still visible here.'}
                </p>
              </div>
              <div className="persistence-alert__actions">
                {saveStatus.canRetry && onRetrySave ? (
                  <button type="button" onClick={onRetrySave}>
                    <RefreshCw size={17} aria-hidden="true" />
                    Retry save
                  </button>
                ) : null}
                {onOpenBackup ? (
                  <button type="button" onClick={onOpenBackup}>
                    <Download size={17} aria-hidden="true" />
                    Data &amp; backup
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {children}
        </main>

        {commandBarVisible ? (
          <div
            className="j28-command-slot"
            data-command-owner="external"
            data-testid="existing-command-slot"
          >
            <TurnCommandBar
              acceptedCommandRequestId={acceptedCommandRequestId}
              captureOpen={captureOpen}
              contextUnitId={commandContextUnitId}
              microphoneRef={commandMicrophoneRef}
              onOpenCapture={openCapture}
              onOpenUnit={openUnit}
              onSubmitCommand={submitCommand}
              units={commandUnits}
            />
          </div>
        ) : null}
      </div>

      <FieldNavigation
        activeDestination={fieldSheet === 'more' ? 'more' : fieldDestinationForView(activeView)}
        dialogOpen={backgroundHidden}
        onNavigate={navigateField}
      />

      <NeedsMeSheet
        items={fieldShellModel.needsMe}
        open={fieldSheet === 'needs-me'}
        onDismiss={onCloseFieldSheet}
        onSelect={onSelectFieldNeed}
      />

      <MoreSheet
        destinations={fieldShellModel.moreDestinations}
        open={fieldSheet === 'more'}
        onDismiss={onCloseFieldSheet}
        onSelect={onSelectFieldMore}
      />
    </div>
  );
}
