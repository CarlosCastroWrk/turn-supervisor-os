import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  FileText,
  Home,
  ListChecks,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppDataSaveStatus } from '../lib/storage';
import type { AppView } from '../types';

interface AppShellProps {
  activeView: AppView;
  captureOpen?: boolean;
  onNavigate: (view: AppView) => void;
  onOpenBackup?: () => void;
  onRetrySave?: () => boolean;
  saveStatus?: AppDataSaveStatus;
  syncSlot?: React.ReactNode;
  children: React.ReactNode;
}

const fieldNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Home', icon: Home },
  { view: 'units', label: 'Units', icon: ListChecks },
  { view: 'issues', label: 'Issues', icon: ClipboardCheck },
  { view: 'crews', label: 'Crew', icon: Users },
  { view: 'reports', label: 'Reports', icon: FileText },
  { view: 'setup', label: 'Setup', icon: Settings },
];

const mobilePrimaryNav = fieldNav.filter((item) => ['dashboard', 'units', 'issues'].includes(item.view));
const mobileMoreNav: { view: AppView; label: string; detail: string; icon: React.ElementType }[] = [
  { view: 'crews', label: 'Crew', detail: 'Contacts and field notes', icon: Users },
  { view: 'reports', label: 'Reports', detail: 'Review and share the day', icon: FileText },
  { view: 'setup', label: 'Setup', detail: 'Project, memory, and AI usage', icon: Settings },
  { view: 'export', label: 'Data & backup', detail: 'Export, restore, and device safety', icon: Download },
];

const SIDEBAR_COLLAPSED_KEY = 'turn-supervisor-os:sidebar-collapsed';

const viewTitles: Record<AppView, string> = {
  assignments: 'Assignments',
  copilot: 'Capture',
  crews: 'Crews',
  daily: 'Daily Log',
  dashboard: 'Home',
  export: 'Export',
  issues: 'Issues',
  reports: 'Reports',
  setup: 'Setup',
  training: 'Training Questions',
  unitDetail: 'Unit Detail',
  units: 'Units',
};

const getStoredSidebarState = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

export function AppShell({
  activeView,
  captureOpen = false,
  onNavigate,
  onOpenBackup,
  onRetrySave,
  saveStatus,
  syncSlot,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarState);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const captureButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileCaptureButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMoreCloseRef = useRef<HTMLButtonElement | null>(null);
  const mobileMoreSheetRef = useRef<HTMLElement | null>(null);
  const restoreMobileMoreFocusRef = useRef(false);
  const captureOriginViewRef = useRef<AppView | null>(null);
  const previousViewRef = useRef(activeView);
  const activeNavView = activeView === 'unitDetail' ? 'units' : activeView;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      // Layout preference is non-critical; private browsing can block localStorage.
    }
  }, [sidebarCollapsed]);

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
      const visibleTrigger = [mobileCaptureButtonRef.current, captureButtonRef.current]
        .find((button) => button && button.getClientRects().length > 0);
      visibleTrigger?.focus({ preventScroll: true });
    }
    captureOriginViewRef.current = null;
  }, [activeView, captureOpen]);

  useEffect(() => {
    if (!mobileMoreOpen) {
      if (restoreMobileMoreFocusRef.current) {
        restoreMobileMoreFocusRef.current = false;
        mobileMoreButtonRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    mobileMoreCloseRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreMobileMoreFocusRef.current = true;
        setMobileMoreOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !mobileMoreSheetRef.current) {
        return;
      }

      const focusable = Array.from(
        mobileMoreSheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((element) => !element.hasAttribute('hidden'));

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMoreOpen]);

  const focusMainContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus({ preventScroll: true });
  };

  const navigateTo = (view: AppView) => {
    setMobileMoreOpen(false);
    onNavigate(view);
  };

  const closeMobileMore = () => {
    restoreMobileMoreFocusRef.current = true;
    setMobileMoreOpen(false);
  };

  const backgroundHidden = captureOpen || mobileMoreOpen;

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${captureOpen ? 'is-capture-open' : ''}`}>
      <a className="skip-link" href="#main-content" onClick={focusMainContent}>
        Skip to main content
      </a>
      <header className="app-header" aria-hidden={backgroundHidden || undefined} inert={backgroundHidden || undefined}>
        <div className="header-main">
          <button className="brand-button" type="button" onClick={() => onNavigate('dashboard')}>
            <span className="brand-mark">TS</span>
            <span>
              <strong>Turn Supervisor OS</strong>
              <small>Private field notebook</small>
            </span>
          </button>
          {syncSlot}
        </div>
      </header>

      <main className="app-main" id="main-content" ref={mainRef} tabIndex={-1} aria-hidden={backgroundHidden || undefined} inert={backgroundHidden || undefined}>
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

      <button
        ref={captureButtonRef}
        className={`floating-capture ${activeView === 'copilot' || captureOpen ? 'is-active' : ''}`}
        type="button"
        onClick={() => onNavigate('copilot')}
        aria-label="Open Capture"
        aria-expanded={captureOpen}
        aria-haspopup="dialog"
        aria-hidden={backgroundHidden || undefined}
        tabIndex={backgroundHidden ? -1 : undefined}
      >
        <Mic size={24} aria-hidden="true" />
        <span>Capture</span>
      </button>

      {mobileMoreOpen && !captureOpen ? (
        <div className="mobile-more-backdrop" role="presentation" onMouseDown={closeMobileMore}>
          <section
            ref={mobileMoreSheetRef}
            className="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobile-more-sheet__header">
              <div>
                <span className="quiet-label">Turn Field Copilot</span>
                <h2 id="mobile-more-title">More</h2>
              </div>
              <button ref={mobileMoreCloseRef} className="icon-button" type="button" onClick={closeMobileMore} aria-label="Close More menu">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more-sheet__items">
              {mobileMoreNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.view} type="button" onClick={() => navigateTo(item.view)}>
                    <Icon size={22} aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <nav className="bottom-nav mobile-nav" aria-label="Primary navigation" aria-hidden={backgroundHidden || undefined} inert={backgroundHidden || undefined}>
        {mobilePrimaryNav.slice(0, 2).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={`bottom-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigateTo(item.view)}
              aria-current={activeNavView === item.view ? 'page' : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          ref={mobileCaptureButtonRef}
          className="bottom-nav__capture"
          type="button"
          onClick={() => navigateTo('copilot')}
          aria-label="Open Capture"
          aria-expanded={captureOpen}
          aria-haspopup="dialog"
        >
          <span><Mic size={25} aria-hidden="true" /></span>
          <strong>Capture</strong>
        </button>
        {mobilePrimaryNav.slice(2).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={`bottom-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigateTo(item.view)}
              aria-current={activeNavView === item.view ? 'page' : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          ref={mobileMoreButtonRef}
          className={`bottom-nav__item ${mobileMoreOpen || ['crews', 'reports', 'setup', 'export'].includes(activeNavView) ? 'is-active' : ''}`}
          type="button"
          onClick={() => (mobileMoreOpen ? closeMobileMore() : setMobileMoreOpen(true))}
          aria-expanded={mobileMoreOpen}
          aria-haspopup="dialog"
        >
          <MoreHorizontal size={21} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <nav
        className={`side-nav ${sidebarCollapsed ? 'is-collapsed' : ''}`}
        aria-label="Workspace navigation"
        aria-hidden={backgroundHidden || undefined}
        inert={backgroundHidden || undefined}
      >
        <button className="side-nav__brand" type="button" onClick={() => navigateTo('dashboard')} aria-label="Open Home">
          <span className="brand-mark">TS</span>
          <span aria-hidden={sidebarCollapsed}>
            <strong>Turn Field Copilot</strong>
            <small>Los's private notebook</small>
          </span>
        </button>
        <button
          className="side-nav__toggle"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
          title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
          <span aria-hidden={sidebarCollapsed}>Menu</span>
        </button>

        <div className="side-nav__group">
          {fieldNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={`side-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
                type="button"
                onClick={() => navigateTo(item.view)}
                aria-current={activeNavView === item.view ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
              >
                <Icon size={20} aria-hidden="true" />
                <span aria-hidden={sidebarCollapsed}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <button
          className={`side-nav__utility ${activeNavView === 'export' ? 'is-active' : ''}`}
          type="button"
          onClick={() => navigateTo('export')}
          aria-label="Data and backup"
          title="Data and backup"
        >
          <Download size={19} aria-hidden="true" />
          <span aria-hidden={sidebarCollapsed}>Data & backup</span>
        </button>
      </nav>
    </div>
  );
}
