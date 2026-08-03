import { ArrowLeft, Copy, Globe, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { TrackCState } from '../wave2a2-track-c/model';
import { projectTrackCUnitWork } from '../wave2a2-track-c/projections';

// Read-only property portal for Joseph & Paige. Publishing sends ONLY
// unit-grain work status (paint/clean per unit) — no pay, no pricing, no
// phone numbers, no notes. The link works without an account.

type PortalTradeStatus = 'none' | 'open' | 'working' | 'crew-done' | 'passed' | 'approved';

interface PortalUnitLine {
  n: string;
  p: PortalTradeStatus;
  c: PortalTradeStatus;
  cb?: boolean;
  partial?: boolean;
  // Rooms passed by the supervisor and waiting on the property walk — the
  // portal's "ready" must match the app's WALK queue at ROOM grain.
  pr?: number;
  cr?: number;
  bk?: boolean;
}

const PORTAL_URL_KEY = 'turn-os:portal-share-url';
const PORTAL_UPDATED_KEY = 'turn-os:portal-last-published';

const tradeStatusFor = (
  work: readonly ReturnType<typeof projectTrackCUnitWork>[number][],
): PortalTradeStatus => {
  const released = work.filter((item) => item.release === 'released');
  if (released.length === 0) return 'none';
  if (released.every((item) => item.property === 'property-accepted')) return 'approved';
  if (released.every((item) =>
    item.inspection === 'los-passed' || item.property === 'property-accepted')) return 'passed';
  if (released.every((item) =>
    item.execution === 'crew-reported-complete'
    || item.inspection === 'los-passed'
    || item.property === 'property-accepted')) return 'crew-done';
  if (released.some((item) => ['assigned', 'working'].includes(item.execution))) return 'working';
  return 'open';
};

export const buildPortalUnits = (state: TrackCState): PortalUnitLine[] =>
  state.units.map((unit) => {
    const work = projectTrackCUnitWork(state, unit.id);
    const paint = work.filter((item) => item.trade === 'paint');
    const clean = work.filter((item) => item.trade === 'clean');
    const releasedCount = work.filter((item) => item.release === 'released').length;
    const readyRooms = (items: typeof work) => items.filter((item) =>
      item.release === 'released'
      && item.access === 'clear'
      && item.inspection === 'los-passed'
      && item.property !== 'property-accepted').length;
    const line: PortalUnitLine = {
      n: unit.unitNumber,
      p: tradeStatusFor(paint),
      c: tradeStatusFor(clean),
    };
    const pr = readyRooms(paint);
    const cr = readyRooms(clean);
    if (pr > 0) line.pr = pr;
    if (cr > 0) line.cr = cr;
    if (work.some((item) => item.release === 'released' && item.access !== 'clear')) {
      line.bk = true;
    }
    if (work.some((item) => item.callbackOpen)) line.cb = true;
    if (releasedCount > 0 && releasedCount < work.length) line.partial = true;
    return line;
  }).filter((line) => line.p !== 'none' || line.c !== 'none');

export const PortalPage = ({
  onBack,
  propertyName,
  supervisor,
  state,
}: {
  onBack: () => void;
  propertyName: string;
  supervisor?: string;
  state: TrackCState;
}) => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string | null>(
    () => window.localStorage.getItem(PORTAL_URL_KEY),
  );
  const [lastPublished, setLastPublished] = useState<string | null>(
    () => window.localStorage.getItem(PORTAL_UPDATED_KEY),
  );

  const publish = async () => {
    setBusy(true);
    setStatus(undefined);
    try {
      const client = getSupabaseClient();
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (!session?.access_token) {
        setStatus('Sign in first (More → Storage) — the portal publishes from your account.');
        return;
      }
      const payload = {
        generatedAt: new Date().toISOString(),
        propertyName,
        supervisor: supervisor?.trim() || undefined,
        units: buildPortalUnits(state),
      };
      const response = await fetch('/api/portal/publish', {
        body: JSON.stringify(payload),
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      const body = await response.json().catch(() => undefined) as
        | { ok?: boolean; shareUrl?: string; error?: string }
        | undefined;
      if (!response.ok || !body?.ok) {
        setStatus(body?.error ?? 'The portal could not be updated. Try again.');
        return;
      }
      const stamp = new Date().toISOString();
      setLastPublished(stamp);
      window.localStorage.setItem(PORTAL_UPDATED_KEY, stamp);
      if (body.shareUrl) {
        setShareUrl(body.shareUrl);
        window.localStorage.setItem(PORTAL_URL_KEY, body.shareUrl);
      }
      setStatus(`Portal updated — ${payload.units.length} units published.`);
    } catch {
      setStatus('The portal could not be reached. Check signal and retry.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('Link copied — text it to Joseph or Paige.');
    } catch {
      setStatus(shareUrl);
    }
  };

  return (
    <section aria-labelledby="portal-page-heading" className="w2a2-core-portal">
      <header className="w2a2-core-portal__header">
        <button aria-label="Back to More" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h1 id="portal-page-heading"><Globe aria-hidden="true" size={18} /> Property Portal</h1>
      </header>
      <p className="w2a2-core-portal__copy">
        A read-only web page for Joseph and Paige: which units are working,
        crew-done, Los-passed, and approved. No account needed — they open the
        link and can add it to their home screen. It shows work status only:
        no pay, no pricing, no phone numbers, no notes.
      </p>
      <div className="w2a2-core-portal__actions">
        <button disabled={busy} onClick={() => void publish()} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          {busy ? 'Publishing…' : 'Update portal now'}
        </button>
        <button disabled={!shareUrl} onClick={() => void copyLink()} type="button">
          <Copy aria-hidden="true" size={16} />
          Copy link for Joseph &amp; Paige
        </button>
      </div>
      {lastPublished ? (
        <p className="w2a2-core-portal__stamp">
          Last published {new Date(lastPublished).toLocaleString([], {
            day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short',
          })}
        </p>
      ) : (
        <p className="w2a2-core-portal__stamp">
          Not published yet. Update it once, then the link works.
        </p>
      )}
      {status ? <p aria-live="polite" className="w2a2-core-portal__status">{status}</p> : null}
      <p className="w2a2-core-portal__footnote">
        After the first Update, the portal stays LIVE on its own — every change
        you record republishes automatically within about half a minute. Joseph
        and Paige can also tap units on the portal and request a walk; that
        shows up at the top of your Home.
      </p>
    </section>
  );
};
