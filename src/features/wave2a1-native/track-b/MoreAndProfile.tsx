import { CalendarDays,
  Archive,
  ClipboardList,
  Cloud,
  FileText,
  Globe,
  NotebookPen,
  Flag,
  HardDrive,
  Import,
  LockKeyhole,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  Activity,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  TRACK_B_MORE_GROUPS,
  getTrackBCrewInitials,
  type TrackBMoreAction,
  type TrackBToolDestination,
} from './model';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
} from './NativeDetailShell';

const itemIcons: Record<TrackBMoreAction, ReactNode> = {
  'backup-restore': <Archive size={21} />,
  'close-turn': <LockKeyhole size={21} />,
  help: <NotebookPen size={21} />,
  'demo-turn': <Flag size={21} />,
  activity: <Activity aria-hidden="true" size={21} />,
  'day-history': <CalendarDays size={21} />,
  crews: <Users size={21} />,
  'my-notes': <NotebookPen size={21} />,
  'official-pds-forms': <FileText size={21} />,
  'field-standard': <FileText size={21} />,
  portal: <Globe size={21} />,
  privacy: <ShieldCheck size={21} />,
  profile: <UserRound size={21} />,
  setup: <Settings size={21} />,
  'sign-out': <LogOut size={21} />,
  storage: <HardDrive size={21} />,
  sync: <Cloud size={21} />,
  'unit-import': <Import size={21} />,
};

export interface TrackBProfileSummary {
  name: string;
  currentProperty: string;
  role: string;
}

export interface TrackBMorePageProps {
  profile: TrackBProfileSummary;
  statusLabel: string;
  onNavigate: (destination: TrackBToolDestination) => void;
  onRequestSignOut: () => void;
}

export function TrackBMorePage({
  onNavigate,
  onRequestSignOut,
  profile,
  statusLabel,
}: TrackBMorePageProps) {
  return (
    <NativeDetailShell
      description="Personal field tools, project setup, and device controls."
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

export interface TrackBPermission {
  label: string;
  value: string;
  detail?: string;
}

export interface TrackBProfilePageProps extends TrackBProfileSummary {
  appVersion: string;
  dataPermissions: readonly TrackBPermission[];
  preferences: readonly string[];
  statusLabel: string;
  onBack: () => void;
  onRequestSignOut: () => void;
}

export function TrackBProfilePage({
  appVersion,
  currentProperty,
  dataPermissions,
  name,
  onBack,
  onRequestSignOut,
  preferences,
  role,
  statusLabel,
}: TrackBProfilePageProps) {
  return (
    <NativeDetailShell
      description="Personal details and current Turn OS context."
      onBack={onBack}
      statusLabel={statusLabel}
      title="Profile"
    >
      <div className="w2a1b-profile-hero">
        <span className="w2a1b-avatar w2a1b-avatar--large" aria-hidden="true">
          {getTrackBCrewInitials(name)}
        </span>
        <div>
          <strong>{name}</strong>
          <span>Personal Turn OS profile</span>
        </div>
      </div>

      <GroupedInsetSection label="Work">
        <GroupedInsetRow
          icon={<ClipboardList size={21} />}
          label="Current property"
          value={currentProperty}
        />
        <GroupedInsetRow
          icon={<UserRound size={21} />}
          label="Role"
          value={role}
        />
      </GroupedInsetSection>

      <GroupedInsetSection label="Preferences">
        {preferences.length > 0 ? preferences.map((preference) => (
          <GroupedInsetRow
            icon={<SlidersHorizontal size={21} />}
            key={preference}
            label={preference}
          />
        )) : (
          <GroupedInsetRow label="No preferences recorded" />
        )}
      </GroupedInsetSection>

      <GroupedInsetSection
        label="Data permissions"
        footer="These labels describe recorded permissions only. They do not grant device or company access."
      >
        {dataPermissions.length > 0 ? dataPermissions.map((permission) => (
          <GroupedInsetRow
            detail={permission.detail}
            icon={<LockKeyhole size={21} />}
            key={permission.label}
            label={permission.label}
            value={permission.value}
          />
        )) : (
          <GroupedInsetRow label="No permissions recorded" value="Review needed" />
        )}
      </GroupedInsetSection>

      <GroupedInsetSection label="About">
        <GroupedInsetRow label="App version" value={appVersion} />
      </GroupedInsetSection>

      <GroupedInsetSection
        label="Account"
        footer="Preview protection and Turn OS sign-in are separate boundaries."
      >
        <GroupedInsetRow
          danger
          icon={<LogOut size={21} />}
          label="Sign Out"
          onActivate={onRequestSignOut}
        />
      </GroupedInsetSection>
    </NativeDetailShell>
  );
}
