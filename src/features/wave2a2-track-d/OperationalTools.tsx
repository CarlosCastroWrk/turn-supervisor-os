import {
  Archive,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Cloud,
  ExternalLink,
  FileText,
  FolderInput,
  HardDrive,
  Languages,
  ListChecks,
  LockKeyhole,
  LogOut,
  MoonStar,
  Palette,
  RefreshCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SunMedium,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  buildTrackDReportMetrics,
  displayPermissionValue,
  TRACK_D_MORE_GROUPS,
  TRACK_D_OFFICIAL_FORMS,
  type TrackDMoreDestination,
  type TrackDPermissionRecord,
  type TrackDReportMetricId,
  type TrackDReportRecordLink,
} from './model';
import {
  TrackDPage,
  TrackDRow,
  TrackDSection,
} from './TrackDPrimitives';

const moreIcons: Record<TrackDMoreDestination, ReactNode> = {
  crews: <Users size={21} />,
  'reports-and-proof': <BarChart3 size={21} />,
  'official-pds-forms': <FileText size={21} />,
  setup: <Settings size={21} />,
  'property-roster': <BriefcaseBusiness size={21} />,
  'unit-import': <FolderInput size={21} />,
  'todays-task': <ListChecks size={21} />,
  'day-sessions': <RefreshCcw size={21} />,
  'backup-restore': <Archive size={21} />,
  sync: <Cloud size={21} />,
  privacy: <ShieldCheck size={21} />,
  storage: <HardDrive size={21} />,
  'photo-permissions': <LockKeyhole size={21} />,
  appearance: <Palette size={21} />,
  language: <Languages size={21} />,
  notifications: <Bell size={21} />,
  'reduced-motion': <SlidersHorizontal size={21} />,
  profile: <UserRound size={21} />,
  'sign-out': <LogOut size={21} />,
};

export interface TrackDProfileSummary {
  currentProperty: string;
  name: string;
  role: string;
}

export interface TrackDMoreAvailability {
  available: boolean;
  detail?: string;
  value?: string;
}

export interface TrackDMoreSurfaceProps {
  availability: Partial<
    Record<TrackDMoreDestination, TrackDMoreAvailability>
  >;
  onBack?: () => void;
  onNavigate: (destination: TrackDMoreDestination) => void;
  profile: TrackDProfileSummary;
}

export function TrackDMoreSurface({
  availability,
  onBack,
  onNavigate,
  profile,
}: TrackDMoreSurfaceProps) {
  return (
    <TrackDPage
      description="Personal field tools, setup, and data controls."
      onBack={onBack}
      statusLabel="Personal Turn OS"
      title="More"
    >
      <button
        aria-label={`Open profile for ${profile.name}`}
        className="w2a2d-profile-card"
        disabled={!availability.profile?.available}
        onClick={() => onNavigate('profile')}
        type="button"
      >
        <span className="w2a2d-avatar" aria-hidden="true">
          {initials(profile.name)}
        </span>
        <span>
          <strong>{profile.name}</strong>
          <span>{profile.currentProperty}</span>
          <small>{profile.role}</small>
        </span>
        <ChevronRight aria-hidden="true" size={20} />
      </button>

      {TRACK_D_MORE_GROUPS.map((group) => (
        <TrackDSection key={group.id} label={group.label}>
          {group.items.map((item) => {
            const state = availability[item.id];
            const available = state?.available === true;
            return (
              <TrackDRow
                danger={item.id === 'sign-out'}
                detail={
                  state?.detail ??
                  (available ? undefined : 'Not connected by the host')
                }
                disabled={!available}
                icon={moreIcons[item.id]}
                key={item.id}
                label={item.label}
                onActivate={
                  available ? () => onNavigate(item.id) : undefined
                }
                value={state?.value}
              />
            );
          })}
        </TrackDSection>
      ))}
    </TrackDPage>
  );
}

export interface TrackDProfileSurfaceProps extends TrackDProfileSummary {
  appVersion: string;
  onBack?: () => void;
  onSignOut?: () => void;
  permissions: readonly TrackDPermissionRecord[];
  preferences: {
    appearance?: 'System' | 'Light' | 'Dark';
    language?: string;
    notifications?: string;
    reducedMotion?: string;
  };
}

export function TrackDProfileSurface({
  appVersion,
  currentProperty,
  name,
  onBack,
  onSignOut,
  permissions,
  preferences,
  role,
}: TrackDProfileSurfaceProps) {
  return (
    <TrackDPage
      description="Personal details, preferences, and recorded data permissions."
      onBack={onBack}
      title="Profile"
    >
      <section className="w2a2d-profile-hero">
        <span className="w2a2d-avatar w2a2d-avatar--large" aria-hidden="true">
          {initials(name)}
        </span>
        <div>
          <strong>{name}</strong>
          <span>Personal Turn OS profile</span>
        </div>
      </section>

      <TrackDSection label="Work">
        <TrackDRow label="Current property" value={currentProperty || 'Not recorded'} />
        <TrackDRow label="Role" value={role || 'Not recorded'} />
      </TrackDSection>

      <TrackDSection label="Preferences">
        <TrackDRow
          icon={<Palette size={21} />}
          label="Appearance"
          value={preferences.appearance ?? 'Not recorded'}
        />
        <TrackDRow
          icon={<Languages size={21} />}
          label="Language"
          value={preferences.language?.trim() || 'Not recorded'}
        />
        <TrackDRow
          icon={<Bell size={21} />}
          label="Notifications"
          value={preferences.notifications?.trim() || 'Not recorded'}
        />
        <TrackDRow
          icon={<SlidersHorizontal size={21} />}
          label="Reduced motion"
          value={preferences.reducedMotion?.trim() || 'Not recorded'}
        />
      </TrackDSection>

      <TrackDSection
        footer="Recorded labels describe current knowledge only; they do not grant device or company access."
        label="Data permissions"
      >
        {permissions.length > 0 ? (
          permissions.map((permission) => (
            <TrackDRow
              detail={permission.detail}
              icon={<LockKeyhole size={21} />}
              key={permission.id}
              label={permission.label}
              value={displayPermissionValue(permission)}
            />
          ))
        ) : (
          <TrackDRow label="Permissions" value="Not recorded" />
        )}
      </TrackDSection>

      <TrackDSection label="About">
        <TrackDRow label="App version" value={appVersion || 'Not recorded'} />
      </TrackDSection>

      <TrackDSection
        footer="Preview protection and Turn OS sign-in are separate boundaries."
        label="Account"
      >
        <TrackDRow
          danger
          disabled={!onSignOut}
          icon={<LogOut size={21} />}
          label="Sign Out"
          onActivate={onSignOut}
        />
      </TrackDSection>
    </TrackDPage>
  );
}

const requiredPermissionLabels: Readonly<
  Record<TrackDPermissionRecord['id'], string>
> = {
  'development-mode': 'Development mode',
  'local-storage': 'Local storage',
  'synced-storage': 'Synced storage',
  'ai-processing': 'AI processing permission',
  photo: 'Photo permission',
  'contact-phone': 'Contact/phone permission',
};

export interface TrackDPrivacySurfaceProps {
  onBack?: () => void;
  permissions: readonly TrackDPermissionRecord[];
}

export function TrackDPrivacySurface({
  onBack,
  permissions,
}: TrackDPrivacySurfaceProps) {
  const byId = new Map(permissions.map((permission) => [permission.id, permission]));
  return (
    <TrackDPage
      description="What is recorded about local, synced, AI, photo, and contact access."
      onBack={onBack}
      statusLabel="Unknown states remain unknown"
      title="Privacy"
    >
      <div className="w2a2d-boundary-banner">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>Permission truth</strong>
          <p>
            Turn OS must not display a permission as granted unless the host has
            a verified record.
          </p>
        </div>
      </div>

      <TrackDSection
        footer="Development mode, device storage, sync, AI processing, photos, and contacts are separate boundaries."
        label="Recorded state"
      >
        {(Object.keys(requiredPermissionLabels) as TrackDPermissionRecord['id'][]).map(
          (id) => {
            const permission = byId.get(id);
            return (
              <TrackDRow
                detail={permission?.detail}
                icon={privacyIcon(id)}
                key={id}
                label={requiredPermissionLabels[id]}
                value={
                  permission ? displayPermissionValue(permission) : 'Not recorded'
                }
              />
            );
          },
        )}
      </TrackDSection>
    </TrackDPage>
  );
}

export interface TrackDOfficialFormsSurfaceProps {
  onBack?: () => void;
}

export function TrackDOfficialFormsSurface({
  onBack,
}: TrackDOfficialFormsSurfaceProps) {
  return (
    <TrackDPage
      description="Exact official PDS destinations, opened outside Turn OS."
      onBack={onBack}
      statusLabel="External official forms"
      title="Official PDS Forms"
    >
      <div className="w2a2d-boundary-banner">
        <ExternalLink aria-hidden="true" size={22} />
        <div>
          <strong>External handoff</strong>
          <p>
            Turn OS does not prefill, submit, sign, store QR codes, or scrape
            completed forms.
          </p>
        </div>
      </div>

      <TrackDSection label="Forms">
        {TRACK_D_OFFICIAL_FORMS.map((form) => (
          <a
            className="w2a2d-row"
            href={form.url}
            key={form.id}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="w2a2d-row__icon" aria-hidden="true">
              <FileText size={21} />
            </span>
            <span className="w2a2d-row__copy">
              <strong>{form.label}</strong>
              <small>Official PDS form · opens externally</small>
            </span>
            <ExternalLink aria-hidden="true" size={18} />
          </a>
        ))}
      </TrackDSection>
    </TrackDPage>
  );
}

export interface TrackDCrewReport {
  crewId: string;
  crewName: string;
  currentAssignments: readonly TrackDReportRecordLink[];
  reportedComplete: readonly TrackDReportRecordLink[];
  losPassed: readonly TrackDReportRecordLink[];
  callbacksOpen: readonly TrackDReportRecordLink[];
  callbacksResolved: readonly TrackDReportRecordLink[];
  propertyAccepted: readonly TrackDReportRecordLink[];
}

export interface TrackDReportsAndProofProps {
  crewReports?: readonly TrackDCrewReport[];
  onBack?: () => void;
  onOpenCrewRecords?: (
    crewId: string,
    category: keyof Omit<TrackDCrewReport, 'crewId' | 'crewName'>,
    recordIds: readonly string[],
  ) => void;
  onOpenRecords: (
    metricId: TrackDReportMetricId,
    recordIds: readonly string[],
  ) => void;
  recordsByMetric: Partial<
    Record<TrackDReportMetricId, readonly TrackDReportRecordLink[]>
  >;
  statuses?: Partial<Record<TrackDReportMetricId, string>>;
}

export function TrackDReportsAndProof({
  crewReports = [],
  onBack,
  onOpenCrewRecords,
  onOpenRecords,
  recordsByMetric,
  statuses = {},
}: TrackDReportsAndProofProps) {
  const metrics = buildTrackDReportMetrics(recordsByMetric, statuses);
  return (
    <TrackDPage
      description="Counts derived from exact personal-app records supplied by the host."
      onBack={onBack}
      statusLabel="Read-only personal summary"
      title="Reports and Proof"
    >
      <div className="w2a2d-boundary-banner">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>Proof boundary</strong>
          <p>
            These cards do not calculate payroll or claim time saved. Official
            paper and company systems remain authoritative.
          </p>
        </div>
      </div>

      <section aria-label="Project record summaries" className="w2a2d-report-grid">
        {metrics.map((metric) => (
          <button
            className="w2a2d-report-card"
            key={metric.id}
            onClick={() =>
              onOpenRecords(
                metric.id,
                metric.records.map((record) => record.id),
              )
            }
            type="button"
          >
            <strong>{metric.statusLabel ?? metric.records.length}</strong>
            <span>{metric.label}</span>
            <small>
              {metric.records.length} linked record
              {metric.records.length === 1 ? '' : 's'}
            </small>
          </button>
        ))}
      </section>

      {crewReports.length > 0 ? (
        <section className="w2a2d-crew-reports" aria-labelledby="crew-reports-label">
          <h2 id="crew-reports-label">Crew reports</h2>
          {crewReports.map((crew) => (
            <article key={crew.crewId}>
              <h3>{crew.crewName}</h3>
              {crewMetricEntries(crew).map(([category, label, records]) => (
                <button
                  disabled={!onOpenCrewRecords}
                  key={category}
                  onClick={() =>
                    onOpenCrewRecords?.(
                      crew.crewId,
                      category,
                      records.map((record) => record.id),
                    )
                  }
                  type="button"
                >
                  <span>{label}</span>
                  <strong>{records.length}</strong>
                </button>
              ))}
            </article>
          ))}
        </section>
      ) : null}
    </TrackDPage>
  );
}

const crewMetricEntries = (
  crew: TrackDCrewReport,
): readonly [
  keyof Omit<TrackDCrewReport, 'crewId' | 'crewName'>,
  string,
  readonly TrackDReportRecordLink[],
][] => [
  ['currentAssignments', 'Current assignments', crew.currentAssignments],
  ['reportedComplete', 'Reported complete', crew.reportedComplete],
  ['losPassed', 'Los passed', crew.losPassed],
  ['callbacksOpen', 'Callbacks open', crew.callbacksOpen],
  ['callbacksResolved', 'Callbacks resolved', crew.callbacksResolved],
  ['propertyAccepted', 'Property accepted', crew.propertyAccepted],
];

const privacyIcon = (id: TrackDPermissionRecord['id']) => {
  if (id === 'development-mode') return <Settings size={21} />;
  if (id === 'local-storage') return <HardDrive size={21} />;
  if (id === 'synced-storage') return <Cloud size={21} />;
  if (id === 'ai-processing') return <MoonStar size={21} />;
  if (id === 'photo') return <SunMedium size={21} />;
  return <LockKeyhole size={21} />;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('en-US') ?? '')
    .join('') || 'L';
