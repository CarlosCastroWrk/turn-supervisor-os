import {
  Bell,
  ClipboardList,
  Mic,
  Paintbrush,
  Sparkles,
} from 'lucide-react';
import {
  StrictMode,
  useMemo,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../components/ToastProvider';
import { seedData } from '../../data/seed';
import {
  LAUNCH_SYNTHETIC_BLOCKERS,
  LAUNCH_SYNTHETIC_CONTEXT,
  LAUNCH_SYNTHETIC_COUNTS,
  LAUNCH_SYNTHETIC_GOAL,
  LAUNCH_SYNTHETIC_NOTIFICATIONS,
  LAUNCH_SYNTHETIC_RECENTS,
  LAUNCH_SYNTHETIC_SEARCH_GROUPS,
  LaunchHome,
  LaunchNotificationsPage,
  LaunchSearchPage,
  filterLaunchSearchGroups,
  type LaunchNotificationTab,
  type LaunchPrimaryDestination,
} from '../launch-command-center';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
} from '../wave2a1-native/track-b/NativeDetailShell';
import {
  TrackCNativeFlow,
  type TrackCPlusAction,
} from '../wave2a1-native/track-c';
import { CopilotView } from '../../views/CopilotView';
import type { AppData } from '../../types';
import {
  ThemeAwareMorePage,
  Wave2A2OverlayBoundary,
  Wave2A2UnifiedShell,
  useTurnTheme,
} from './index';
import '../../styles.css';
import './preview.css';

type PreviewRoute =
  | LaunchPrimaryDestination
  | 'notifications'
  | 'search';

const previewRows = [
  ['Unit 413', 'Paint · Common, A, C, D', 'Ready for your walk'],
  ['Unit 416', 'Clean · Common, A, B', 'Crew working'],
  ['Unit 420', 'Access check', 'Needs follow-up'],
] as const;

export function PreviewList({
  kind,
}: {
  kind: 'crews' | 'turnboard';
}) {
  const rows = Array.from({ length: 6 }, (_, groupIndex) =>
    previewRows.map(([unit, scope, state]) => [
      `${unit}-${groupIndex}`,
      scope,
      state,
    ] as const)).flat();

  return (
    <NativeDetailShell
      description={kind === 'turnboard'
        ? 'Synthetic personal mirror. The paper TurnBoard remains authoritative.'
        : 'Confirmed personal records and field notes.'}
      statusLabel="Synthetic preview"
      title={kind === 'turnboard' ? 'TurnBoard' : 'Activity'}
    >
      <div
        className="w2a2-preview-scroll"
        data-turn-scroll-region="primary"
      >
        <GroupedInsetSection label={kind === 'turnboard' ? 'Released today' : 'Recent'}>
          {rows.map(([unit, scope, state]) => (
            <GroupedInsetRow
              detail={scope}
              icon={kind === 'turnboard'
                ? <Paintbrush aria-hidden="true" size={20} />
                : <ClipboardList aria-hidden="true" size={20} />}
              key={`${kind}-${unit}`}
              label={unit.replace(/-\d+$/u, '')}
              tone={state === 'Needs follow-up' ? 'attention' : undefined}
              value={state}
            />
          ))}
        </GroupedInsetSection>
      </div>
    </NativeDetailShell>
  );
}

export function TrackAPreview() {
  const theme = useTurnTheme('wave2a2-track-a-preview');
  const [route, setRoute] = useState<PreviewRoute>('home');
  const [returnRoute, setReturnRoute] = useState<LaunchPrimaryDestination>('home');
  const [query, setQuery] = useState('');
  const [notificationTab, setNotificationTab] =
    useState<LaunchNotificationTab>('all');
  const [plusOpen, setPlusOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [data, setData] = useState<AppData>(() => structuredClone(seedData));

  const activeDestination: LaunchPrimaryDestination =
    route === 'search' || route === 'notifications' ? returnRoute : route;
  const filteredSearchGroups = useMemo(
    () => filterLaunchSearchGroups(LAUNCH_SYNTHETIC_SEARCH_GROUPS, query),
    [query],
  );
  const overlayOpen = plusOpen || captureOpen;

  const openDetail = (nextRoute: 'notifications' | 'search') => {
    if (route !== 'notifications' && route !== 'search') {
      setReturnRoute(route);
    }
    setRoute(nextRoute);
  };

  const navigate = (destination: LaunchPrimaryDestination) => {
    setRoute(destination);
    setReturnRoute(destination);
  };

  const content = route === 'home' ? (
    <>
      <LaunchHome
        blockers={LAUNCH_SYNTHETIC_BLOCKERS}
        counts={LAUNCH_SYNTHETIC_COUNTS}
        goal={LAUNCH_SYNTHETIC_GOAL}
      />
      <aside aria-label="Track A overlay checks" className="w2a2-preview-checks">
        <button onClick={() => setCaptureOpen(true)} type="button">
          <Mic aria-hidden="true" size={20} />
          Open Capture preview
        </button>
        <span>Presentation-only controls for isolated theme QA.</span>
      </aside>
    </>
  ) : route === 'turnboard' ? (
    <PreviewList kind="turnboard" />
  ) : route === 'crews' ? (
    <PreviewList kind="turnboard" />
  ) : route === 'more' ? (
    <ThemeAwareMorePage
      onNavigate={() => undefined}
      onPreferenceChange={theme.setPreference}
      onRequestSignOut={() => undefined}
      preference={theme.preference}
      profile={{
        currentProperty: 'Moon Tower · Synthetic',
        name: 'Los',
        role: 'Personal supervisor workspace',
      }}
      reducedMotion={theme.reducedMotion}
      resolvedTheme={theme.resolvedTheme}
      statusLabel="Local preview data"
    />
  ) : route === 'search' ? (
    <LaunchSearchPage
      groups={filteredSearchGroups}
      onBack={() => setRoute(returnRoute)}
      onOpenResult={() => setRoute(returnRoute)}
      onQueryChange={setQuery}
      onSelectRecent={setQuery}
      query={query}
      recentSearches={LAUNCH_SYNTHETIC_RECENTS}
    />
  ) : (
    <LaunchNotificationsPage
      activeTab={notificationTab}
      items={LAUNCH_SYNTHETIC_NOTIFICATIONS}
      onBack={() => setRoute(returnRoute)}
      onOpenNotification={() => setRoute(returnRoute)}
      onTabChange={setNotificationTab}
    />
  );

  const externalPlusAction = (
    _action: Exclude<TrackCPlusAction, 'note' | 'camera' | 'photos' | 'files'>,
  ) => {
    void _action;
    setPlusOpen(false);
  };

  return (
    <>
      <Wave2A2UnifiedShell
        activeDestination={activeDestination}
        backgroundInert={overlayOpen}
        contentContained={route === 'turnboard' || route === 'crews'}
        contentDialogOpen={overlayOpen}
        contentFocusKey={route}
        contentTitle={route === 'turnboard'
          ? 'TurnBoard'
          : route.charAt(0).toUpperCase() + route.slice(1)}
        dateLabel={LAUNCH_SYNTHETIC_CONTEXT.dateLabel}
        detailMode={route === 'search' || route === 'notifications'}
        notificationCount={2}
        onNavigate={navigate}
        onOpenIntelligence={() => undefined}
        onOpenNotifications={() => openDetail('notifications')}
        onOpenPlus={() => setPlusOpen(true)}
        onOpenSearch={() => openDetail('search')}
        propertyName={LAUNCH_SYNTHETIC_CONTEXT.propertyName}
        restoreContentScroll={route === 'turnboard'}
        theme={theme}
      >
        {content}
      </Wave2A2UnifiedShell>

      <Wave2A2OverlayBoundary theme={theme}>
        <TrackCNativeFlow
          data={data}
          onDismiss={() => setPlusOpen(false)}
          onExternalAction={externalPlusAction}
          onNativeFiles={() => setPlusOpen(false)}
          onSave={(nextData) => {
            setData(nextData);
            setPlusOpen(false);
          }}
          open={plusOpen}
        />
        <CopilotView
          data={data}
          isOpen={captureOpen}
          onClose={() => setCaptureOpen(false)}
          onNavigate={() => undefined}
          presentation="overlay"
          setData={setData}
        />
      </Wave2A2OverlayBoundary>

      <div className="w2a2-preview-status" aria-hidden="true">
        <Bell size={16} />
        <span>{theme.resolvedTheme}</span>
        <Sparkles size={16} />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <TrackAPreview />
    </ToastProvider>
  </StrictMode>,
);
