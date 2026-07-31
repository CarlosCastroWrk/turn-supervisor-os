import {
  Activity,
  ArrowLeft,
  Bell,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  FileUp,
  Home,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { calculateDailyGoalProgress, filterLaunchNotifications } from './model';
import {
  LAUNCH_NOTIFICATION_TABS,
  LAUNCH_PRIMARY_NAVIGATION,
  LAUNCH_QUICK_ACTIONS,
  type LaunchCommandCenterShellProps,
  type LaunchHomeProps,
  type LaunchLoginSurfaceProps,
  type LaunchNotificationGroupId,
  type LaunchNotificationsPageProps,
  type LaunchPrimaryDestination,
  type LaunchQuickActionId,
  type LaunchSearchGroupId,
  type LaunchSearchPageProps,
} from './types';
import './launchCommandCenter.css';

const navigationIcons: Record<LaunchPrimaryDestination, ReactNode> = {
  activity: <Activity size={20} aria-hidden="true" />,
  home: <Home size={20} aria-hidden="true" />,
  more: <MoreHorizontal size={21} aria-hidden="true" />,
  turnboard: <ListChecks size={20} aria-hidden="true" />,
};

const quickActionIcons: Record<LaunchQuickActionId, ReactNode> = {
  'assign-crews': <Users size={19} aria-hidden="true" />,
  'end-day': <LogOut size={19} aria-hidden="true" />,
  'import-work': <FileUp size={19} aria-hidden="true" />,
  'start-walk': <ClipboardCheck size={19} aria-hidden="true" />,
};

const searchGroupLabels: Record<LaunchSearchGroupId, string> = {
  blockers: 'Blockers',
  callbacks: 'Callbacks',
  crews: 'Crews',
  'notes-activity': 'Notes / Activity',
  units: 'Units',
};

const notificationGroupLabels: Record<LaunchNotificationGroupId, string> = {
  earlier: 'Earlier',
  important: 'Important',
  today: 'Today',
};

function TurnOsLockup() {
  return (
    <span className="lcc-lockup" aria-label="Turn OS, Supervisor">
      <span className="lcc-lockup__mark" aria-hidden="true">TO</span>
      <span className="lcc-lockup__name">
        <strong>Turn OS</strong>
        <small>Supervisor</small>
      </span>
    </span>
  );
}

function LaunchHeader({
  contentDialogOpen,
  dateLabel,
  intelligenceAvailable = false,
  notificationCount,
  onOpenIntelligence,
  onOpenNotifications,
  onOpenSearch,
  propertyName,
}: Pick<
  LaunchCommandCenterShellProps,
  | 'dateLabel'
  | 'contentDialogOpen'
  | 'intelligenceAvailable'
  | 'notificationCount'
  | 'onOpenIntelligence'
  | 'onOpenNotifications'
  | 'onOpenSearch'
  | 'propertyName'
>) {
  const notificationLabel = notificationCount === 1
    ? 'Open notifications, 1 unread'
    : `Open notifications, ${notificationCount ?? 0} unread`;

  return (
    <header
      aria-hidden={contentDialogOpen || undefined}
      className="lcc-header"
      inert={contentDialogOpen || undefined}
    >
      <TurnOsLockup />
      <div className="lcc-header__context" aria-label={`${propertyName}. ${dateLabel}.`}>
        <strong>{propertyName}</strong>
        <span aria-hidden="true">·</span>
        <time>{dateLabel}</time>
      </div>
      <div className="lcc-header__actions">
        <button
          aria-label="Open Search"
          data-lcc-critical-target="true"
          onClick={onOpenSearch}
          type="button"
        >
          <Search size={20} aria-hidden="true" />
        </button>
        <button
          aria-label={notificationLabel}
          data-lcc-critical-target="true"
          onClick={onOpenNotifications}
          type="button"
        >
          <Bell size={20} aria-hidden="true" />
          {(notificationCount ?? 0) > 0 ? (
            <span className="lcc-header__badge" aria-hidden="true">{notificationCount}</span>
          ) : null}
        </button>
        <button
          aria-haspopup="dialog"
          aria-label={intelligenceAvailable
            ? 'Open Turn OS Intelligence'
            : 'Turn OS Intelligence unavailable until a later reviewed release'}
          data-lcc-critical-target="true"
          disabled={!intelligenceAvailable}
          id="lcc-intelligence"
          onClick={() => {
            if (intelligenceAvailable) onOpenIntelligence();
          }}
          title={intelligenceAvailable
            ? 'Open Turn OS Intelligence'
            : 'Unavailable in Wave 2A.1'}
          type="button"
        >
          <Sparkles size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function LaunchNavigation({
  activeDestination,
  contentDialogOpen,
  onNavigate,
  onOpenPlus,
}: Pick<
  LaunchCommandCenterShellProps,
  'activeDestination' | 'contentDialogOpen' | 'onNavigate' | 'onOpenPlus'
>) {
  return (
    <nav
      aria-hidden={contentDialogOpen || undefined}
      aria-label="Primary"
      className="lcc-navigation"
      inert={contentDialogOpen || undefined}
    >
      {LAUNCH_PRIMARY_NAVIGATION.map((item) => {
        if (item.id === 'plus') {
          return (
            <button
              aria-label="Open central add menu"
              className="lcc-navigation__plus"
              data-lcc-critical-target="true"
              id="lcc-central-plus"
              key={item.id}
              onClick={onOpenPlus}
              type="button"
            >
              <span><Plus size={23} aria-hidden="true" /></span>
              <small>{item.label}</small>
            </button>
          );
        }

        const isActive = activeDestination === item.id;
        return (
          <button
            aria-current={isActive ? 'page' : undefined}
            className={isActive ? 'is-active' : undefined}
            data-lcc-critical-target="true"
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            {navigationIcons[item.id]}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function LaunchCommandCenterShell({
  activeDestination,
  backgroundInert = false,
  children,
  contentFocusKey,
  contentContained = false,
  contentDialogOpen = false,
  contentTitle,
  dateLabel,
  intelligenceAvailable = false,
  notificationCount = 0,
  onNavigate,
  onOpenIntelligence,
  onOpenNotifications,
  onOpenPlus,
  onOpenSearch,
  propertyName,
}: LaunchCommandCenterShellProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const previousFocusKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    document.title = `${contentTitle} · Turn OS`;
    const routeChanged = previousFocusKeyRef.current !== contentFocusKey;
    previousFocusKeyRef.current = contentFocusKey;
    if (!routeChanged || backgroundInert) return;
    const frame = window.requestAnimationFrame(() => {
      const main = mainRef.current;
      const activeElement = document.activeElement;
      if (main && activeElement && activeElement !== main && main.contains(activeElement)) {
        return;
      }
      mainRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [backgroundInert, contentFocusKey, contentTitle]);

  return (
    <div
      aria-hidden={backgroundInert || undefined}
      className="lcc-root lcc-shell"
      data-testid="launch-command-center-shell"
      inert={backgroundInert || undefined}
    >
      <a className="lcc-skip-link" href="#launch-command-center-main">
        Skip to main content
      </a>
      <LaunchHeader
        contentDialogOpen={contentDialogOpen}
        dateLabel={dateLabel}
        intelligenceAvailable={intelligenceAvailable}
        notificationCount={notificationCount}
        onOpenIntelligence={onOpenIntelligence}
        onOpenNotifications={onOpenNotifications}
        onOpenSearch={onOpenSearch}
        propertyName={propertyName}
      />
      <div className="lcc-shell__body">
        <LaunchNavigation
          activeDestination={activeDestination}
          contentDialogOpen={contentDialogOpen}
          onNavigate={onNavigate}
          onOpenPlus={onOpenPlus}
        />
        <main
          className={`lcc-shell__main ${contentContained ? 'is-contained' : ''}`}
          id="launch-command-center-main"
          ref={mainRef}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function LaunchHome({
  blockers,
  counts,
  goal,
  onOpenBlocker,
  onOpenSummary,
  onQuickAction,
}: LaunchHomeProps) {
  const progress = calculateDailyGoalProgress(goal.actual, goal.target);

  return (
    <section className="lcc-home" aria-label="Home command center">
      <section
        className={`lcc-goal ${goal.configured ? '' : 'is-unconfigured'}`}
        aria-labelledby="lcc-daily-goal-title"
      >
        <div className="lcc-goal__heading">
          <span>
            <small id="lcc-daily-goal-title">Daily goal</small>
            <strong>
              {goal.configured
                ? `${goal.metric} · ${goal.milestone}`
                : 'Daily goal not configured'}
            </strong>
            {!goal.configured ? (
              <em>Recommended setup: {goal.metric} · {goal.milestone}</em>
            ) : null}
          </span>
          <time dateTime={goal.dateISO}>{goal.dateLabel}</time>
        </div>
        {goal.configured ? (
          <>
            <div className="lcc-goal__numbers">
              <strong>{progress}%</strong>
              <span>{goal.actual} of {goal.target}</span>
            </div>
            <div
              aria-label={`${progress}% of daily goal`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="lcc-progress"
              role="progressbar"
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <p className="lcc-goal__setup-note">
            Complete the personal onboarding goal step before progress is counted.
          </p>
        )}
      </section>

      <section className="lcc-status-grid" aria-label="Current field counts">
        <button
          data-lcc-critical-target="true"
          onClick={() => onOpenSummary?.('working')}
          type="button"
        >
          <strong>{counts.working}</strong>
          <span>Working</span>
        </button>
        <details className="lcc-blocked-summary">
          <summary data-lcc-critical-target="true">
            <strong>{counts.blocked}</strong>
            <span>Blocked</span>
          </summary>
          <div className="lcc-blocked-summary__details">
            {blockers.length > 0 ? blockers.map((blocker) => (
              <button
                data-lcc-critical-target="true"
                key={blocker.id}
                onClick={() => onOpenBlocker?.(blocker)}
                type="button"
              >
                <span><strong>{blocker.unitLabel}</strong><small>{blocker.conciseReason}</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )) : <p>No personal blockers recorded.</p>}
          </div>
        </details>
        <button
          data-lcc-critical-target="true"
          onClick={() => onOpenSummary?.('callbacks')}
          type="button"
        >
          <strong>{counts.callbacks}</strong>
          <span>Callbacks</span>
        </button>
        <button
          data-lcc-critical-target="true"
          onClick={() => onOpenSummary?.('ready-to-walk')}
          type="button"
        >
          <strong>{counts.readyToWalk}</strong>
          <span>Ready to walk</span>
        </button>
      </section>

      <section className="lcc-quick-actions" aria-label="Quick actions">
        {LAUNCH_QUICK_ACTIONS.map((action) => (
          <button
            data-lcc-critical-target="true"
            key={action.id}
            onClick={() => onQuickAction?.(action.id)}
            type="button"
          >
            {quickActionIcons[action.id]}
            <span>{action.label}</span>
          </button>
        ))}
      </section>
    </section>
  );
}

function FullPageHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <header className="lcc-full-page__header">
      <button
        aria-label={`Back from ${title}`}
        data-lcc-critical-target="true"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <h1>{title}</h1>
      <span aria-hidden="true" />
    </header>
  );
}

export function LaunchSearchPage({
  groups,
  onBack,
  onOpenResult,
  onQueryChange,
  onSelectRecent,
  query,
  recentSearches,
}: LaunchSearchPageProps) {
  const resultCount = groups.reduce((count, group) => count + group.results.length, 0);

  return (
    <main className="lcc-root lcc-full-page" data-testid="launch-search-page">
      <FullPageHeader onBack={onBack} title="Search" />
      <div className="lcc-full-page__scroll">
        <label className="lcc-search-input">
          <Search size={20} aria-hidden="true" />
          <span className="lcc-visually-hidden">Search Turn OS</span>
          <input
            autoComplete="off"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Search Units, crews, notes…"
            type="search"
            value={query}
          />
        </label>

        {!query && recentSearches.length > 0 ? (
          <section className="lcc-recents" aria-labelledby="lcc-recents-title">
            <h2 id="lcc-recents-title">Recent searches</h2>
            <div>
              {recentSearches.map((recent) => (
                <button
                  data-lcc-critical-target="true"
                  key={recent}
                  onClick={() => onSelectRecent?.(recent)}
                  type="button"
                >
                  {recent}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="lcc-result-groups" aria-live="polite">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`lcc-search-${group.id}`}>
              <h2 id={`lcc-search-${group.id}`}>
                {searchGroupLabels[group.id]}
                <span>{group.results.length}</span>
              </h2>
              <div className="lcc-result-list">
                {group.results.map((result) => (
                  <button
                    data-lcc-critical-target="true"
                    key={result.id}
                    onClick={() => onOpenResult(result)}
                    type="button"
                  >
                    <span><strong>{result.title}</strong><small>{result.meta}</small></span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {resultCount === 0 ? <p className="lcc-empty-state">No matching personal records.</p> : null}
        </div>
      </div>
    </main>
  );
}

export function LaunchNotificationsPage({
  activeTab,
  items,
  onBack,
  onOpenNotification,
  onTabChange,
}: LaunchNotificationsPageProps) {
  const filteredItems = filterLaunchNotifications(items, activeTab);
  const groups: readonly LaunchNotificationGroupId[] = ['important', 'today', 'earlier'];

  return (
    <main className="lcc-root lcc-full-page" data-testid="launch-notifications-page">
      <FullPageHeader onBack={onBack} title="Notifications" />
      <div className="lcc-notification-tabs" role="tablist" aria-label="Notification filters">
        {LAUNCH_NOTIFICATION_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-active' : undefined}
            data-lcc-critical-target="true"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="lcc-full-page__scroll lcc-notifications">
        {groups.map((group) => {
          const groupItems = filteredItems.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`lcc-notification-${group}`}>
              <h2 id={`lcc-notification-${group}`}>{notificationGroupLabels[group]}</h2>
              <div className="lcc-notification-list">
                {groupItems.map((item) => (
                  <button
                    className={item.read ? 'is-read' : 'is-unread'}
                    data-lcc-critical-target="true"
                    key={item.id}
                    onClick={() => onOpenNotification(item)}
                    type="button"
                  >
                    <span className="lcc-notification-list__dot" aria-hidden="true" />
                    <span className="lcc-notification-list__content">
                      <span><strong>{item.unitLabel}</strong><time>{item.timeLabel}</time></span>
                      {item.tradeSection ? <small>{item.tradeSection}</small> : null}
                      <span>{item.reason}</span>
                      <small>Open {item.destinationLabel}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {filteredItems.length === 0 ? (
          <p className="lcc-empty-state">No notifications in this view.</p>
        ) : null}
      </div>
    </main>
  );
}

export function LaunchLoginSurface({
  busy = false,
  email,
  online,
  onEmailChange,
  onForgotPassword,
  onPasswordChange,
  onSubmit,
  password,
  recovery,
  sessionMessage,
}: LaunchLoginSurfaceProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <main className="lcc-root lcc-login" data-testid="launch-login-surface">
      <section className="lcc-login__panel" aria-labelledby="lcc-login-title">
        <div className="lcc-login__brand">
          <span className="lcc-login__mark" aria-hidden="true">
            <svg viewBox="0 0 512 512" width="32" height="32" fill="none" stroke="currentColor"
              strokeWidth="58" strokeLinecap="round" strokeLinejoin="round">
              <path d="M150 172 H362 M256 172 V300 Q256 352 308 352 H356" />
            </svg>
          </span>
          <span>
            <strong>Turn OS</strong>
            <small>Supervisor</small>
          </span>
        </div>
        <div className="lcc-login__heading">
          <h1 id="lcc-login-title">Welcome back</h1>
          <p>Sign in to continue your personal Turn workspace.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => onEmailChange(event.currentTarget.value)}
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => onPasswordChange(event.currentTarget.value)}
              type="password"
              value={password}
            />
          </label>
          <button
            className="lcc-login__forgot"
            data-lcc-critical-target="true"
            onClick={onForgotPassword}
            type="button"
          >
            Forgot password?
          </button>
          <button
            className="lcc-login__submit"
            data-lcc-critical-target="true"
            disabled={busy || !online}
            type="submit"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className={`lcc-login__session ${online ? 'is-online' : 'is-offline'}`} role="status">
          <CalendarCheck size={18} aria-hidden="true" />
          <p>
            <strong>{online ? 'Connection available' : 'Offline'}</strong>
            <span>{online
              ? (sessionMessage ?? 'Your existing authenticated session can reopen this local workspace.')
              : (sessionMessage
                  ?? 'Sign-in needs a connection. Saved field data stays locked unless a previously authenticated account matches this device cache.')}</span>
          </p>
        </div>
        {recovery ? <div className="lcc-login__recovery">{recovery}</div> : null}
      </section>
    </main>
  );
}
