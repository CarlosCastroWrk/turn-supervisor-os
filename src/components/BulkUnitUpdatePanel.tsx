import { AlertTriangle, ListChecks, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  applyBulkUnitUpdate,
  bulkUnitUpdateActions,
  bulkUnitUpdateSkippedCount,
  createBulkUnitUpdatePreview,
  type BulkUnitUpdateActionId,
  type BulkUnitUpdatePreview,
} from '../lib/unitBulkUpdate';
import { persistAppDataNow } from '../lib/storage';
import type { AppData, EntityId } from '../types';
import { Button, Field } from './FormControls';
import { useToast } from './toast-context';

interface BulkUnitUpdatePanelProps {
  data: AppData;
  selectedUnitIds: readonly EntityId[];
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onComplete: () => void;
}

const previewListLimit = 12;
const skippedListLimit = 8;

export function BulkUnitUpdatePanel({ data, selectedUnitIds, setData, onComplete }: BulkUnitUpdatePanelProps) {
  const { notify } = useToast();
  const [actionId, setActionId] = useState<BulkUnitUpdateActionId | ''>('');
  const [preview, setPreview] = useState<BulkUnitUpdatePreview>();
  const selectionKey = useMemo(() => [...selectedUnitIds].sort().join('|'), [selectedUnitIds]);
  const selectedAction = bulkUnitUpdateActions.find((action) => action.id === actionId);

  useEffect(() => {
    setPreview(undefined);
  }, [data.activeProjectId, selectionKey]);

  const review = () => {
    if (!actionId) {
      notify('Choose one Unit update before reviewing the batch.', { tone: 'error' });
      return;
    }
    setPreview(createBulkUnitUpdatePreview(data, selectedUnitIds, actionId));
  };

  const apply = () => {
    if (!preview || preview.status !== 'ready' || preview.ready.length === 0) return;
    const result = applyBulkUnitUpdate(data, preview);
    if (result.status === 'stale-project') {
      setPreview(undefined);
      notify('The active Turn changed. Select the Units again before updating.', { tone: 'error' });
      return;
    }
    if (result.status !== 'applied') {
      setPreview(undefined);
      notify('No Units were changed. They changed after preview or no longer qualify for this update.', { tone: 'error' });
      return;
    }
    if (!persistAppDataNow(result.data)) {
      notify('Bulk update canceled because this device could not safely store the result.', { tone: 'error' });
      return;
    }

    setData(result.data);
    const skippedCount = bulkUnitUpdateSkippedCount(result);
    const skippedUnits = result.skippedUnitNumbers.slice(0, 3).map((unitNumber) => `Unit ${unitNumber}`);
    const skippedDetail =
      skippedUnits.length > 0
        ? ` (${skippedUnits.join(', ')}${result.skippedUnitNumbers.length > skippedUnits.length ? ', more' : ''})`
        : '';
    notify(
      `${result.updatedCount.toLocaleString()} Unit${result.updatedCount === 1 ? '' : 's'} updated${
        skippedCount > 0 ? `; ${skippedCount.toLocaleString()} safely skipped${skippedDetail}` : ''
      }.`,
      { tone: 'success' },
    );
    onComplete();
  };

  return (
    <div className="bulk-unit-tool" aria-label="Bulk Unit update">
      <div className="bulk-unit-tool__intro">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <strong>Review one change across selected Units</strong>
          <p>
            No automatic Undo. Units outside this Turn, protected by workflow rules, or changed after preview are skipped.
          </p>
        </div>
      </div>

      <div className="bulk-unit-tool__controls">
        <Field label="Update">
          <select
            value={actionId}
            onChange={(event) => {
              setActionId(event.target.value as BulkUnitUpdateActionId | '');
              setPreview(undefined);
            }}
          >
            <option value="">Choose one update...</option>
            {bulkUnitUpdateActions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.label}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={selectedUnitIds.length === 0 || !actionId} onClick={review} variant="primary">
          <ListChecks size={18} aria-hidden="true" />
          Review {selectedUnitIds.length.toLocaleString()} Unit{selectedUnitIds.length === 1 ? '' : 's'}
        </Button>
      </div>

      {selectedAction ? <p className="bulk-unit-tool__description">{selectedAction.description}</p> : null}

      {preview ? (
        <div className="bulk-unit-preview" aria-live="polite">
          {preview.error ? (
            <div className="bulk-unit-preview__notice" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              {preview.error}
            </div>
          ) : null}

          <div className="bulk-unit-preview__summary" aria-label="Bulk Unit update preview summary">
            <div>
              <strong>{preview.selectedCount.toLocaleString()}</strong>
              <span>Selected</span>
            </div>
            <div>
              <strong>{preview.ready.length.toLocaleString()}</strong>
              <span>Will update</span>
            </div>
            <div>
              <strong>{preview.skipped.length.toLocaleString()}</strong>
              <span>Safely skipped</span>
            </div>
          </div>

          {preview.ready.length > 0 ? (
            <div className="bulk-unit-preview__units">
              <strong>{selectedAction?.label}</strong>
              <p>
                {preview.ready
                  .slice(0, previewListLimit)
                  .map((candidate) => `Unit ${candidate.unitNumber}`)
                  .join(', ')}
                {preview.ready.length > previewListLimit ? `, +${preview.ready.length - previewListLimit} more` : ''}
              </p>
            </div>
          ) : null}

          {preview.skipped.length > 0 ? (
            <details className="bulk-unit-preview__skipped">
              <summary>Review skipped Units ({preview.skipped.length.toLocaleString()})</summary>
              <ul>
                {preview.skipped.slice(0, skippedListLimit).map((item) => (
                  <li key={`${item.unitId}:${item.reason}`}>
                    Unit {item.unitNumber}: {item.reason}
                  </li>
                ))}
              </ul>
              {preview.skipped.length > skippedListLimit ? <small>Showing the first {skippedListLimit} skipped Units.</small> : null}
            </details>
          ) : null}

          <div className="button-row bulk-unit-preview__confirm">
            <Button disabled={preview.status !== 'ready' || preview.ready.length === 0} onClick={apply} variant="primary">
              <ListChecks size={18} aria-hidden="true" />
              Update {preview.ready.length.toLocaleString()} Unit{preview.ready.length === 1 ? '' : 's'}
            </Button>
            <Button onClick={() => setPreview(undefined)} variant="ghost">
              Back to selection
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
