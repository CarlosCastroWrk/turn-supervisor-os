import {
  ClipboardCheck,
  FileText,
  Home,
  ListChecks,
  Menu,
  Mic,
  Settings,
  ShieldQuestion,
  Truck,
  Users,
} from 'lucide-react';
import type { AppView } from '../types';

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  syncSlot?: React.ReactNode;
  children: React.ReactNode;
}

const primaryNav: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: Home },
  { view: 'copilot', label: 'Capture', icon: Mic },
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

export function AppShell({ activeView, onNavigate, syncSlot, children }: AppShellProps) {
  return (
    <div className="app-shell">
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

      <nav className="bottom-nav" aria-label="Primary navigation">
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
    </div>
  );
}
