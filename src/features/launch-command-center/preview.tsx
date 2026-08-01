import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LAUNCH_SYNTHETIC_BLOCKERS,
  LAUNCH_SYNTHETIC_CONTEXT,
  LAUNCH_SYNTHETIC_COUNTS,
  LAUNCH_SYNTHETIC_GOAL,
  LAUNCH_SYNTHETIC_NOTIFICATIONS,
  LAUNCH_SYNTHETIC_RECENTS,
  LAUNCH_SYNTHETIC_SEARCH_GROUPS,
} from './fixtures';
import {
  LaunchCommandCenterShell,
  LaunchHome,
  LaunchLoginSurface,
  LaunchNotificationsPage,
  LaunchSearchPage,
} from './LaunchCommandCenter';
import { filterLaunchSearchGroups } from './model';
import type {
  LaunchNotificationTab,
  LaunchPrimaryDestination,
  LaunchQuickActionId,
} from './types';
import './preview.css';

type PreviewSurface = 'shell' | 'search' | 'notifications' | 'login';

declare global {
  interface Window {
    __launchTrackAEvents: {
      blockers: string[];
      forgotPassword: number;
      intelligence: number;
      loginSubmits: number;
      navigation: LaunchPrimaryDestination[];
      notificationDestinations: string[];
      plus: number;
      quickActions: LaunchQuickActionId[];
      searchDestinations: string[];
      summaries: string[];
    };
  }
}

window.__launchTrackAEvents = {
  blockers: [],
  forgotPassword: 0,
  intelligence: 0,
  loginSubmits: 0,
  navigation: [],
  notificationDestinations: [],
  plus: 0,
  quickActions: [],
  searchDestinations: [],
  summaries: [],
};

const initialSurface = (): PreviewSurface => {
  const value = new URLSearchParams(window.location.search).get('surface');
  if (value === 'search' || value === 'notifications' || value === 'login') return value;
  return 'shell';
};

export function Preview() {
  const [surface, setSurface] = useState<PreviewSurface>(initialSurface);
  const [activeDestination, setActiveDestination] = useState<LaunchPrimaryDestination>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationTab, setNotificationTab] = useState<LaunchNotificationTab>('all');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const searchGroups = useMemo(
    () => filterLaunchSearchGroups(LAUNCH_SYNTHETIC_SEARCH_GROUPS, searchQuery),
    [searchQuery],
  );
  const offline = new URLSearchParams(window.location.search).get('offline') === '1';

  if (surface === 'login') {
    return (
      <LaunchLoginSurface
        email={email}
        online={!offline}
        onEmailChange={setEmail}
        onForgotPassword={() => { window.__launchTrackAEvents.forgotPassword += 1; }}
        onPasswordChange={setPassword}
        onSubmit={() => { window.__launchTrackAEvents.loginSubmits += 1; }}
        password={password}
        sessionMessage="Synthetic Preview session copy. No authentication request is sent."
      />
    );
  }

  if (surface === 'search') {
    return (
      <LaunchSearchPage
        groups={searchGroups}
        onBack={() => setSurface('shell')}
        onOpenResult={(result) => {
          window.__launchTrackAEvents.searchDestinations.push(result.destinationId);
        }}
        onQueryChange={setSearchQuery}
        onSelectRecent={setSearchQuery}
        query={searchQuery}
        recentSearches={LAUNCH_SYNTHETIC_RECENTS}
      />
    );
  }

  if (surface === 'notifications') {
    return (
      <LaunchNotificationsPage
        activeTab={notificationTab}
        items={LAUNCH_SYNTHETIC_NOTIFICATIONS}
        onBack={() => setSurface('shell')}
        onOpenNotification={(item) => {
          window.__launchTrackAEvents.notificationDestinations.push(item.destinationId);
        }}
        onTabChange={setNotificationTab}
      />
    );
  }

  const primaryContent = activeDestination === 'home' ? (
    <LaunchHome
      blockers={LAUNCH_SYNTHETIC_BLOCKERS}
      counts={LAUNCH_SYNTHETIC_COUNTS}
      goal={LAUNCH_SYNTHETIC_GOAL}
      onOpenBlocker={(blocker) => {
        window.__launchTrackAEvents.blockers.push(blocker.destinationId);
      }}
      onOpenSummary={(summary) => window.__launchTrackAEvents.summaries.push(summary)}
      onQuickAction={(action) => window.__launchTrackAEvents.quickActions.push(action)}
    />
  ) : (
    <section className="lcc-preview-slot" aria-label={`${activeDestination} integration slot`}>
      <h1>{activeDestination === 'turnboard' ? 'TurnBoard' : activeDestination === 'crews' ? 'Activity' : 'More'}</h1>
      <p>Developer Preview slot only. The integration agent supplies the accepted host-owned surface.</p>
    </section>
  );

  return (
    <LaunchCommandCenterShell
      activeDestination={activeDestination}
      contentFocusKey={activeDestination}
      contentTitle={activeDestination === 'home' ? 'Home' : activeDestination === 'turnboard' ? 'TurnBoard' : activeDestination === 'crews' ? 'Activity' : 'More'}
      dateLabel={LAUNCH_SYNTHETIC_CONTEXT.dateLabel}
      notificationCount={LAUNCH_SYNTHETIC_NOTIFICATIONS.filter((item) => !item.read).length}
      onNavigate={(destination) => {
        window.__launchTrackAEvents.navigation.push(destination);
        setActiveDestination(destination);
      }}
      onOpenIntelligence={() => { window.__launchTrackAEvents.intelligence += 1; }}
      onOpenNotifications={() => setSurface('notifications')}
      onOpenPlus={() => { window.__launchTrackAEvents.plus += 1; }}
      onOpenSearch={() => setSurface('search')}
      propertyName={LAUNCH_SYNTHETIC_CONTEXT.propertyName}
    >
      {primaryContent}
    </LaunchCommandCenterShell>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
