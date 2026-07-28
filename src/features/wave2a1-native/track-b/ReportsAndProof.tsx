import { Archive, Cloud, ShieldCheck } from 'lucide-react';
import {
  TRACK_B_REPORT_METRICS,
  type TrackBReportCounts,
} from './model';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
} from './NativeDetailShell';

export interface TrackBDataStatus {
  label: string;
  detail: string;
  tone: 'ready' | 'attention' | 'unknown';
}
export interface TrackBReportsAndProofPageProps {
  backupStatus: TrackBDataStatus;
  counts: TrackBReportCounts;
  dataScopeLabel: string;
  syncStatus: TrackBDataStatus;
  onBack: () => void;
}

export function TrackBReportsAndProofPage({
  backupStatus,
  counts,
  dataScopeLabel,
  onBack,
  syncStatus,
}: TrackBReportsAndProofPageProps) {
  return (
    <NativeDetailShell
      description="A read-only summary of information already recorded in Turn OS."
      onBack={onBack}
      statusLabel={dataScopeLabel}
      title="Reports and Proof"
    >
      <section className="w2a1b-metrics" aria-label="Recorded field counts">
        {TRACK_B_REPORT_METRICS.map((metric) => (
          <article className="w2a1b-metric" key={metric.id}>
            <strong>{counts[metric.id]}</strong>
            <span>{metric.label}</span>
          </article>
        ))}
      </section>

      <GroupedInsetSection
        label="Data readiness"
        footer="Turn OS reports personal records. Official paper and company systems remain authoritative."
      >
        <GroupedInsetRow
          detail={backupStatus.detail}
          icon={<Archive size={21} />}
          label="Backup"
          tone={backupStatus.tone}
          value={backupStatus.label}
        />
        <GroupedInsetRow
          detail={syncStatus.detail}
          icon={<Cloud size={21} />}
          label="Sync"
          tone={syncStatus.tone}
          value={syncStatus.label}
        />
      </GroupedInsetSection>

      <div className="w2a1b-proof-note">
        <ShieldCheck aria-hidden="true" size={21} />
        <div>
          <strong>Proof boundary</strong>
          <p>
            Counts reflect supplied app data only. This surface does not create approval,
            payroll, property acceptance, or official paper status.
          </p>
        </div>
      </div>
    </NativeDetailShell>
  );
}
