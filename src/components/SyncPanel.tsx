import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SyncController } from '../lib/supabase/sync';
import { Button, Field } from './FormControls';

interface SyncPanelProps {
  sync: SyncController;
}

const statusLabel = {
  disabled: 'Local only',
  not_configured: 'Needs env',
  signed_out: 'Sign in',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Check sync',
};

export function SyncPanel({ sync }: SyncPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!sync.enabled) {
    return null;
  }

  const submit = async () => {
    setBusy(true);
    await sync.signIn(email, password);
    setBusy(false);
    setPassword('');
  };

  const Icon = sync.status === 'offline' || sync.status === 'error' || sync.status === 'not_configured' ? CloudOff : Cloud;

  return (
    <section className={`sync-panel sync-panel--${sync.status}`} aria-label="Supabase sync">
      <button className="sync-panel__summary" type="button" onClick={() => setOpen((value) => !value)}>
        <Icon size={17} aria-hidden="true" />
        <span>
          <strong>{statusLabel[sync.status]}</strong>
          <small>{sync.email ?? 'Supabase sync'}</small>
        </span>
      </button>

      {open ? (
        <div className="sync-panel__body">
          <p>{sync.message}</p>
          {sync.lastSyncedAt ? <small>Last sync: {new Date(sync.lastSyncedAt).toLocaleTimeString()}</small> : null}

          {sync.status === 'signed_out' || sync.status === 'error' || sync.status === 'not_configured' ? (
            <div className="grid two">
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
              <Button disabled={busy || !email || !password || !sync.configured} onClick={submit} variant="primary">
                <ShieldCheck size={16} aria-hidden="true" />
                Sign in
              </Button>
            </div>
          ) : (
            <div className="button-row">
              <Button disabled={busy} onClick={() => void sync.syncNow()} variant="primary">
                <RefreshCw size={16} aria-hidden="true" />
                Sync now
              </Button>
              <Button disabled={busy} onClick={() => void sync.pullNow()}>
                Pull cloud
              </Button>
              <Button disabled={busy} onClick={() => void sync.uploadNow()}>
                Upload this device
              </Button>
              <Button disabled={busy} onClick={() => void sync.signOut()} variant="ghost">
                Sign out
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
