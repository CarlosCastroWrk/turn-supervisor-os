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
  ShieldQuestion,
  Truck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppView } from '../types';

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  syncSlot?: React.ReactNode;
  children: React.ReactNode;
}

const primaryNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: Home },
  { view: 'units', label: 'Units', icon: ListChecks },
  { view: 'issues', label: 'Issues', icon: ClipboardCheck },
  { view: 'crews', label: 'Crews', icon: Users },
  { view: 'daily', label: 'Daily Log', icon: FileText },
];

const secondaryNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'setup', label: 'Setup', icon: Settings },
  { view: 'assignments', label: 'Assignments', icon: Truck },
  { view: 'reports', label: 'Reports', icon: FileText },
  { view: 'training', label: 'Training Questions', icon: ShieldQuestion },
  { view: 'export', label: 'Export', icon: Menu },
];

const sidebarGroups: { label: string; items: { view: AppView; label: string; icon: React.ElementType }[] }[] = [
  { label: 'Field', items: primaryNav },
  { label: 'Plan', items: secondaryNav.filter((item) => ['assignments', 'reports'].includes(item.view)) },
  { label: 'System', items: secondaryNav.filter((item) => ['setup', 'training', 'export'].includes(item.view)) },
];

const SIDEBAR_COLLAPSED_KEY = 'turn-supervisor-os:sidebar-collapsed';

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

export function AppShell({ activeView, onNavigate, syncSlot, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarState);

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

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <header className="app-header">
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
                className={`secondary-nav__item ${activeView === item.view ? 'is-active' : ''}`}
                type="button"
                onClick={() => onNavigate(item.view)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="app-main">{children}</main>

      <button
        className={`floating-capture ${activeView === 'copilot' ? 'is-active' : ''}`}
        type="button"
        onClick={() => onNavigate('copilot')}
        aria-label="Open Capture"
      >
        <Mic size={24} aria-hidden="true" />
        <span>Capture</span>
      </button>

      <nav className="bottom-nav mobile-nav" aria-label="Primary navigation">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={`bottom-nav__item ${activeView === item.view ? 'is-active' : ''}`}
              type="button"
              onClick={() => onNavigate(item.view)}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <aside className={`side-nav ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Workspace navigation">
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
                  className={`side-nav__item ${activeView === item.view ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onNavigate(item.view)}
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
      </aside>
    </div>
  );
}
