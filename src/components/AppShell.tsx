import {
  ClipboardCheck,
  FileText,
  Home,
  ListChecks,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Truck,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppView } from '../types';

interface AppShellProps {
  activeView: AppView;
  captureOpen?: boolean;
  onNavigate: (view: AppView) => void;
  syncSlot?: React.ReactNode;
  children: React.ReactNode;
}

const primaryNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: Home },
  { view: 'units', label: 'Units', icon: ListChecks },
  { view: 'issues', label: 'Issues', icon: ClipboardCheck },
  { view: 'crews', label: 'Crews', icon: Users },
];

const secondaryNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'setup', label: 'Setup', icon: Settings },
  { view: 'assignments', label: 'Assignments', icon: Truck },
  { view: 'reports', label: 'Reports', icon: FileText },
  { view: 'export', label: 'Export', icon: Menu },
];

const sidebarGroups: { label: string; items: { view: AppView; label: string; icon: React.ElementType }[] }[] = [
  { label: 'Field', items: primaryNav },
  { label: 'Plan', items: secondaryNav.filter((item) => ['assignments', 'reports'].includes(item.view)) },
  { label: 'System', items: secondaryNav.filter((item) => ['setup', 'export'].includes(item.view)) },
];

const SIDEBAR_COLLAPSED_KEY = 'turn-supervisor-os:sidebar-collapsed';

const viewTitles: Record<AppView, string> = {
  assignments: 'Assignments',
  copilot: 'Capture',
  crews: 'Crews',
  daily: 'Daily Log',
  dashboard: 'Dashboard',
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

export function AppShell({ activeView, captureOpen = false, onNavigate, syncSlot, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarState);
  const mainRef = useRef<HTMLElement | null>(null);
  const captureButtonRef = useRef<HTMLButtonElement | null>(null);
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
      captureButtonRef.current?.focus({ preventScroll: true });
    }
    captureOriginViewRef.current = null;
  }, [activeView, captureOpen]);

  const focusMainContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${captureOpen ? 'is-capture-open' : ''}`}>
      <a className="skip-link" href="#main-content" onClick={focusMainContent}>
        Skip to main content
      </a>
      <header className="app-header" aria-hidden={captureOpen || undefined} inert={captureOpen || undefined}>
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

        <nav className="secondary-nav" aria-label="Secondary navigation">
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={`secondary-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
                type="button"
                onClick={() => onNavigate(item.view)}
                aria-current={activeNavView === item.view ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="app-main" id="main-content" ref={mainRef} tabIndex={-1} aria-hidden={captureOpen || undefined} inert={captureOpen || undefined}>
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
        aria-hidden={captureOpen || undefined}
        tabIndex={captureOpen ? -1 : undefined}
      >
        <Mic size={24} aria-hidden="true" />
        <span>Capture</span>
      </button>

      <nav className="bottom-nav mobile-nav" aria-label="Primary navigation" aria-hidden={captureOpen || undefined} inert={captureOpen || undefined}>
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={`bottom-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={activeNavView === item.view ? 'page' : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <nav
        className={`side-nav ${sidebarCollapsed ? 'is-collapsed' : ''}`}
        aria-label="Workspace navigation"
        aria-hidden={captureOpen || undefined}
        inert={captureOpen || undefined}
      >
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

        {sidebarGroups.map((group) => (
          <div className="side-nav__group" key={group.label}>
            <span className="side-nav__section-label">{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  className={`side-nav__item ${activeNavView === item.view ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onNavigate(item.view)}
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
        ))}
      </nav>
    </div>
  );
}
