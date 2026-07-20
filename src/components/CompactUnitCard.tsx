import { AlertTriangle, Camera, CheckSquare2, FileText, Square } from 'lucide-react';
import type { UnitCardProjection } from '../lib/unitCardProjection';
import { StatusBadge } from './StatusBadge';

interface CompactUnitCardProps {
  projection: UnitCardProjection;
  isBulkMode: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelection: () => void;
}

const formatUpdatedTime = (dateTime: string) =>
  new Date(dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function CompactUnitCard({
  projection,
  isBulkMode,
  isSelected,
  onOpen,
  onToggleSelection,
}: CompactUnitCardProps) {
  return (
    <article className={`compact-unit-card ${projection.attentionCount > 0 || projection.criticalWarning ? 'has-attention' : ''} ${isSelected ? 'is-selected' : ''}`}>
      <button
        type="button"
        aria-label={isBulkMode ? `${isSelected ? 'Deselect' : 'Select'} Unit ${projection.unitNumber}` : `Open Unit ${projection.unitNumber}`}
        aria-pressed={isBulkMode ? isSelected : undefined}
        onClick={isBulkMode ? onToggleSelection : onOpen}
      >
        <div className="compact-unit-card__top">
          <div>
            <span className="quiet-label">Unit</span>
            <h3>{projection.unitNumber}</h3>
          </div>
          {isBulkMode ? (
            <span className="compact-unit-card__selection">
              {isSelected ? <CheckSquare2 size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
              {isSelected ? 'Selected' : 'Select'}
            </span>
          ) : (
            <div className="compact-unit-card__state">
              <span>Personal state</span>
              <StatusBadge value={projection.personalState} />
            </div>
          )}
        </div>

        {projection.criticalWarning ? (
          <p className="compact-unit-card__warning"><AlertTriangle size={16} aria-hidden="true" />{projection.criticalWarning}</p>
        ) : (
          <p className="compact-unit-card__warning is-clear">No recorded warning</p>
        )}

        <div className="compact-unit-card__counts">
          <span className={projection.attentionCount > 0 ? 'is-hot' : ''}>
            <AlertTriangle size={15} aria-hidden="true" /> {projection.attentionCount} attention
          </span>
          <span><FileText size={15} aria-hidden="true" /> {projection.noteCount}</span>
          <span><Camera size={15} aria-hidden="true" /> {projection.photoCount}</span>
        </div>
        <small>Updated {formatUpdatedTime(projection.updatedAt)}</small>
      </button>
    </article>
  );
}
