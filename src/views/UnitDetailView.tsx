import { ArrowLeft, CheckCircle2, ClipboardPlus, ImagePlus, PenLine, Plus, ShieldCheck, Wrench } from 'lucide-react';
import { useRef, useState } from 'react';
import { FieldEntryDialog } from '../components/FieldEntryDialog';
import { Button, CommittedTextarea, Field, NumberInput } from '../components/FormControls';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoThumbnail } from '../components/PhotoThumbnail';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { UnitTimeline } from '../components/UnitTimeline';
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
import { ISSUE_CATEGORIES, WORK_STATUSES } from '../lib/constants';
import type { AppNavigate } from '../lib/routing';
import { persistAppDataNow, useAppDataSaveStatus } from '../lib/storage';
import { projectUnitTimeline } from '../lib/unitTimeline';
import type { AppData, Issue, IssueCategory, UnitWorkflowStatus, WorkStatus } from '../types';

interface UnitDetailViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  unitId?: string;
  onNavigate: AppNavigate;
}

const completedLabel = (status: WorkStatus) =>
  status === 'Complete' || status === 'Not Applicable' ? 'Complete' : status;

export function UnitDetailView({ data, setData, unitId, onNavigate }: UnitDetailViewProps) {
  const { notify } = useToast();
  const applyUnitUpdate = useUndoableUnitUpdate(setData);
  const unit = data.units.find((item) => item.id === unitId);
  const [quickNote, setQuickNote] = useState('');
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('Maintenance');
  const [issueNotes, setIssueNotes] = useState('');
  const [issueBlocksUnit, setIssueBlocksUnit] = useState(false);
  const addIssueButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveStatus = useAppDataSaveStatus();

  if (!unit) {
    return (
      <div className="page">
        <Button onClick={() => onNavigate('units')}>Back to TurnBoard</Button>
        <p>{unitId ? 'Unit not found. Go back to TurnBoard before making edits.' : 'No unit selected.'}</p>
      </div>
    );
  }

  const building = data.buildings.find((item) => item.id === unit.buildingId);
  const floor = data.floors.find((item) => item.id === unit.floorId);
  const issues = data.issues.filter((issue) => issue.unitId === unit.id);
  const photos = data.photoNotes.filter((photo) => photo.unitId === unit.id);
  const timelineItems = projectUnitTimeline(data, unit.id);
  const checks = [
    { label: 'Paint', value: completedLabel(unit.paintStatus) },
    { label: 'Clean', value: completedLabel(unit.cleanStatus) },
    { label: 'Maintenance', value: completedLabel(unit.repairStatus) },
    { label: 'Inspection', value: completedLabel(unit.inspectionStatus) },
  ];

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
      unit.repairStatus !== 'Complete' && unit.repairStatus !== 'Not Applicable' ? `maintenance: ${unit.repairStatus}` : '',
      unit.inspectionStatus !== 'Complete' && unit.inspectionStatus !== 'Not Applicable' ? `inspection: ${unit.inspectionStatus}` : '',
    ].filter(Boolean);

    if (incompleteItems.length > 0 && !window.confirm(`Unit ${unit.unitNumber} still has incomplete work (${incompleteItems.join(', ')}). Mark it Ready anyway?`)) {
      return;
    }

    updateStatusWithUndo(
      { overallStatus: 'Ready', inspectionStatus: 'Complete' },
      'Marked unit ready.',
      `Unit ${unit.unitNumber}: marked Ready.`,
    );
  };

  const saveQuickNote = () => {
    const note = quickNote.trim();
    if (!note) return;

    const timestamp = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
    updateStatus({ notes: [unit.notes.trim(), `${timestamp} - ${note}`].filter(Boolean).join('\n') }, 'Added unit note.');
    setQuickNote('');
    notify(`Note saved to Unit ${unit.unitNumber}.`, { tone: 'success' });
  };

  const closeIssue = () => {
    setIsIssueOpen(false);
    window.requestAnimationFrame(() => addIssueButtonRef.current?.focus({ preventScroll: true }));
  };

  const logQuickIssue = () => {
    const title = issueTitle.trim();
    if (!title) {
      notify('Add an issue title before saving.', { tone: 'error' });
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
        priority: 'High',
        owner: data.projects.find((project) => project.id === unit.projectId)?.supervisorName || 'Los',
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
    closeIssue();
    notify(`Issue added to Unit ${unit.unitNumber}.`, { tone: 'success' });
  };

  return (
    <>
      <div className="page page--unit-command">
        <div className="detail-header">
          <Button onClick={() => onNavigate('units')}>
            <ArrowLeft size={18} aria-hidden="true" />
            TurnBoard
          </Button>
          <div>
            <span className="quiet-label">{building?.name ?? 'Building'} · {floor?.name ?? 'Floor'}</span>
            <h1>Unit {unit.unitNumber}</h1>
          </div>
          <StatusBadge value={unit.overallStatus} />
        </div>

        <Section title="Unit check" kicker={`${unit.bedCount} bed${unit.bedCount === 1 ? '' : 's'}${unit.hasCommonArea ? ' · Common area included' : ''}`} className="unit-overview">
          <div className="unit-overview__grid">
            <div className="unit-overview__status">
              <span>Current state</span>
              <strong>{unit.overallStatus}</strong>
              <small>Updated {formatTime(unit.updatedAt)}</small>
            </div>
            <div className="unit-check-grid" aria-label="Unit work checks">
              {checks.map((check) => (
                <div className={`unit-check ${check.value === 'Complete' ? 'is-complete' : ''}`} key={check.label}>
                  {check.value === 'Complete' ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
                  <span>{check.label}</span>
                  <strong>{check.value}</strong>
                </div>
              ))}
            </div>
            <Field label="Beds">
              <NumberInput
                className="unit-bed-input"
                draftKey={`unit:${unit.id}:bedCount`}
                min={0}
                value={unit.bedCount}
                onValueChange={(bedCount) => updateStatus({ bedCount }, 'Changed bed count.')}
              />
            </Field>
          </div>
        </Section>

        <Section title="Update unit" kicker="Fast field actions" className="unit-quick-actions">
          <div className="quick-grid quick-grid--compact">
            <button
              className="quick-action"
              type="button"
              onClick={() => updateStatusWithUndo(paintCompletionPatch(unit), 'Marked paint complete.', `Unit ${unit.unitNumber}: paint marked complete.`)}
            >
              <PenLine size={22} aria-hidden="true" />
              <span><strong>Paint complete</strong><small>Move toward cleaning</small></span>
            </button>
            <button className="quick-action" type="button" onClick={() => updateStatusWithUndo(cleanCompletionPatch(unit), 'Marked clean complete.', `Unit ${unit.unitNumber}: cleaning marked complete.`)}>
              <ShieldCheck size={22} aria-hidden="true" />
              <span><strong>Clean complete</strong><small>Needs final eyes</small></span>
            </button>
            <button className="quick-action" type="button" onClick={() => updateStatusWithUndo(maintenanceNeededPatch(unit), 'Marked maintenance needed.', `Unit ${unit.unitNumber}: maintenance marked needed.`)}>
              <Wrench size={22} aria-hidden="true" />
              <span><strong>Maintenance needed</strong><small>Hold the unit if needed</small></span>
            </button>
            <button className="quick-action" type="button" onClick={markReady}>
              <ClipboardPlus size={22} aria-hidden="true" />
              <span><strong>Mark ready</strong><small>Final-ready locally</small></span>
            </button>
          </div>
        </Section>

        <div className="dashboard-columns unit-field-columns">
          <Section title="Quick note" kicker="What changed right now" className="unit-note-panel">
            <div className="capture-panel">
              <textarea
                value={quickNote}
                rows={4}
                onChange={(event) => setQuickNote(event.target.value)}
                placeholder="Keys missing, paint touched up, cleaner in progress..."
                aria-label="Quick note"
              />
              <div className="button-row">
                <Button disabled={!quickNote.trim()} variant="primary" onClick={saveQuickNote}><PenLine size={18} aria-hidden="true" />Save note</Button>
                <button ref={addIssueButtonRef} className="button button--secondary" type="button" onClick={() => setIsIssueOpen(true)}><Plus size={18} aria-hidden="true" />Add issue</button>
              </div>
            </div>
          </Section>

          <Section title="Photos" kicker={`${photos.length} saved`} className="unit-photos-panel">
            <PhotoCapture
              projectId={unit.projectId}
              unitId={unit.id}
              onAdd={(photo) => {
                const next = addPhotoNote(data, photo);
                if (!persistAppDataNow(next)) {
                  return false;
                }
                setData(next);
                return true;
              }}
            />
            <div className="photo-grid">
              {photos.slice(0, 6).map((photo) => <PhotoThumbnail key={photo.id} photo={photo} />)}
            </div>
            {photos.length === 0 ? <p className="muted unit-photo-empty"><ImagePlus size={18} aria-hidden="true" />Capture or attach a work photo here.</p> : null}
          </Section>
        </div>

        <Section title="Linked issues" kicker={`${issues.length} issue${issues.length === 1 ? '' : 's'}`} className="unit-linked-issues">
          <div className="stack">
            {issues.map((issue) => (
              <article className="list-card" key={issue.id}>
                <div><strong>{issue.title}</strong><small>{issue.notes || 'No note yet.'}</small></div>
                <StatusBadge value={['Resolved', 'Closed'].includes(issue.status) ? 'Done' : 'In Progress'} size="sm" />
              </article>
            ))}
            {issues.length === 0 ? <p className="muted">No issues linked to this unit.</p> : null}
          </div>
        </Section>

        <details className="unit-manual-details">
          <summary>Manual unit details</summary>
          <p>Use these only when Capture or the fast actions do not fit the field update.</p>
          <div className="form-card">
            <div className="grid two">
              <Field label="Overall">
                <select value={unit.overallStatus} onChange={(event) => updateStatus({ overallStatus: event.target.value as UnitWorkflowStatus }, 'Changed overall status.')}>
                  {data.configurableStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Paint">
                <select value={unit.paintStatus} onChange={(event) => updateStatus({ paintStatus: event.target.value as WorkStatus }, 'Changed paint status.')}>
                  {WORK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Clean">
                <select value={unit.cleanStatus} onChange={(event) => updateStatus({ cleanStatus: event.target.value as WorkStatus }, 'Changed clean status.')}>
                  {WORK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Maintenance">
                <select value={unit.repairStatus} onChange={(event) => updateStatus({ repairStatus: event.target.value as WorkStatus }, 'Changed maintenance status.')}>
                  {WORK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Final inspection">
                <select value={unit.inspectionStatus} onChange={(event) => updateStatus({ inspectionStatus: event.target.value as WorkStatus }, 'Changed inspection status.')}>
                  {WORK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Bathrooms">
                <NumberInput draftKey={`unit:${unit.id}:bathroomCount`} min={0} value={unit.bathroomCount} onValueChange={(bathroomCount) => updateStatus({ bathroomCount }, 'Changed bathroom count.')} />
              </Field>
            </div>
            <Field label="Unit notes">
              <CommittedTextarea
                draftKey={`unit:${unit.id}:notes`}
                value={unit.notes}
                rows={4}
                onCommit={(notes) => updateStatus({ notes }, 'Updated unit notes.')}
                placeholder="What matters in this unit?"
              />
            </Field>
          </div>
        </details>

        <UnitTimeline
          items={timelineItems}
          onNavigate={onNavigate}
          photos={photos}
          saveFailed={saveStatus.state === 'failed'}
        />
      </div>

      {isIssueOpen ? (
        <FieldEntryDialog title={`Add issue to Unit ${unit.unitNumber}`} description="Capture is still the fastest path. This form is for a manual field entry." onClose={closeIssue}>
          <div className="form-card field-entry-form">
            <Field label="Issue title"><input value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} placeholder="Sink leak, no key, re-clean needed..." /></Field>
            <Field label="Category">
              <select value={issueCategory} onChange={(event) => setIssueCategory(event.target.value as IssueCategory)}>
                {ISSUE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="What happened"><textarea value={issueNotes} rows={4} onChange={(event) => setIssueNotes(event.target.value)} placeholder="What needs to be fixed or followed up?" /></Field>
            <label className="checkbox-field">
              <input checked={issueBlocksUnit} type="checkbox" onChange={(event) => setIssueBlocksUnit(event.target.checked)} />
              <span><strong>Blocks this unit</strong><small>Only use this when the issue should change the unit board status.</small></span>
            </label>
            <div className="button-row">
              <Button variant="primary" disabled={!issueTitle.trim()} onClick={logQuickIssue}><Plus size={18} aria-hidden="true" />Add issue</Button>
              <Button variant="ghost" onClick={closeIssue}>Cancel</Button>
            </div>
          </div>
        </FieldEntryDialog>
      ) : null}
    </>
  );
}
