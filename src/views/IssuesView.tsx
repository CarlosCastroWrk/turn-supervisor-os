import { AlertOctagon, CheckCircle2, EyeOff, PlayCircle, Plus, TimerReset } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { addIssueWithOptionalUnitBlock, closeIssueFromBoard, resolveIssue, updateIssue } from '../lib/actions';
import { createId, nowISO } from '../lib/constants';
import { ISSUE_CATEGORIES, ISSUE_STATUSES } from '../lib/constants';
import { getActiveProject, getProjectIssues, getProjectUnits } from '../lib/metrics';
import type { AppData, Issue, IssueCategory, IssueStatus } from '../types';

interface IssuesViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  focusedIssueId?: string;
}

type IssueStatusFilter = 'Active' | 'All' | IssueStatus;

const activeIssueStatuses = new Set<IssueStatus>(['Open', 'In Progress', 'Waiting']);
const issueStatusFilters: IssueStatusFilter[] = ['Active', 'All', ...ISSUE_STATUSES];
const defaultManualIssuePriority: Issue['priority'] = 'Medium';

const matchesIssueStatusFilter = (issue: Issue, filter: IssueStatusFilter) => {
  if (filter === 'All') return true;
  if (filter === 'Active') return activeIssueStatuses.has(issue.status);
  return issue.status === filter;
};

const issueStatusSortWeight: Record<IssueStatus, number> = {
  Open: 0,
  'In Progress': 1,
  Waiting: 2,
  Resolved: 3,
  Closed: 4,
};

export function IssuesView({ data, setData, focusedIssueId }: IssuesViewProps) {
  const activeProject = getActiveProject(data);
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data);
  const defaultOwner = activeProject.supervisorName.trim() || 'Los';
  const [statusFilter, setStatusFilter] = useState<IssueStatusFilter>('Active');
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState<IssueCategory>('Maintenance');
  const [owner, setOwner] = useState(defaultOwner);
  const [notes, setNotes] = useState('');
  const [blocksUnit, setBlocksUnit] = useState(false);
  const [pendingRemoveIssueId, setPendingRemoveIssueId] = useState<string | undefined>();
  const focusedIssueRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOwner((current) => current.trim() || defaultOwner);
  }, [defaultOwner]);

  const visibleIssues = useMemo(
    () =>
      issues
        .filter((issue) => matchesIssueStatusFilter(issue, statusFilter))
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
    if (focusedIssue && !matchesIssueStatusFilter(focusedIssue, statusFilter)) {
      setStatusFilter('All');
    }
  }, [focusedIssueId, issues, statusFilter]);

  useEffect(() => {
    if (!focusedIssueId || !focusedIssueRef.current) {
      return;
    }

    focusedIssueRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusedIssueRef.current.focus({ preventScroll: true });
  }, [focusedIssueId, visibleIssues]);

  const createIssue = () => {
    if (!title.trim()) {
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
        title: title.trim(),
        category,
        priority: defaultManualIssuePriority,
        owner: owner.trim() || defaultOwner,
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
    setOwner(defaultOwner);
    setNotes('');
    setBlocksUnit(false);
    setPendingRemoveIssueId(undefined);
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Never rely on memory</span>
          <h1>Issue Tracker</h1>
        </div>
      </div>

      <Section title="Log Issue" kicker="Under 20 seconds" action={<AlertOctagon size={18} aria-hidden="true" />}>
        <div className="form-card">
          <Field label="Issue title">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Unit 204 waiting on maintenance" />
          </Field>
          <div className="grid three">
            <Field label="Unit / area">
              <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                <option value="">No unit / building-wide</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(event) => setCategory(event.target.value as IssueCategory)}>
                {ISSUE_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Owner / responsible">
              <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Los, Tony, maintenance..." />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder="What happened? What is blocked?" />
          </Field>
          <label className="checkbox-field">
            <input checked={blocksUnit} type="checkbox" onChange={(event) => setBlocksUnit(event.target.checked)} />
            <span>
              <strong>Blocks this unit</strong>
              <small>Only turn this on if the issue should change the unit board status.</small>
            </span>
          </label>
          <Button variant="primary" onClick={createIssue}>
            <Plus size={18} aria-hidden="true" />
            Add Issue
          </Button>
        </div>
      </Section>

      <Section title="Open Board" kicker={`${visibleIssues.length} shown`}>
        <div className="filter-panel">
          <Field label="Status">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as IssueStatusFilter)}>
              {issueStatusFilters.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="issue-list">
          {visibleIssues.map((issue) => {
            const linkedUnit = units.find((unit) => unit.id === issue.unitId);
            return (
              <article
                className={`issue-card ${focusedIssueId === issue.id ? 'issue-card--focused' : ''}`}
                key={issue.id}
                ref={focusedIssueId === issue.id ? focusedIssueRef : undefined}
                tabIndex={focusedIssueId === issue.id ? -1 : undefined}
              >
                <div className="issue-card__header">
                  <div>
                    <h3>{issue.title}</h3>
                    <small>
                      {linkedUnit ? `Unit ${linkedUnit.unitNumber}` : 'No unit linked'} · {issue.category}
                    </small>
                  </div>
                  <div className="badge-row">
                    <StatusBadge value={issue.status} />
                  </div>
                </div>
                <p>{issue.notes || 'No notes yet.'}</p>
                <div className="issue-card__meta">
                  <span>Owner: {issue.owner || 'Not set'}</span>
                  <span>Logged: {new Date(issue.createdAt).toLocaleString()}</span>
                </div>
                <div className="quick-status-row">
                  {['Resolved', 'Closed'].includes(issue.status) ? (
                    <Button onClick={() => setData((current) => updateIssue(current, issue.id, { status: 'Open' }))}>
                      <TimerReset size={16} aria-hidden="true" />
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button
                        className={issue.status === 'In Progress' ? 'is-selected' : ''}
                        onClick={() => setData((current) => updateIssue(current, issue.id, { status: 'In Progress' }))}
                      >
                        <PlayCircle size={16} aria-hidden="true" />
                        Start
                      </Button>
                      <Button
                        className={issue.status === 'Waiting' ? 'is-selected' : ''}
                        onClick={() => setData((current) => updateIssue(current, issue.id, { status: 'Waiting' }))}
                      >
                        <TimerReset size={16} aria-hidden="true" />
                        Waiting
                      </Button>
                      <Button onClick={() => setData((current) => resolveIssue(current, issue.id))}>
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Resolve
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
                    <strong>Remove from normal board?</strong>
                    <div className="button-row">
                      <Button
                        variant="danger"
                        onClick={() => {
                          setData((current) => closeIssueFromBoard(current, issue.id));
                          setPendingRemoveIssueId(undefined);
                        }}
                      >
                        Confirm remove
                      </Button>
                      <Button variant="ghost" onClick={() => setPendingRemoveIssueId(undefined)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                <Field label="Resolution notes">
                  <textarea
                    rows={2}
                    value={issue.resolutionNotes}
                    onChange={(event) => setData((current) => updateIssue(current, issue.id, { resolutionNotes: event.target.value }))}
                    placeholder="What fixed it? What still needs follow-up?"
                  />
                </Field>
              </article>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
