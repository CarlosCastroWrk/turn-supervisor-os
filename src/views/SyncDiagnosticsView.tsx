import { CloudOff, ShieldCheck } from 'lucide-react';
import { Section } from '../components/Section';
import { SyncPanel } from '../components/SyncPanel';
import type { SyncController } from '../lib/supabase/sync';

interface SyncDiagnosticsViewProps {
  sync: SyncController;
}

export function SyncDiagnosticsView({ sync }: SyncDiagnosticsViewProps) {
  const alphaCommit = import.meta.env.VITE_ALPHA_GIT_SHA?.trim()
    || 'Local development build';

  return (
    <div className="page page--sync">
      <header className="field-page-header">
        <div>
          <span className="quiet-label">Device reliability</span>
          <h1>Sync &amp; diagnostics</h1>
          <p>Local save and optional account sync are different states. Paper remains the official record.</p>
        </div>
      </header>

      {!sync.enabled ? (
        <Section title="Local-only mode" kicker="Sync is off">
          <div className="sync-page-state">
            <CloudOff size={24} aria-hidden="true" />
            <div>
              <strong>This device is using local storage only.</strong>
              <p>No account sync is active. Use Data &amp; backup for a separate recovery copy.</p>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Sync this device" kicker={sync.status.replaceAll('_', ' ')}>
          <div className="sync-page-state sync-page-state--enabled">
            <ShieldCheck size={24} aria-hidden="true" />
            <p>Review the current status and use the existing guarded controls below.</p>
          </div>
          <SyncPanel presentation="page" sync={sync} />
        </Section>
      )}

      <Section title="Personal Alpha 0.1" kicker="Release diagnostics">
        <div className="sync-page-state">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <strong>Build commit</strong>
            <p data-alpha-git-sha={alphaCommit}>{alphaCommit}</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
