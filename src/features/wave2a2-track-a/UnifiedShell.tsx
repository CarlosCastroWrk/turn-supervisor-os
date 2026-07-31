import {
  Activity,
  Bell,
  Home,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import type {
  LaunchCommandCenterShellProps,
  LaunchPrimaryDestination,
} from '../launch-command-center/types';
import type { TurnThemeState } from './theme';
import './trackA.css';

const navigationItems: readonly {
  id: LaunchPrimaryDestination | 'plus';
  label: string;
  icon: ReactNode;
}[] = [
  { id: 'home', label: 'Home', icon: <Home aria-hidden="true" size={21} /> },
  {
    id: 'turnboard',
    label: 'TurnBoard',
    icon: <ListChecks aria-hidden="true" size={21} />,
  },
  { id: 'plus', label: 'Plus', icon: <Plus aria-hidden="true" size={24} /> },
  {
    id: 'activity',
    label: 'Activity',
    icon: <Activity aria-hidden="true" size={21} />,
  },
  {
    id: 'more',
    label: 'More',
    icon: <MoreHorizontal aria-hidden="true" size={22} />,
  },
];

const scrollRegionSelector = [
  '[data-turn-scroll-region="primary"]',
  '.w1r-unit-list',
  '.w1r-unit-detail__body',
  '.w1r-activity-list',
  '.w1r-more-list',
  '.w2a1-a-scroll-page',
  '.w2a1-a-detail-page__scroll',
  '.w2a1b-page',
  '.track-c-shell__main',
  '.track-c-board',
  '.track-c-crews',
  '.track-c-assignment',
  '.track-c-walk',
].join(',');

const findPrimaryScrollRegion = (main: HTMLElement) => {
  const candidates = [...main.querySelectorAll<HTMLElement>(scrollRegionSelector)];
  return candidates.find((candidate) => (
    candidate.getClientRects().length > 0
    && candidate.scrollHeight > candidate.clientHeight
  )) ?? main;
};

export interface Wave2A2UnifiedShellProps
  extends LaunchCommandCenterShellProps {
  contentOwnsMain?: boolean;
  contentScrollRestoration?: {
    key: string;
    onScrollTopChange?: (scrollTop: number) => void;
    requestToken?: number | string;
    restore: boolean;
    scrollTop?: number;
  };
  detailMode?: boolean;
  /** First-run gate: hide the tab bar and header actions so property setup is
   *  the only path forward until a project exists (or the demo is chosen). */
  onboarding?: boolean;
  onOpenHome?: () => void;
  restoreContentScroll?: boolean;
  theme: Pick<TurnThemeState, 'reducedMotion' | 'resolvedTheme'>;
}

function TurnOsLockup({ onOpenHome }: { onOpenHome: () => void }) {
  return (
    <button
      aria-label="Open Home — Turn OS Supervisor"
      className="w2a2-lockup"
      data-w2a21-home-control="true"
      onClick={onOpenHome}
      type="button"
    >
      <span className="w2a2-lockup__mark" aria-hidden="true">
        <svg viewBox="0 0 512 512" width="22" height="22" fill="none" stroke="currentColor"
          strokeWidth="58" strokeLinecap="round" strokeLinejoin="round">
          <path d="M150 172 H362 M256 172 V300 Q256 352 308 352 H356" />
        </svg>
      </span>
      <span className="w2a2-lockup__name">
        <strong>Turn OS</strong>
        <small>Supervisor</small>
      </span>
    </button>
  );
}

export function Wave2A2UnifiedShell({
  activeDestination,
  backgroundInert = false,
  children,
  contentContained = false,
  contentDialogOpen = false,
  contentFocusKey,
  contentOwnsMain = false,
  contentScrollRestoration,
  contentTitle,
  dateLabel,
  detailMode = false,
  onboarding = false,
  intelligenceAvailable = false,
  notificationCount = 0,
  onNavigate,
  onOpenHome,
  onOpenIntelligence,
  onOpenNotifications,
  onOpenPlus,
  onOpenSearch,
  propertyName,
  restoreContentScroll = false,
  theme,
}: Wave2A2UnifiedShellProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const pendingContentFocusKeyRef = useRef<string | null>(null);
  const previousContentFocusKeyRef = useRef<string | undefined>(undefined);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const contentScrollRestorationRef = useRef(contentScrollRestoration);
  contentScrollRestorationRef.current = contentScrollRestoration;
  const scrollKey = contentScrollRestoration?.key ?? contentFocusKey;
  const scrollRequestToken = contentScrollRestoration?.requestToken;
  const shouldRestoreScroll =
    contentScrollRestoration?.restore ?? restoreContentScroll;
  const setMainRef = (node: HTMLElement | null) => {
    mainRef.current = node;
  };

  useLayoutEffect(() => {
    document.title = `${contentTitle} · Turn OS`;
  }, [contentTitle]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return undefined;
    const scrollPositions = scrollPositionsRef.current;
    const routeScrollRestoration = contentScrollRestorationRef.current;
    let scrollRegion: HTMLElement | null = null;
    let lastKnownPosition = 0;

    const rememberPosition = () => {
      if (scrollRegion) {
        lastKnownPosition = scrollRegion.scrollTop;
        scrollPositions.set(scrollKey, lastKnownPosition);
        routeScrollRestoration?.onScrollTopChange?.(lastKnownPosition);
      }
    };

    const frame = window.requestAnimationFrame(() => {
      scrollRegion = findPrimaryScrollRegion(main);
      scrollRegion.scrollTop = shouldRestoreScroll
        ? routeScrollRestoration?.scrollTop
          ?? scrollPositions.get(scrollKey)
          ?? 0
        : 0;
      lastKnownPosition = scrollRegion.scrollTop;
      scrollRegion.addEventListener('scroll', rememberPosition, { passive: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      scrollRegion?.removeEventListener('scroll', rememberPosition);
      scrollPositions.set(scrollKey, lastKnownPosition);
      routeScrollRestoration?.onScrollTopChange?.(lastKnownPosition);
    };
  }, [
    contentFocusKey,
    scrollKey,
    shouldRestoreScroll,
  ]);

  useLayoutEffect(() => {
    if (scrollRequestToken === undefined) return undefined;
    const main = mainRef.current;
    if (!main) return undefined;
    const scrollPositions = scrollPositionsRef.current;
    const requestedScrollTop = contentScrollRestorationRef.current?.scrollTop;
    const frame = window.requestAnimationFrame(() => {
      const scrollRegion = findPrimaryScrollRegion(main);
      scrollRegion.scrollTop = shouldRestoreScroll
        ? requestedScrollTop
          ?? scrollPositions.get(scrollKey)
          ?? 0
        : 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    contentFocusKey,
    scrollKey,
    scrollRequestToken,
    shouldRestoreScroll,
  ]);

  useLayoutEffect(() => {
    const routeChanged =
      previousContentFocusKeyRef.current !== contentFocusKey;
    previousContentFocusKeyRef.current = contentFocusKey;
    if (routeChanged) {
      pendingContentFocusKeyRef.current = contentFocusKey;
    }
    if (
      backgroundInert
      || pendingContentFocusKeyRef.current !== contentFocusKey
    ) {
      return undefined;
    }
    const main = mainRef.current;
    if (!main) return undefined;

    const frame = window.requestAnimationFrame(() => {
      pendingContentFocusKeyRef.current = null;
      const activeElement = document.activeElement;
      if (
        !activeElement
        || activeElement === document.body
        || !main.contains(activeElement)
      ) {
        main.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [backgroundInert, contentFocusKey]);

  const notificationLabel = notificationCount === 1
    ? 'Open notifications, 1 unread'
    : `Open notifications, ${notificationCount} unread`;

  return (
    <div
      aria-hidden={backgroundInert || undefined}
      className={`w2a2-shell ${detailMode ? 'is-detail-mode' : ''}`}
      data-detail-mode={detailMode || undefined}
      data-reduced-motion={theme.reducedMotion}
      data-testid="launch-command-center-shell"
      data-theme={theme.resolvedTheme}
      data-wave2a2-shell="true"
      inert={backgroundInert || undefined}
    >
      <a className="w2a2-skip-link" href="#launch-command-center-main">
        Skip to main content
      </a>

      <header
        aria-hidden={contentDialogOpen || undefined}
        className="w2a2-header"
        inert={contentDialogOpen || undefined}
      >
        <TurnOsLockup onOpenHome={onOpenHome ?? (() => onNavigate('home'))} />
        <div
          aria-label={`${propertyName}. ${dateLabel}.`}
          className="w2a2-header__context"
        >
          <strong>{propertyName}</strong>
          <span aria-hidden="true">·</span>
          <time>{dateLabel}</time>
        </div>
        <div className="w2a2-header__actions" hidden={onboarding}>
          <button
            aria-label="Open Search"
            data-lcc-critical-target="true"
            data-w2a2-critical-target="true"
            onClick={onOpenSearch}
            type="button"
          >
            <Search aria-hidden="true" size={20} />
          </button>
          <button
            aria-label={notificationLabel}
            data-lcc-critical-target="true"
            data-w2a2-critical-target="true"
            onClick={onOpenNotifications}
            type="button"
          >
            <Bell aria-hidden="true" size={20} />
            {notificationCount > 0 ? (
              <span className="w2a2-header__badge" aria-hidden="true">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            ) : null}
          </button>
          <button
            aria-haspopup={intelligenceAvailable ? 'dialog' : undefined}
            aria-label={intelligenceAvailable
              ? 'Open Turn OS Intelligence'
              : 'Turn OS Intelligence unavailable until a later reviewed release'}
            data-lcc-critical-target="true"
            data-w2a2-critical-target="true"
            disabled={!intelligenceAvailable}
            onClick={() => {
              if (intelligenceAvailable) onOpenIntelligence();
            }}
            title={intelligenceAvailable
              ? 'Open Turn OS Intelligence'
              : 'Reserved for a later reviewed release'}
            type="button"
          >
            <Sparkles aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <div className="w2a2-shell__body">
        <nav
          aria-hidden={contentDialogOpen || detailMode || onboarding || undefined}
          aria-label="Primary"
          className="w2a2-navigation"
          hidden={detailMode || onboarding}
          inert={contentDialogOpen || detailMode || onboarding || undefined}
        >
          {navigationItems.map((item) => {
            if (item.id === 'plus') {
              return (
                <button
                  aria-label="Open central Plus menu"
                  className="w2a2-navigation__plus"
                  data-lcc-critical-target="true"
                  data-w2a2-critical-target="true"
                  id="lcc-central-plus"
                  key={item.id}
                  onClick={onOpenPlus}
                  type="button"
                >
                  <span>{item.icon}</span>
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
                data-w2a2-critical-target="true"
                key={item.id}
                onClick={() => onNavigate(item.id as LaunchPrimaryDestination)}
                type="button"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {contentOwnsMain ? (
          <div
            className={`w2a2-shell__main ${contentContained ? 'is-contained' : ''}`}
            data-route-key={contentFocusKey}
            id="launch-command-center-main"
            ref={setMainRef}
            tabIndex={-1}
          >
            <div className="w2a2-route-surface" key={contentFocusKey}>
              {children}
            </div>
          </div>
        ) : (
          <main
            aria-label={contentTitle}
            className={`w2a2-shell__main ${contentContained ? 'is-contained' : ''}`}
            data-route-key={contentFocusKey}
            id="launch-command-center-main"
            ref={setMainRef}
            tabIndex={-1}
          >
            <div className="w2a2-route-surface" key={contentFocusKey}>
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export function Wave2A2StandaloneRoute({
  children,
  routeName,
  theme,
}: {
  children: ReactNode;
  routeName: string;
  theme: Pick<TurnThemeState, 'reducedMotion' | 'resolvedTheme'>;
}) {
  return (
    <div
      className="w2a2-standalone-route"
      data-reduced-motion={theme.reducedMotion}
      data-route={routeName}
      data-theme={theme.resolvedTheme}
    >
      {children}
    </div>
  );
}
