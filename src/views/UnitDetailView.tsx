import { useState } from 'react';
import { ArrowLeft, ClipboardPlus, PenLine, Plus, ShieldCheck, Wrench } from 'lucide-react';
import { Button, Field } from '../components/FormControls';
import { PhotoCapture } from '../components/PhotoCapture';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { addIssue, addPhotoNote, unitTradesComplete, updateUnit } from '../lib/actions';
import { createId, formatTime, nowISO } from '../lib/constants';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, WORK_STATUSES } from '../lib/constants';
import type { AppData, AppView, IssueCategory, IssuePriority, UnitWorkflowStatus, WorkStatus } from '../types';

interface UnitDetailViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  unitId?: string;
  onNavigate: (view: AppView) => void;
}

export function UnitDetailView({ data, setData, unitId, onNavigate }: UnitDetailViewProps) {
  const unit = data.units.find((item) => item.id === unitId) ?? data.units[0];
  const [quickNote, setQuickNote] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('Maintenance');
  const [issuePriority, setIssuePriority] = useState<IssuePriority>('High');
  const [issueNotes, setIssueNotes] = useState('');

  if (!unit) {
    return (
      <div className="page">
        <Button onClick={() => onNavigate('units')}>Back to Units</Button>
        <p>No unit selected.</p>
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
    updateStatus({ overallStatus: 'Ready', inspectionStatus: 'Complete' }, 'Marked unit ready.');
  };

  const markCleanComplete = () => {
    const readyForInspection = unitTradesComplete({ ...unit, cleanStatus: 'Complete' });
    updateStatus(
      readyForInspection
        ? { cleanStatus: 'Complete', overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' }
        : { cleanStatus: 'Complete' },
      'Marked clean complete.',
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
  };

  const logQuickIssue = () => {
    const title = issueTitle.trim();
    if (!title) {
      return;
    }

    const now = nowISO();
    setData((current) => {
      const withIssue = addIssue(current, {
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
      });

      return updateUnit(
        withIssue,
        unit.id,
        {
          overallStatus:
            issueCategory === 'Access' ? 'Access Blocked' : issueCategory === 'Maintenance' ? 'Maintenance Needed' : 'Hold / Blocked',
        },
        `Issue created: ${title}`,
      );
    });

    setIssueTitle('');
    setIssueNotes('');
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
              updateStatus(
                { paintStatus: 'Complete', overallStatus: unit.cleanStatus === 'Complete' ? 'Inspection Needed' : 'Cleaning Ready' },
                'Marked paint complete.',
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
            onClick={() => updateStatus({ repairStatus: 'Needed', overallStatus: 'Maintenance Needed' }, 'Marked maintenance needed.')}
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
              <input
                min={0}
                type="number"
                value={unit.bedCount}
                onChange={(event) => updateStatus({ bedCount: Number(event.target.value) }, 'Changed bed count.')}
              />
            </Field>
            <Field label="Bathrooms">
              <input
                min={0}
                type="number"
                value={unit.bathroomCount}
                onChange={(event) => updateStatus({ bathroomCount: Number(event.target.value) }, 'Changed bathroom count.')}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={unit.notes}
              rows={4}
              onChange={(event) => updateStatus({ notes: event.target.value }, 'Updated unit notes.')}
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

        <Section title="Photos / Notes" kicker={`${photos.length} local`}>
          <PhotoCapture
            projectId={unit.projectId}
            unitId={unit.id}
            onAdd={(photo) => setData((current) => addPhotoNote(current, photo))}
          />
          <div className="photo-grid">
            {photos.slice(0, 6).map((photo) => (
              <figure className="photo-thumb" key={photo.id}>
                {photo.imageData ? <img alt={photo.caption || photo.category} src={photo.imageData} /> : null}
                <figcaption>{photo.caption || photo.category}</figcaption>
              </figure>
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
