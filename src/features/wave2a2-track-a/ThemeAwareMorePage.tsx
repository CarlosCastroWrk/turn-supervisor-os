import { CalendarDays,
  Archive,
  BarChart3,
  Cloud,
  FileText,
  Globe,
  NotebookPen,
  Flag,
  HardDrive,
  Import,
  Laptop,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Activity,
  ClipboardCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
} from '../wave2a1-native/track-b/NativeDetailShell';
import {
  TRACK_B_MORE_GROUPS,
  getTrackBCrewInitials,
  type TrackBMoreAction,
  type TrackBToolDestination,
} from '../wave2a1-native/track-b/model';
import type { TrackBProfileSummary } from '../wave2a1-native/track-b/MoreAndProfile';
import type {
  ResolvedTurnTheme,
  TurnThemePreference,
} from './theme';

const itemIcons: Record<TrackBMoreAction, ReactNode> = {
  'backup-restore': <Archive aria-hidden="true" size={21} />,
  activity: <Activity aria-hidden="true" size={21} />,
  'day-history': <CalendarDays aria-hidden="true" size={21} />,
  crews: <Users aria-hidden="true" size={21} />,
  'my-notes': <NotebookPen aria-hidden="true" size={21} />,
  'official-pds-forms': <FileText aria-hidden="true" size={21} />,
  'field-standard': <ClipboardCheck aria-hidden="true" size={21} />,
  portal: <Globe aria-hidden="true" size={21} />,
  privacy: <ShieldCheck aria-hidden="true" size={21} />,
  profile: <UserRound aria-hidden="true" size={21} />,
  'reports-and-proof': <BarChart3 aria-hidden="true" size={21} />,
  setup: <Settings aria-hidden="true" size={21} />,
  'sign-out': <LogOut aria-hidden="true" size={21} />,
  storage: <HardDrive aria-hidden="true" size={21} />,
  sync: <Cloud aria-hidden="true" size={21} />,
  'unit-import': <Import aria-hidden="true" size={21} />,
};

const themeOptions: readonly {
  id: TurnThemePreference;
  icon: ReactNode;
  label: string;
}[] = [
  { id: 'system', icon: <Laptop aria-hidden="true" size={18} />, label: 'System' },
  { id: 'light', icon: <Sun aria-hidden="true" size={18} />, label: 'Light' },
  { id: 'dark', icon: <Moon aria-hidden="true" size={18} />, label: 'Dark' },
];

export interface ThemeAwareMorePageProps {
  onBack?: () => void;
  onNavigate: (destination: TrackBToolDestination) => void;
  onPreferenceChange: (preference: TurnThemePreference) => void;
  onRequestSignOut: () => void;
  preference: TurnThemePreference;
  profile: TrackBProfileSummary;
  reducedMotion: boolean;
  resolvedTheme: ResolvedTurnTheme;
  statusLabel: string;
}

export function ThemeAwareMorePage({
  onBack,
  onNavigate,
  onPreferenceChange,
  onRequestSignOut,
  preference,
  profile,
  reducedMotion,
  resolvedTheme,
  statusLabel,
}: ThemeAwareMorePageProps) {
  return (
    <NativeDetailShell
      description="Personal field tools, project setup, and device controls."
      onBack={onBack}
      statusLabel={statusLabel}
      title="More"
    >
      <button
        aria-label={`Open profile for ${profile.name}`}
        className="w2a1b-profile-card"
        type="button"
        onClick={() => onNavigate('profile')}
      >
        <span className="w2a1b-avatar" aria-hidden="true">
          {getTrackBCrewInitials(profile.name)}
        </span>
        <span className="w2a1b-profile-card__copy">
          <strong>{profile.name}</strong>
          <span>{profile.currentProperty}</span>
          <small>{profile.role}</small>
        </span>
        <UserRound aria-hidden="true" size={22} />
      </button>

      <GroupedInsetSection
        footer={`Currently ${resolvedTheme}. Motion follows the device accessibility setting${reducedMotion ? ' and is reduced' : ''}.`}
        label="Appearance"
      >
        <div
          aria-label="Theme"
          className="w2a2-theme-picker"
          role="radiogroup"
        >
          {themeOptions.map((option) => (
            <button
              aria-checked={preference === option.id}
              className={preference === option.id ? 'is-selected' : undefined}
              key={option.id}
              onClick={() => onPreferenceChange(option.id)}
              role="radio"
              type="button"
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </GroupedInsetSection>

      {TRACK_B_MORE_GROUPS.map((group) => (
        <GroupedInsetSection key={group.id} label={group.label}>
          {group.items.map((item) => {
            const activate = () => {
              if (item.id === 'sign-out') {
                onRequestSignOut();
                return;
              }
              onNavigate(item.id);
            };

            return (
              <GroupedInsetRow
                danger={item.id === 'sign-out'}
                detail={item.detail}
                icon={itemIcons[item.id]}
                key={item.id}
                label={item.label}
                onActivate={activate}
              />
            );
          })}
        </GroupedInsetSection>
      ))}
    </NativeDetailShell>
  );
}
