import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { SyncController } from '../lib/supabase/sync';
import { Button, Field } from './FormControls';

interface SyncPanelProps {
  sync: SyncController;
  presentation?: 'popover' | 'page';
}

const statusLabel = {
  disabled: 'Local only',
  not_configured: 'Needs env',
  signed_out: 'Sign in',
  syncing: 'Syncing',
  synced: 'Synced',
  pending_upload: 'Upload needed',
  offline: 'Offline',
  error: 'Check sync',
  cache_transition_required: 'Cache needs review',
};

const triggerLabel = {
  local_edit: 'Local edit',
  manual: 'Manual sync',
  pull: 'Pull cloud',
  realtime: 'Realtime',
  reconnect: 'Reconnect',
  startup: 'Startup',
  upload: 'Upload',
};

const formatTime = (value?: string) => (value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Never');

export function SyncPanel({ sync, presentation = 'popover' }: SyncPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(presentation === 'page');
  const [busy, setBusy] = useState(false);
  const syncBusy = busy || sync.status === 'syncing';

  if (!sync.enabled) {
    return null;
  }

  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setBusy(true);
    await sync.signIn(email, password);
    setBusy(false);
    setPassword('');
  };

  const claimLocalCache = async () => {
    const account = sync.email ?? 'the signed-in account';
    const confirmed = window.confirm(
      `Link this device's local Turn data to ${account}? Real Turn records and photos may upload to that account. Continue only if this device's records belong there.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await sync.claimLocalCache();
    } finally {
      setBusy(false);
    }
  };

  const Icon = sync.status === 'offline' || sync.status === 'error' || sync.status === 'not_configured' || sync.status === 'cache_transition_required' ? CloudOff : Cloud;
  const diagnostics = sync.diagnostics;
  const lastUploadedTables = diagnostics.lastUploadedTables?.length ? diagnostics.lastUploadedTables.join(', ') : 'None';
  const bodyVisible = presentation === 'page' || open;

  return (
    <section className={`sync-panel sync-panel--${sync.status} sync-panel--${presentation}`} aria-label="Supabase sync">
      {presentation === 'popover' ? (
        <button className="sync-panel__summary" type="button" onClick={() => setOpen((value) => !value)}>
          <Icon size={17} aria-hidden="true" />
          <span>
            <strong>{statusLabel[sync.status]}</strong>
            <small>{sync.email ?? 'Supabase sync'}</small>
          </span>
        </button>
      ) : null}

      {bodyVisible ? (
        <div className="sync-panel__body">
          <div className="sync-panel__top">
            <div>
              <strong>{sync.email ? 'Sync this device' : 'Sign in to sync'}</strong>
              <p>{sync.message}</p>
            </div>
            {presentation === 'popover' ? (
              <button className="sync-panel__close" type="button" onClick={() => setOpen(false)} aria-label="Close sync panel">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {sync.lastSyncedAt ? <small>Last sync: {new Date(sync.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</small> : null}

          {sync.email ? (
            <details className="sync-diagnostics">
              <summary>Sync details</summary>
              <dl>
                <div>
                  <dt>Last trigger</dt>
                  <dd>{diagnostics.lastTrigger ? triggerLabel[diagnostics.lastTrigger] : 'None yet'}</dd>
                </div>
                <div>
                  <dt>Last table</dt>
                  <dd>{diagnostics.lastTable ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Last event</dt>
                  <dd>{diagnostics.lastEvent ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Pulled rows</dt>
                  <dd>{diagnostics.lastPulledRows ?? 0}</dd>
                </div>
                <div>
                  <dt>Uploaded rows</dt>
                  <dd>{diagnostics.lastUploadedRows ?? 0}</dd>
                </div>
                <div>
                  <dt>Photo files uploaded</dt>
                  <dd>{diagnostics.lastUploadedPhotoFiles ?? 0}</dd>
                </div>
                <div>
                  <dt>Photo files waiting</dt>
                  <dd>{diagnostics.pendingPhotoFiles ?? 0}</dd>
                </div>
                <div>
                  <dt>Photo files not here</dt>
                  <dd>{diagnostics.unavailableLocalPhotoFiles ?? 0}</dd>
                </div>
                <div>
                  <dt>Uploaded tables</dt>
                  <dd>{lastUploadedTables}</dd>
                </div>
                <div>
                  <dt>Background checks</dt>
                  <dd>{diagnostics.backgroundCheckCount}</dd>
                </div>
                <div>
                  <dt>Queued</dt>
                  <dd>{diagnostics.queued ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTime(diagnostics.lastStartedAt)}</dd>
                </div>
                <div>
                  <dt>Finished</dt>
                  <dd>{formatTime(diagnostics.lastFinishedAt)}</dd>
                </div>
                <div className={diagnostics.lastError ? 'sync-diagnostics__error' : ''}>
                  <dt>Last error</dt>
                  <dd>{diagnostics.lastError ?? 'None'}</dd>
                </div>
                <div className={diagnostics.lastPhotoError ? 'sync-diagnostics__error' : ''}>
                  <dt>Last photo error</dt>
                  <dd>{diagnostics.lastPhotoError ?? 'None'}</dd>
                </div>
              </dl>
            </details>
          ) : null}

          {sync.status === 'cache_transition_required' ? (
            <div className="button-row">
              <p>Only claim the local cache if its records belong to this account. Otherwise sign out and use a backup or reset workflow.</p>
              <Button disabled={syncBusy} onClick={() => void claimLocalCache()} variant="primary">
                <ShieldCheck size={16} aria-hidden="true" />
                Claim this device&apos;s local data
              </Button>
              <Button disabled={syncBusy} onClick={() => void sync.signOut()} variant="ghost">
                Sign out safely
              </Button>
            </div>
          ) : sync.status === 'signed_out' || sync.status === 'error' || sync.status === 'not_configured' ? (
            <form className="sync-panel__form" onSubmit={submit}>
              <Field label="Email">
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </Field>
              <Field label="Password">
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Supabase password"
                  type="password"
                  value={password}
                />
              </Field>
              <Button disabled={syncBusy || !email || !password || !sync.configured} type="submit" variant="primary">
                <ShieldCheck size={16} aria-hidden="true" />
                {syncBusy ? 'Signing in...' : 'Sign in and sync'}
              </Button>
            </form>
          ) : (
            <div className="button-row">
              <Button disabled={syncBusy} onClick={() => void sync.syncNow()} variant="primary">
                <RefreshCw size={16} aria-hidden="true" />
                Sync now
              </Button>
              <Button disabled={syncBusy} onClick={() => void sync.pullNow()}>
                Pull cloud
              </Button>
              <Button disabled={syncBusy} onClick={() => void sync.uploadNow()}>
                Check cloud + upload
              </Button>
              <Button disabled={syncBusy} onClick={() => void sync.signOut()} variant="ghost">
                Sign out
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
