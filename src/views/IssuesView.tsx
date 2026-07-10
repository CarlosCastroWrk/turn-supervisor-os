import { CheckCircle2, EyeOff, PlayCircle, Plus, TimerReset } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldEntryDialog } from '../components/FieldEntryDialog';
import { Button, CommittedTextarea, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toast-context';
import { motionSafeScrollBehavior } from '../lib/accessibility';
import { addIssueWithOptionalUnitBlock, closeIssueFromBoard, resolveIssue, updateIssue } from '../lib/actions';
import { createId, nowISO } from '../lib/constants';
import { ISSUE_CATEGORIES } from '../lib/constants';
import { getActiveProject, getProjectIssues, getProjectUnits } from '../lib/metrics';
import type { AppData, Issue, IssueCategory, IssueStatus } from '../types';

interface IssuesViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  focusedIssueId?: string;
}

type IssueBoardFilter = 'In Progress' | 'Done';

const activeIssueStatuses = new Set<IssueStatus>(['Open', 'In Progress', 'Waiting']);
const defaultManualIssuePriority: Issue['priority'] = 'Medium';

const isDoneIssue = (issue: Issue) => ['Resolved', 'Closed'].includes(issue.status);
const fieldIssueStatus = (issue: Issue) => (isDoneIssue(issue) ? 'Done' : 'In Progress');
const matchesIssueBoardFilter = (issue: Issue, filter: IssueBoardFilter) =>
  filter === 'Done' ? isDoneIssue(issue) : activeIssueStatuses.has(issue.status);

const issueStatusSortWeight: Record<IssueStatus, number> = {
  'In Progress': 0,
  Open: 1,
  Waiting: 2,
  Resolved: 3,
  Closed: 3,
};

export function IssuesView({ data, setData, focusedIssueId }: IssuesViewProps) {
  const { notify } = useToast();
  const activeProject = getActiveProject(data);
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data);
  const defaultOwner = activeProject.supervisorName.trim() || 'Los';
  const [statusFilter, setStatusFilter] = useState<IssueBoardFilter>('In Progress');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState<IssueCategory>('Maintenance');
  const [notes, setNotes] = useState('');
  const [blocksUnit, setBlocksUnit] = useState(false);
  const [pendingRemoveIssueId, setPendingRemoveIssueId] = useState<string | undefined>();
  const focusedIssueRef = useRef<HTMLElement | null>(null);
  const addIssueButtonRef = useRef<HTMLButtonElement | null>(null);

  const visibleIssues = useMemo(
    () =>
      issues
        .filter((issue) => matchesIssueBoardFilter(issue, statusFilter))
        .sort((a, b) => {
          const statusDelta = issueStatusSortWeight[a.status] - issueStatusSortWeight[b.status];
          return statusDelta === 0 ? b.updatedAt.localeCompare(a.updatedAt) : statusDelta;
        }),
    [issues, statusFilter],
  );

  useEffect(() => {
    if (!focusedIssueId) {
      return;
    }

    const focusedIssue = issues.find((issue) => issue.id === focusedIssueId);
    if (focusedIssue && !matchesIssueBoardFilter(focusedIssue, statusFilter)) {
      setStatusFilter(isDoneIssue(focusedIssue) ? 'Done' : 'In Progress');
    }
  }, [focusedIssueId, issues, statusFilter]);

  useEffect(() => {
    if (!focusedIssueId || !focusedIssueRef.current) {
      return;
    }

    focusedIssueRef.current.scrollIntoView({ behavior: motionSafeScrollBehavior(), block: 'start' });
    focusedIssueRef.current.focus({ preventScroll: true });
  }, [focusedIssueId, visibleIssues]);

  const createIssue = () => {
    const issueTitle = title.trim();
    if (!issueTitle) {
      notify('Add a short issue title before saving.', { tone: 'error' });
      return;
    }

    const linkedUnit = units.find((unit) => unit.id === unitId);
    const now = nowISO();

    setData((current) => {
      const issue: Issue = {
        id: createId('issue'),
        projectId: current.activeProjectId,
        buildingId: linkedUnit?.buildingId,
        floorId: linkedUnit?.floorId,
        unitId: linkedUnit?.id,
        title: issueTitle,
        category,
        priority: defaultManualIssuePriority,
        owner: defaultOwner,
        status: 'Open',
        dueAt: '',
        notes,
        resolutionNotes: '',
        createdAt: now,
        updatedAt: now,
      };

      return addIssueWithOptionalUnitBlock(current, issue, blocksUnit);
    });

    setTitle('');
    setUnitId('');
    setNotes('');
    setBlocksUnit(false);
    setPendingRemoveIssueId(undefined);
    setIsCreateOpen(false);
    window.requestAnimationFrame(() => addIssueButtonRef.current?.focus({ preventScroll: true }));
    notify(`${issueTitle} added${linkedUnit ? ` to Unit ${linkedUnit.unitNumber}` : ''}.`, { tone: 'success' });
  };

  const closeCreateIssue = () => {
    setIsCreateOpen(false);
    window.requestAnimationFrame(() => addIssueButtonRef.current?.focus({ preventScroll: true }));
  };

  const setIssueStatus = (issue: Issue, status: IssueStatus) => {
    if (issue.status === status) {
      notify(`${issue.title} is already ${status}. Nothing new was recorded.`);
      return;
    }
    setData((current) => (status === 'Resolved' ? resolveIssue(current, issue.id) : updateIssue(current, issue.id, { status })));
    notify(`${issue.title} marked ${status}.`, { tone: 'success' });
  };

  return (
    <>
      <div className="page page--board-first">
        <div className="field-page-header">
          <div>
            <h1>Issues</h1>
            <p>Capture handles the normal flow. Add one manually only when you need to.</p>
          </div>
          <button ref={addIssueButtonRef} className="button button--primary board-add-button" type="button" onClick={() => setIsCreateOpen(true)}>
            <Plus size={18} aria-hidden="true" />
            Add issue
          </button>
        </div>

        <Section title="Open issues" kicker={`${issues.filter((issue) => !isDoneIssue(issue)).length} active`} className="issue-board">
          <div className="board-filter-row" aria-label="Issue status filters">
            {(['In Progress', 'Done'] as IssueBoardFilter[]).map((filter) => (
              <button
                key={filter}
                className={statusFilter === filter ? 'is-active' : ''}
                type="button"
                onClick={() => setStatusFilter(filter)}
              >
                <span>{filter}</span>
                <strong>{filter === 'Done' ? issues.filter(isDoneIssue).length : issues.filter((issue) => !isDoneIssue(issue)).length}</strong>
              </button>
            ))}
          </div>

          <div className="issue-list">
            {visibleIssues.map((issue) => {
              const linkedUnit = units.find((unit) => unit.id === issue.unitId);
              const done = isDoneIssue(issue);
              return (
                <article
                  className={`issue-card issue-card--field ${focusedIssueId === issue.id ? 'issue-card--focused' : ''}`}
                  key={issue.id}
                  ref={focusedIssueId === issue.id ? focusedIssueRef : undefined}
                  tabIndex={focusedIssueId === issue.id ? -1 : undefined}
                >
                  <div className="issue-card__header">
                    <div>
                      <h3>{issue.title}</h3>
                      <small>{linkedUnit ? `Unit ${linkedUnit.unitNumber}` : 'Building / shared area'} · {issue.category}</small>
                    </div>
                    <StatusBadge value={fieldIssueStatus(issue)} />
                  </div>
                  <p>{issue.notes || 'No details captured yet.'}</p>
                  <div className="issue-card__meta">
                    <span>{issue.owner || 'No owner assigned'}</span>
                    <span>{new Date(issue.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="quick-status-row">
                    {done ? (
                      <Button onClick={() => setIssueStatus(issue, 'In Progress')}>
                        <TimerReset size={16} aria-hidden="true" />
                        Reopen
                      </Button>
                    ) : (
                      <>
                        <Button className={issue.status === 'In Progress' ? 'is-selected' : ''} onClick={() => setIssueStatus(issue, 'In Progress')}>
                          <PlayCircle size={16} aria-hidden="true" />
                          In progress
                        </Button>
                        <Button variant="primary" onClick={() => setIssueStatus(issue, 'Resolved')}>
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Done
                        </Button>
                        <Button variant="ghost" onClick={() => setPendingRemoveIssueId(issue.id)}>
                          <EyeOff size={16} aria-hidden="true" />
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                  {pendingRemoveIssueId === issue.id ? (
                    <div className="issue-confirm-strip">
                      <strong>Remove from the normal board?</strong>
                      <div className="button-row">
                        <Button
                          variant="danger"
                          onClick={() => {
                            setData((current) => closeIssueFromBoard(current, issue.id));
                            setPendingRemoveIssueId(undefined);
                            notify(`${issue.title} removed from the normal board.`, { tone: 'success' });
                          }}
                        >
                          Confirm remove
                        </Button>
                        <Button variant="ghost" onClick={() => setPendingRemoveIssueId(undefined)}>Cancel</Button>
                      </div>
                    </div>
                  ) : null}
                  <details className="issue-card__details">
                    <summary>{done ? 'Completion note' : 'Add a resolution note'}</summary>
                    <Field label="Resolution notes">
                      <CommittedTextarea
                        draftKey={`issue:${issue.id}:resolutionNotes`}
                        rows={2}
                        value={issue.resolutionNotes}
                        onCommit={(resolutionNotes) => setData((current) => updateIssue(current, issue.id, { resolutionNotes }))}
                        placeholder="What fixed it or what still needs follow-up?"
                      />
                    </Field>
                  </details>
                </article>
              );
            })}
            {visibleIssues.length === 0 ? <p className="board-empty">No {statusFilter.toLowerCase()} issues.</p> : null}
          </div>
        </Section>
      </div>

      {isCreateOpen ? (
        <FieldEntryDialog title="Add issue" description="Use this only for a manual field entry. Capture remains the fastest path." onClose={closeCreateIssue}>
          <div className="form-card field-entry-form">
            <Field label="Issue title">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Sink leak, missing keys, re-clean needed..." />
            </Field>
            <div className="grid two">
              <Field label="Unit / area">
                <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                  <option value="">No unit / building-wide</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select value={category} onChange={(event) => setCategory(event.target.value as IssueCategory)}>
                  {ISSUE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <Field label="What happened">
              <textarea value={notes} rows={4} onChange={(event) => setNotes(event.target.value)} placeholder="What needs to be fixed or followed up?" />
            </Field>
            <label className="checkbox-field">
              <input checked={blocksUnit} type="checkbox" onChange={(event) => setBlocksUnit(event.target.checked)} />
              <span>
                <strong>Blocks this unit</strong>
                <small>Only use this when the issue should change the unit board status.</small>
              </span>
            </label>
            <div className="button-row">
              <Button variant="primary" disabled={!title.trim()} onClick={createIssue}><Plus size={18} aria-hidden="true" />Add issue</Button>
              <Button variant="ghost" onClick={closeCreateIssue}>Cancel</Button>
            </div>
          </div>
        </FieldEntryDialog>
      ) : null}
    </>
  );
}
