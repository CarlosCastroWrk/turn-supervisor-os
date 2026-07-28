import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { seedData } from '../../../data/seed';
import type { AppData } from '../../../types';
import {
  PersonalActivityCard,
  PersonalActivityDetailSheet,
  TrackCNativeFlow,
  TrackCPlusButton,
  projectPersonalActivityViewModel,
  projectPersonalNoteActivity,
  type PersonalActivityViewModel,
  type TrackCNativeFileSelection,
  type TrackCPlusAction,
} from './index';
import './preview.css';

export function TrackCPreview() {
  const [data, setData] = useState<AppData>(() => structuredClone(seedData));
  const [flowOpen, setFlowOpen] = useState(false);
  const [detail, setDetail] = useState<PersonalActivityViewModel | null>(null);
  const [status, setStatus] = useState('');

  const personalActivity = useMemo(
    () =>
      projectPersonalNoteActivity(data).map((activity) =>
        projectPersonalActivityViewModel(data, activity),
      ),
    [data],
  );

  const externalAction = (
    action: Exclude<TrackCPlusAction, 'note' | 'camera' | 'photos' | 'files'>,
  ) => {
    const label = action === 'paste-text' ? 'Paste Text' : action === 'import-work'
      ? 'Import Work'
      : 'Blocker';
    setStatus(`${label} stays with its existing host flow.`);
  };

  const nativeFiles = (selection: TrackCNativeFileSelection) => {
    const count = selection.files.length;
    setStatus(`${count} ${selection.kind} selection${count === 1 ? '' : 's'} returned by the device picker.`);
  };

  return (
    <main className="tc-preview">
      <header className="tc-preview__header">
        <p className="tc-preview__eyebrow">Synthetic Track C preview</p>
        <h1>Personal Activity</h1>
        <p>One direct add menu. Notes save exact wording to personal Activity only.</p>
      </header>

      <section aria-label="Personal Activity" className="tc-preview__activity">
        {status ? <p className="tc-preview__status" role="status">{status}</p> : null}
        {personalActivity.length === 0 ? (
          <p className="tc-preview__empty">
            No personal notes yet. Open Plus, choose Note, and save one directly.
          </p>
        ) : (
          personalActivity.map((item) => (
            <PersonalActivityCard item={item} key={item.activity.id} onOpen={setDetail} />
          ))
        )}
      </section>

      <div className="tc-preview__composer" aria-label="Field composer">
        <TrackCPlusButton onClick={() => setFlowOpen(true)} />
        <span>Add a note, blocker, photo, file, or work</span>
      </div>

      <TrackCNativeFlow
        data={data}
        onDismiss={() => setFlowOpen(false)}
        onExternalAction={externalAction}
        onNativeFiles={nativeFiles}
        onSave={(nextData) => {
          setData(nextData);
          setStatus('Personal note saved to Activity.');
        }}
        open={flowOpen}
      />

      <PersonalActivityDetailSheet
        item={detail}
        onDismiss={() => setDetail(null)}
        onOpenUnit={(unitId: string) => {
          const unit = data.units.find((candidate) => candidate.id === unitId);
          setStatus(`Unit ${unit?.unitNumber ?? unitId} is the linked personal context.`);
          setDetail(null);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackCPreview />
  </StrictMode>,
);
