import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TurnCommandBar } from '../../components/TurnCommandBar';
import '../../styles.css';
import { JUL28_SYNTHETIC_FIELD_SHELL } from './fixtures';
import { TodayFieldShell } from './TodayFieldShell';

export function Preview() {
  const [status, setStatus] = useState('Candidate ready. No operational record has changed.');

  return (
    <>
      <TodayFieldShell
        model={JUL28_SYNTHETIC_FIELD_SHELL}
        commandBarSlot={(
          <TurnCommandBar
            onOpenCapture={(entry) => setStatus(`Existing Capture owner requested from ${entry}.`)}
            onOpenUnit={(unitId) => setStatus(`Explicit navigation requested for ${unitId}.`)}
            onSubmitCommand={(sourceText) => {
              setStatus(`Exact wording preserved: ${sourceText}`);
              return 1;
            }}
            units={JUL28_SYNTHETIC_FIELD_SHELL.tasks.map((task) => ({
              unitId: `synthetic-unit-${task.unitNumber}`,
              unitNumber: task.unitNumber,
              buildingName: 'Synthetic Building',
              floorName: 'Synthetic Floor',
            }))}
          />
        )}
        onNavigate={(destination) => setStatus(`Navigation requested: ${destination}.`)}
        onOpenTask={(task) => setStatus(`Personal task opened: Unit ${task.unitNumber}, ${task.label}.`)}
        onSelectMore={(destination) => setStatus(`Selected ${destination.label}.`)}
        onSelectNeed={(item) => setStatus(`Personal reminder opened: ${item.title}, ${item.actionLabel}.`)}
      />
      <p className="j28-preview-status" role="status" aria-live="polite">{status}</p>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
