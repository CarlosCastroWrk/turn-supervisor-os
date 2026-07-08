import { AlertOctagon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { addIssueWithOptionalUnitBlock, updateIssue } from '../lib/actions';
import { createId, nowISO } from '../lib/constants';
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUSES } from '../lib/constants';
import { getProjectIssues, getProjectUnits } from '../lib/metrics';
import type { AppData, Issue, IssueCategory, IssuePriority, IssueStatus } from '../types';

interface IssuesViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function IssuesView({ data, setData }: IssuesViewProps) {
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data);
  const [statusFilter, setStatusFilter] = useState('Open');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState<IssueCategory>('Maintenance');
  const [priority, setPriority] = useState<IssuePriority>('High');
  const [owner, setOwner] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [blocksUnit, setBlocksUnit] = useState(false);

  const visibleIssues = useMemo(
    () =>
      issues
        .filter((issue) => statusFilter === 'All' || issue.status === statusFilter)
        .filter((issue) => priorityFilter === 'All' || issue.priority === priorityFilter)
        .sort((a, b) => {
          const weights = { Critical: 4, High: 3, Medium: 2, Low: 1 };
          return weights[b.priority] - weights[a.priority] || b.updatedAt.localeCompare(a.updatedAt);
        }),
    [issues, priorityFilter, statusFilter],
  );

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
        priority,
        owner,
        status: 'Open',
        dueAt,
        notes,
        resolutionNotes: '',
        createdAt: now,
        updatedAt: now,
      };

      return addIssueWithOptionalUnitBlock(current, issue, blocksUnit);
    });

    setTitle('');
    setUnitId('');
    setOwner('');
    setDueAt('');
    setNotes('');
    setBlocksUnit(false);
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
            <Field label="Priority">
              <select value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>
                {ISSUE_PRIORITIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Owner / responsible">
              <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Los, Tony, maintenance..." />
            </Field>
            <Field label="Due date/time">
              <input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="datetime-local" />
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
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>All</option>
              {ISSUE_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option>All</option>
              {ISSUE_PRIORITIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="issue-list">
          {visibleIssues.map((issue) => {
            const linkedUnit = units.find((unit) => unit.id === issue.unitId);
            return (
              <article className="issue-card" key={issue.id}>
                <div className="issue-card__header">
                  <div>
                    <h3>{issue.title}</h3>
                    <small>
                      {linkedUnit ? `Unit ${linkedUnit.unitNumber}` : 'No unit linked'} · {issue.category}
                    </small>
                  </div>
                  <div className="badge-row">
                    <StatusBadge value={issue.priority} />
                    <StatusBadge value={issue.status} />
                  </div>
                </div>
                <p>{issue.notes || 'No notes yet.'}</p>
                <div className="issue-card__meta">
                  <span>Owner: {issue.owner || 'Not set'}</span>
                  <span>Due: {issue.dueAt ? new Date(issue.dueAt).toLocaleString() : 'Not set'}</span>
                </div>
                <div className="quick-status-row">
                  {ISSUE_STATUSES.map((status) => (
                    <Button
                      key={status}
                      className={issue.status === status ? 'is-selected' : ''}
                      onClick={() => setData((current) => updateIssue(current, issue.id, { status: status as IssueStatus }))}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
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
