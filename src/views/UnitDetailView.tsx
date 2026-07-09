import { useState } from 'react';
import { ArrowLeft, ClipboardPlus, PenLine, Plus, ShieldCheck, Wrench } from 'lucide-react';
import { Button, CommittedTextarea, Field, NumberInput } from '../components/FormControls';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoThumbnail } from '../components/PhotoThumbnail';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toast-context';
import { useUndoableUnitUpdate } from '../hooks/useUndoableUnitUpdate';
import {
  addIssueWithOptionalUnitBlock,
  addPhotoNote,
  cleanCompletionPatch,
  maintenanceNeededPatch,
  paintCompletionPatch,
  updateUnit,
  type ReversibleUnitPatch,
} from '../lib/actions';
import { createId, formatTime, nowISO } from '../lib/constants';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, WORK_STATUSES } from '../lib/constants';
import type { AppData, AppView, Issue, IssueCategory, IssuePriority, UnitWorkflowStatus, WorkStatus } from '../types';

interface UnitDetailViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  unitId?: string;
  onNavigate: (view: AppView) => void;
}

export function UnitDetailView({ data, setData, unitId, onNavigate }: UnitDetailViewProps) {
  const { notify } = useToast();
  const applyUnitUpdate = useUndoableUnitUpdate(setData);
  const unit = data.units.find((item) => item.id === unitId);
  const [quickNote, setQuickNote] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('Maintenance');
  const [issuePriority, setIssuePriority] = useState<IssuePriority>('High');
  const [issueNotes, setIssueNotes] = useState('');
  const [issueBlocksUnit, setIssueBlocksUnit] = useState(false);

  if (!unit) {
    return (
      <div className="page">
        <Button onClick={() => onNavigate('units')}>Back to Units</Button>
        <p>{unitId ? 'Unit not found. Go back to Units before making edits.' : 'No unit selected.'}</p>
      </div>
    );
  }

  const building = data.buildings.find((item) => item.id === unit.buildingId);
  const floor = data.floors.find((item) => item.id === unit.floorId);
  const issues = data.issues.filter((issue) => issue.unitId === unit.id);
  const photos = data.photoNotes.filter((photo) => photo.unitId === unit.id);
  const activity = data.activityLogs.filter((log) => log.entityId === unit.id).slice(0, 8);

  const updateStatus = (patch: Parameters<typeof updateUnit>[2], note: string) => {
    setData((current) => updateUnit(current, unit.id, patch, note));
  };

  const updateStatusWithUndo = (patch: ReversibleUnitPatch, note: string, confirmation: string) => {
    applyUnitUpdate(unit.id, patch, note, confirmation);
  };

  const markReady = () => {
    const incompleteItems = [
      unit.paintStatus !== 'Complete' && unit.paintStatus !== 'Not Applicable' ? `paint: ${unit.paintStatus}` : '',
      unit.cleanStatus !== 'Complete' && unit.cleanStatus !== 'Not Applicable' ? `clean: ${unit.cleanStatus}` : '',
      unit.repairStatus !== 'Complete' && unit.repairStatus !== 'Not Applicable' ? `repair: ${unit.repairStatus}` : '',
      unit.inspectionStatus !== 'Complete' && unit.inspectionStatus !== 'Not Applicable'
        ? `inspection: ${unit.inspectionStatus}`
        : '',
    ].filter(Boolean);

    if (incompleteItems.length > 0) {
      const incomplete = [
        ...incompleteItems,
      ].join(', ');
      const confirmed = window.confirm(
        `Unit ${unit.unitNumber} still has incomplete work (${incomplete}). Mark it Ready anyway?`,
      );
      if (!confirmed) {
        return;
      }
    }
    updateStatusWithUndo(
      { overallStatus: 'Ready', inspectionStatus: 'Complete' },
      'Marked unit ready.',
      `Unit ${unit.unitNumber}: marked Ready.`,
    );
  };

  const markCleanComplete = () => {
    updateStatusWithUndo(
      cleanCompletionPatch(unit),
      'Marked clean complete.',
      `Unit ${unit.unitNumber}: cleaning marked complete.`,
    );
  };

  const saveQuickNote = () => {
    const note = quickNote.trim();
    if (!note) {
      return;
    }

    const timestamp = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
    const nextNote = [unit.notes.trim(), `${timestamp} - ${note}`].filter(Boolean).join('\n');
    updateStatus({ notes: nextNote }, 'Added unit note.');
    setQuickNote('');
    notify(`Note saved to Unit ${unit.unitNumber}.`, { tone: 'success' });
  };

  const logQuickIssue = () => {
    const title = issueTitle.trim();
    if (!title) {
      return;
    }

    const now = nowISO();
    setData((current) => {
      const issue: Issue = {
        id: createId('issue'),
        projectId: unit.projectId,
        buildingId: unit.buildingId,
        floorId: unit.floorId,
        unitId: unit.id,
        title,
        category: issueCategory,
        priority: issuePriority,
        owner: '',
        status: 'Open',
        dueAt: '',
        notes: issueNotes.trim() || title,
        resolutionNotes: '',
        createdAt: now,
        updatedAt: now,
      };

      return addIssueWithOptionalUnitBlock(current, issue, issueBlocksUnit);
    });

    setIssueTitle('');
    setIssueNotes('');
    setIssueBlocksUnit(false);
    notify(`Issue added to Unit ${unit.unitNumber}.`, { tone: 'success' });
  };

  return (
    <div className="page">
      <div className="detail-header">
        <Button onClick={() => onNavigate('units')}>
          <ArrowLeft size={18} aria-hidden="true" />
          Units
        </Button>
        <div>
          <span className="quiet-label">
            {building?.name ?? 'Building'} · {floor?.name ?? 'Floor'}
          </span>
          <h1>Unit {unit.unitNumber}</h1>
        </div>
        <StatusBadge value={unit.overallStatus} />
      </div>

      <Section title="Fast Update" kicker="Under 10 seconds">
        <div className="quick-grid quick-grid--compact">
          <button
            className="quick-action"
            type="button"
            onClick={() =>
              updateStatusWithUndo(
                paintCompletionPatch(unit),
                'Marked paint complete.',
                `Unit ${unit.unitNumber}: paint marked complete.`,
              )
            }
          >
            <PenLine size={22} aria-hidden="true" />
            <span>
              <strong>Paint Complete</strong>
              <small>Move to clean-ready</small>
            </span>
          </button>
          <button
            className="quick-action"
            type="button"
            onClick={markCleanComplete}
          >
            <ShieldCheck size={22} aria-hidden="true" />
            <span>
              <strong>Clean Complete</strong>
              <small>Needs final eyes</small>
            </span>
          </button>
          <button
            className="quick-action"
            type="button"
            onClick={() =>
              updateStatusWithUndo(
                maintenanceNeededPatch(unit),
                'Marked maintenance needed.',
                `Unit ${unit.unitNumber}: maintenance marked needed.`,
              )
            }
          >
            <Wrench size={22} aria-hidden="true" />
            <span>
              <strong>Maintenance Needed</strong>
              <small>Create follow-up</small>
            </span>
          </button>
          <button
            className="quick-action"
            type="button"
            onClick={markReady}
          >
            <ClipboardPlus size={22} aria-hidden="true" />
            <span>
              <strong>Mark Ready</strong>
              <small>Final-ready locally</small>
            </span>
          </button>
        </div>
      </Section>

      <Section title="Field Capture" kicker="Note or issue">
        <div className="field-capture-grid">
          <div className="capture-panel">
            <Field label="Quick note">
              <textarea
                value={quickNote}
                rows={4}
                onChange={(event) => setQuickNote(event.target.value)}
                placeholder="Keys missing, paint touched up, cleaner in progress..."
              />
            </Field>
            <Button disabled={!quickNote.trim()} variant="primary" onClick={saveQuickNote}>
              <PenLine size={18} aria-hidden="true" />
              Save Note
            </Button>
          </div>

          <div className="capture-panel">
            <Field label="Issue">
              <input value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} placeholder="Sink leak, no key, re-clean needed..." />
            </Field>
            <div className="grid two">
              <Field label="Category">
                <select value={issueCategory} onChange={(event) => setIssueCategory(event.target.value as IssueCategory)}>
                  {ISSUE_CATEGORIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select value={issuePriority} onChange={(event) => setIssuePriority(event.target.value as IssuePriority)}>
                  {ISSUE_PRIORITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Issue note">
              <textarea
                value={issueNotes}
                rows={3}
                onChange={(event) => setIssueNotes(event.target.value)}
                placeholder="What is blocked and who needs to know?"
              />
            </Field>
            <label className="checkbox-field">
              <input checked={issueBlocksUnit} type="checkbox" onChange={(event) => setIssueBlocksUnit(event.target.checked)} />
              <span>
                <strong>Blocks this unit</strong>
                <small>Only turn this on if this issue should change the board status.</small>
              </span>
            </label>
            <Button disabled={!issueTitle.trim()} variant="primary" onClick={logQuickIssue}>
              <Plus size={18} aria-hidden="true" />
              Log Issue
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Status Board" kicker="Editable">
        <div className="form-card">
          <div className="grid two">
            <Field label="Overall">
              <select
                value={unit.overallStatus}
                onChange={(event) => updateStatus({ overallStatus: event.target.value as UnitWorkflowStatus }, 'Changed overall status.')}
              >
                {data.configurableStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Paint">
              <select
                value={unit.paintStatus}
                onChange={(event) => updateStatus({ paintStatus: event.target.value as WorkStatus }, 'Changed paint status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Clean">
              <select
                value={unit.cleanStatus}
                onChange={(event) => updateStatus({ cleanStatus: event.target.value as WorkStatus }, 'Changed clean status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Repair">
              <select
                value={unit.repairStatus}
                onChange={(event) => updateStatus({ repairStatus: event.target.value as WorkStatus }, 'Changed repair status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Flooring">
              <select
                value={unit.flooringStatus}
                onChange={(event) => updateStatus({ flooringStatus: event.target.value as WorkStatus }, 'Changed flooring status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Trash-out">
              <select
                value={unit.trashStatus}
                onChange={(event) => updateStatus({ trashStatus: event.target.value as WorkStatus }, 'Changed trash-out status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Final inspection">
              <select
                value={unit.inspectionStatus}
                onChange={(event) => updateStatus({ inspectionStatus: event.target.value as WorkStatus }, 'Changed inspection status.')}
              >
                {WORK_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Common area">
              <select
                value={unit.hasCommonArea ? 'yes' : 'no'}
                onChange={(event) => updateStatus({ hasCommonArea: event.target.value === 'yes' }, 'Changed common area flag.')}
              >
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </Field>
          </div>

          <div className="grid two">
            <Field label="Beds">
              <NumberInput
                draftKey={`unit:${unit.id}:bedCount`}
                min={0}
                value={unit.bedCount}
                onValueChange={(bedCount) => updateStatus({ bedCount }, 'Changed bed count.')}
              />
            </Field>
            <Field label="Bathrooms">
              <NumberInput
                draftKey={`unit:${unit.id}:bathroomCount`}
                min={0}
                value={unit.bathroomCount}
                onValueChange={(bathroomCount) => updateStatus({ bathroomCount }, 'Changed bathroom count.')}
              />
            </Field>
          </div>

          <Field label="Notes">
            <CommittedTextarea
              draftKey={`unit:${unit.id}:notes`}
              value={unit.notes}
              rows={4}
              onCommit={(notes) => updateStatus({ notes }, 'Updated unit notes.')}
              placeholder="What matters in this unit?"
            />
          </Field>
        </div>
      </Section>

      <div className="dashboard-columns">
        <Section title="Issues" kicker={`${issues.length} linked`}>
          <div className="stack">
            {issues.map((issue) => (
              <article className="list-card" key={issue.id}>
                <div>
                  <strong>{issue.title}</strong>
                  <small>{issue.notes || 'No notes yet'}</small>
                </div>
                <div className="badge-row">
                  <StatusBadge value={issue.priority} size="sm" />
                  <StatusBadge value={issue.status} size="sm" />
                </div>
              </article>
            ))}
            {issues.length === 0 ? <p className="muted">No issues linked to this unit.</p> : null}
          </div>
        </Section>

        <Section title="Photos / Notes" kicker={`${photos.length} photo record${photos.length === 1 ? '' : 's'}`}>
          <PhotoCapture
            projectId={unit.projectId}
            unitId={unit.id}
            onAdd={(photo) => setData((current) => addPhotoNote(current, photo))}
          />
          <div className="photo-grid">
            {photos.slice(0, 6).map((photo) => (
              <PhotoThumbnail key={photo.id} photo={photo} />
            ))}
          </div>
        </Section>
      </div>

      <Section title="Activity History" kicker={`Last updated ${formatTime(unit.updatedAt)}`}>
        <div className="timeline">
          {activity.map((item) => (
            <article key={item.id}>
              <span>{formatTime(item.createdAt)}</span>
              <strong>{item.action}</strong>
              <p>{item.note}</p>
            </article>
          ))}
          {activity.length === 0 ? <p className="muted">No activity recorded yet.</p> : null}
        </div>
      </Section>
    </div>
  );
}
