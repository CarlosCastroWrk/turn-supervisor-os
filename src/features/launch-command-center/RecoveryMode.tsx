import { AlertTriangle, Download, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseJsonBackup } from '../../lib/backups';
import { restoreBlockReason } from '../../lib/restoreSafety';
import {
  APP_DATA_STORAGE_KEY,
  clearInFlightFieldDrafts,
  type AppDataRecoveryState,
} from '../../lib/storage';
import { clearLocalCacheOwner } from '../../lib/supabase/cacheOwnership';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { AppData } from '../../types';
import './recoveryMode.css';

interface RecoveryModeProps {
  recovery: AppDataRecoveryState;
  onResetToDemo: () => Promise<boolean>;
  onRestore: (data: AppData) => boolean;
}

const downloadJson = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function RecoveryMode({
  recovery,
  onResetToDemo,
  onRestore,
}: RecoveryModeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authState, setAuthState] = useState(() => ({
    ready: !getSupabaseClient(),
    signedIn: false,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setAuthState({ ready: true, signedIn: Boolean(data.session) });
      }
    }).catch(() => {
      if (active) setAuthState({ ready: false, signedIn: false });
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAuthState({ ready: true, signedIn: Boolean(session) });
      }
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const restoreGuardMessage = restoreBlockReason({
    authReady: authState.ready,
    signedIn: authState.signedIn,
  });
  const releaseSha = import.meta.env.VITE_ALPHA_GIT_SHA?.trim() || 'local-uncommitted';
  const preservedExport = useMemo(() => ({
    metadata: {
      appVersion: 'Personal Alpha 0.2.1 P0 Recovery',
      capturedAt: recovery.capturedAt,
      exportedAt: new Date().toISOString(),
      originalKey: recovery.originalKey || APP_DATA_STORAGE_KEY,
      releaseSha,
      validationErrors: recovery.issues,
    },
    rawPayload: recovery.rawPayload,
  }), [recovery, releaseSha]);

  const restoreFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      if (restoreGuardMessage) throw new Error(restoreGuardMessage);
      const restored = parseJsonBackup(await file.text());
      if (!clearLocalCacheOwner()) {
        throw new Error('The prior local sync owner could not be cleared. No restore was applied.');
      }
      clearInFlightFieldDrafts();
      if (!onRestore(restored)) {
        throw new Error('The backup passed validation but failed durable browser-storage verification.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be restored.');
      setBusy(false);
    }
  };

  const resetToDemo = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    if (!await onResetToDemo()) {
      setError('Demo reset did not complete. The preserved payload remains available for export.');
      setBusy(false);
    }
  };

  return (
    <main className="recovery-mode" data-testid="recovery-mode">
      <section className="recovery-mode__card">
        <AlertTriangle aria-hidden="true" className="recovery-mode__icon" size={28} />
        <p className="recovery-mode__eyebrow">Protected recovery mode</p>
        <h1>Your saved Turn OS data needs review.</h1>
        <p>
          The original browser payload is preserved. Operational screens and sync are
          paused so demo data cannot replace it.
        </p>

        <div className="recovery-mode__actions">
          <button
            onClick={() => downloadJson(
              `turn-os-preserved-raw-${recovery.capturedAt.slice(0, 10)}.json`,
              preservedExport,
            )}
            type="button"
          >
            <Download aria-hidden="true" size={18} />
            Export preserved raw payload
          </button>
          <button
            disabled={Boolean(restoreGuardMessage) || busy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={18} />
            Restore validated backup
          </button>
          <input
            accept="application/json,.json"
            aria-label="Choose a Turn OS backup"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restoreFile(file);
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {restoreGuardMessage ? (
          <p className="recovery-mode__notice" role="status">{restoreGuardMessage}</p>
        ) : null}
        {error ? <p className="recovery-mode__error" role="alert">{error}</p> : null}

        <details>
          <summary>Validation details ({recovery.issues.length})</summary>
          <ul>
            {recovery.issues.map((issue, index) => (
              <li key={`${issue.path}:${index}`}>
                <strong>{issue.path}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </details>

        <section className="recovery-mode__reset">
          <h2>Reset only if you intend to discard local work</h2>
          <p>
            Reset Demo clears the local records and photos on this device. Export the
            preserved payload first if you may need it.
          </p>
          {confirmReset ? (
            <p className="recovery-mode__error" role="alert">
              This is the final confirmation. Resetting cannot be undone from this device.
            </p>
          ) : null}
          <button disabled={busy} onClick={() => void resetToDemo()} type="button">
            <RotateCcw aria-hidden="true" size={18} />
            {confirmReset ? 'Confirm Reset Demo' : 'Reset Demo'}
          </button>
          {confirmReset ? (
            <button
              className="recovery-mode__cancel"
              disabled={busy}
              onClick={() => setConfirmReset(false)}
              type="button"
            >
              Cancel reset
            </button>
          ) : null}
        </section>
      </section>
    </main>
  );
}
