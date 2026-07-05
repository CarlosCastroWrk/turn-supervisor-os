import { Bot, Check, ClipboardCopy, FileText, Lightbulb, RotateCcw, Save, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import {
  addAgentRun,
  addCopilotConversation,
  addDraftActions,
  addMemoryCandidates,
  applyAllPendingDraftActions,
  applyDraftAction,
  approveMemoryCandidate,
  rejectAllPendingDraftActions,
  rejectDraftAction,
  rejectMemoryCandidate,
  updateDraftAction,
  updateMemory,
  updateMemoryCandidate,
  upsertDailyLog,
} from '../lib/actions';
import { agentProvider } from '../lib/ai/agentProvider';
import { generateSmartSuggestions } from '../lib/ai/suggestions';
import type { AskOsResult, BriefingResult } from '../lib/ai/types';
import { createId, nowISO, todayISO } from '../lib/constants';
import type { AppData, BriefingType, DailyLog, DraftAction, MemoryCandidate } from '../types';

interface CopilotViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

type CopilotMode = 'quick' | 'ask' | 'briefings' | 'memory';

const modeLabels: { mode: CopilotMode; label: string }[] = [
  { mode: 'quick', label: 'Quick Capture' },
  { mode: 'ask', label: 'Ask the OS' },
  { mode: 'briefings', label: 'Briefings' },
  { mode: 'memory', label: 'Memory' },
];

const confidenceLabel = (value: number) => `${Math.round(value * 100)}%`;

const emptyDailyLog = (projectId: string, date: string): DailyLog => {
  const now = nowISO();
  return {
    id: createId('daily'),
    projectId,
    date,
    morningPlan: '',
    middayUpdate: '',
    endOfDayReflection: '',
    completedSummary: '',
    blockers: '',
    lessons: '',
    tomorrowPriorities: '',
    createdAt: now,
    updatedAt: now,
  };
};

function DraftActionCard({
  draft,
  onApply,
  onReject,
  onSavePayload,
}: {
  draft: DraftAction;
  onApply: () => void;
  onReject: () => void;
  onSavePayload: (payload: Record<string, unknown>) => void;
}) {
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(draft.payload, null, 2));
  const [payloadError, setPayloadError] = useState('');

  const savePayload = () => {
    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>;
      onSavePayload(parsed);
      setPayloadError('');
    } catch {
      setPayloadError('Payload must be valid JSON before saving.');
    }
  };

  return (
    <article className="draft-card">
      <div className="draft-card__header">
        <div>
          <span className="quiet-label">{draft.type.replaceAll('_', ' ')}</span>
          <h3>{draft.title}</h3>
        </div>
        <StatusBadge value={draft.status} />
      </div>
      <p>{draft.summary}</p>
      <div className="draft-meta">
        <span>Target: {draft.targetEntityType}</span>
        <span>Confidence: {confidenceLabel(draft.confidence)}</span>
      </div>
      <details>
        <summary>Why this draft exists</summary>
        <p>{draft.why}</p>
      </details>
      <Field label="Editable payload">
        <textarea rows={6} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
      </Field>
      {payloadError ? <p className="error-text">{payloadError}</p> : null}
      {draft.error ? <p className="error-text">{draft.error}</p> : null}
      <div className="button-row">
        <Button onClick={savePayload}>
          <Save size={16} aria-hidden="true" />
          Save Edit
        </Button>
        <Button variant="primary" onClick={onApply}>
          <Check size={16} aria-hidden="true" />
          Approve / Apply
        </Button>
        <Button variant="ghost" onClick={onReject}>
          <X size={16} aria-hidden="true" />
          Reject
        </Button>
      </div>
    </article>
  );
}

function MemoryCandidateCard({
  candidate,
  onApprove,
  onReject,
  onEdit,
}: {
  candidate: MemoryCandidate;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (content: string) => void;
}) {
  return (
    <article className="memory-card">
      <div className="draft-card__header">
        <div>
          <span className="quiet-label">{candidate.memoryType}</span>
          <h3>Memory Candidate</h3>
        </div>
        <StatusBadge value={candidate.status} />
      </div>
      <Field label="Content">
        <textarea rows={3} value={candidate.content} onChange={(event) => onEdit(event.target.value)} />
      </Field>
      <small>Source: {candidate.source}</small>
      <div className="button-row">
        <Button variant="primary" onClick={onApprove}>
          <Check size={16} aria-hidden="true" />
          Approve
        </Button>
        <Button variant="ghost" onClick={onReject}>
          <Trash2 size={16} aria-hidden="true" />
          Reject
        </Button>
      </div>
    </article>
  );
}

export function CopilotView({ data, setData }: CopilotViewProps) {
  const [mode, setMode] = useState<CopilotMode>('quick');
  const [quickInput, setQuickInput] = useState('');
  const [parseSummary, setParseSummary] = useState('');
  const [askInput, setAskInput] = useState('');
  const [askResult, setAskResult] = useState<AskOsResult | null>(null);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingText, setBriefingText] = useState('');
  const [copied, setCopied] = useState(false);
  const smartSuggestions = useMemo(() => generateSmartSuggestions(data), [data]);
  const pendingDrafts = data.draftActions.filter((draft) => draft.status === 'pending' || draft.status === 'failed');
  const recentDrafts = data.draftActions.slice(0, 10);
  const pendingMemory = data.memoryCandidates.filter((candidate) => candidate.status === 'pending');

  const parseQuickCapture = async () => {
    const result = await agentProvider.parseQuickCapture(quickInput, data);
    setParseSummary(result.summary);
    setData((current) => {
      let next = addDraftActions(current, result.draftActions, quickInput);
      next = addMemoryCandidates(next, result.memoryCandidates);
      return addAgentRun(next, 'quick_capture', quickInput, result);
    });
  };

  const saveRawNoteOnly = () => {
    if (!quickInput.trim()) {
      return;
    }

    setData((current) => {
      const existing =
        current.dailyLogs.find((log) => log.projectId === current.activeProjectId && log.date === todayISO()) ??
        emptyDailyLog(current.activeProjectId, todayISO());
      return upsertDailyLog(current, {
        ...existing,
        middayUpdate: [existing.middayUpdate, `Raw Copilot note: ${quickInput.trim()}`].filter(Boolean).join('\n'),
      });
    });
    setParseSummary('Saved raw note to today’s Daily Log.');
  };

  const askOs = async () => {
    if (!askInput.trim()) {
      return;
    }

    const result = await agentProvider.askOs(askInput, data);
    setAskResult(result);
    setData((current) => {
      const withConversation = addCopilotConversation(
        current,
        askInput,
        result.conciseAnswer,
        result.supportingRecords,
        result.suggestedNextActions,
      );
      return addAgentRun(withConversation, 'ask_os', askInput, result);
    });
  };

  const generateBriefing = async (type: BriefingType) => {
    const result = await agentProvider.generateBriefing(type, data);
    setBriefing(result);
    setBriefingText(result.body);
    setData((current) => addAgentRun(current, type === 'end_of_day' ? 'report' : 'briefing', type, result));
  };

  const copyBriefing = async () => {
    try {
      await navigator.clipboard.writeText(briefingText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.alert('Copy failed on this browser. Press and hold the briefing text to select and copy it manually.');
    }
  };

  const saveBriefingToDailyLog = () => {
    if (!briefingText.trim()) {
      return;
    }

    setData((current) => {
      const existing =
        current.dailyLogs.find((log) => log.projectId === current.activeProjectId && log.date === todayISO()) ??
        emptyDailyLog(current.activeProjectId, todayISO());
      return upsertDailyLog(current, {
        ...existing,
        endOfDayReflection: [existing.endOfDayReflection, briefingText].filter(Boolean).join('\n\n'),
      });
    });
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Draft-first local copilot</span>
          <h1>Copilot</h1>
        </div>
        <Bot size={28} aria-hidden="true" />
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Copilot modes">
        {modeLabels.map((item) => (
          <button
            key={item.mode}
            className={mode === item.mode ? 'is-active' : ''}
            type="button"
            onClick={() => setMode(item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'quick' ? (
        <>
          <Section title="Quick Capture" kicker="Use iPhone/iPad dictation">
            <div className="form-card copilot-card">
              <Field label="Messy field note">
                <textarea
                  rows={7}
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="Example: Building A unit 204 paint done but cleaning blocked because keys are missing. Jose crew moved from 203 to 205. Unit 312 has sink leak, ask Tony."
                />
              </Field>
              <p className="muted">Tip: tap the text box and use dictation. Copilot creates drafts only; you approve before anything changes.</p>
              <div className="button-row">
                <Button variant="primary" onClick={parseQuickCapture}>
                  <Sparkles size={18} aria-hidden="true" />
                  Parse Note
                </Button>
                <Button onClick={saveRawNoteOnly}>
                  <Save size={18} aria-hidden="true" />
                  Save Raw Note
                </Button>
                <Button variant="ghost" onClick={() => setQuickInput('')}>
                  <RotateCcw size={18} aria-hidden="true" />
                  Clear
                </Button>
              </div>
              {parseSummary ? <p className="success-text">{parseSummary}</p> : null}
            </div>
          </Section>

          <Section
            title="Draft Actions Inbox"
            kicker={`${pendingDrafts.length} pending`}
            action={
              <div className="button-row">
                <Button onClick={() => setData((current) => applyAllPendingDraftActions(current))}>Approve All</Button>
                <Button variant="ghost" onClick={() => setData((current) => rejectAllPendingDraftActions(current))}>
                  Reject All
                </Button>
              </div>
            }
          >
            <div className="draft-list">
              {(pendingDrafts.length ? pendingDrafts : recentDrafts).map((draft) => (
                <DraftActionCard
                  key={draft.id}
                  draft={draft}
                  onApply={() => setData((current) => applyDraftAction(current, draft.id))}
                  onReject={() => setData((current) => rejectDraftAction(current, draft.id))}
                  onSavePayload={(payload) => setData((current) => updateDraftAction(current, draft.id, { payload }))}
                />
              ))}
              {recentDrafts.length === 0 ? <p className="muted">No draft actions yet. Parse a field note to create drafts.</p> : null}
            </div>
          </Section>
        </>
      ) : null}

      {mode === 'ask' ? (
        <Section title="Ask the OS" kicker="Answers use local app data only">
          <div className="form-card copilot-card">
            <Field label="Question">
              <input
                value={askInput}
                onChange={(event) => setAskInput(event.target.value)}
                placeholder="What should I tell Tony right now?"
              />
            </Field>
            <Button variant="primary" onClick={askOs}>
              <Send size={18} aria-hidden="true" />
              Ask
            </Button>
            {askResult ? (
              <article className="answer-card">
                <h3>{askResult.conciseAnswer}</h3>
                <div>
                  <span className="quiet-label">Supporting records</span>
                  <ul>
                    {askResult.supportingRecords.map((record) => (
                      <li key={record}>{record}</li>
                    ))}
                  </ul>
                </div>
                {askResult.uncertainty.length > 0 ? (
                  <div>
                    <span className="quiet-label">Uncertainty</span>
                    <ul>
                      {askResult.uncertainty.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <span className="quiet-label">Suggested next action</span>
                  <ul>
                    {askResult.suggestedNextActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ) : null}
          </div>
        </Section>
      ) : null}

      {mode === 'briefings' ? (
        <>
          <Section title="Briefings / Reports" kicker="Editable and copyable">
            <div className="form-card">
              <div className="quick-grid">
                <button className="quick-action" type="button" onClick={() => generateBriefing('morning')}>
                  <Lightbulb size={22} aria-hidden="true" />
                  <span>
                    <strong>Morning Brief</strong>
                    <small>Priorities and risks</small>
                  </span>
                </button>
                <button className="quick-action" type="button" onClick={() => generateBriefing('midday')}>
                  <Bot size={22} aria-hidden="true" />
                  <span>
                    <strong>Midday Brief</strong>
                    <small>What needs attention</small>
                  </span>
                </button>
                <button className="quick-action" type="button" onClick={() => generateBriefing('end_of_day')}>
                  <FileText size={22} aria-hidden="true" />
                  <span>
                    <strong>End-of-Day Report</strong>
                    <small>Copy to Tony</small>
                  </span>
                </button>
              </div>
              {briefing ? (
                <>
                  <Field label={briefing.title}>
                    <textarea className="report-box" value={briefingText} onChange={(event) => setBriefingText(event.target.value)} />
                  </Field>
                  <div className="button-row">
                    <Button variant="primary" onClick={copyBriefing}>
                      <ClipboardCopy size={18} aria-hidden="true" />
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button onClick={saveBriefingToDailyLog}>
                      <Save size={18} aria-hidden="true" />
                      Save to Daily Log
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </Section>

          <Section title="Smart Suggestions" kicker={`${smartSuggestions.length} active`}>
            <div className="suggestion-list">
              {smartSuggestions.map((suggestion) => (
                <article className="suggestion-card" key={suggestion.id}>
                  <div>
                    <h3>{suggestion.title}</h3>
                    <p>{suggestion.description}</p>
                  </div>
                  <StatusBadge value={suggestion.priority} />
                </article>
              ))}
              {smartSuggestions.length === 0 ? <p className="muted">No deterministic suggestions active.</p> : null}
            </div>
          </Section>
        </>
      ) : null}

      {mode === 'memory' ? (
        <>
          <Section title="Memory Inbox" kicker={`${pendingMemory.length} pending`}>
            <div className="draft-list">
              {pendingMemory.map((candidate) => (
                <MemoryCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onApprove={() => setData((current) => approveMemoryCandidate(current, candidate.id))}
                  onReject={() => setData((current) => rejectMemoryCandidate(current, candidate.id))}
                  onEdit={(content) => setData((current) => updateMemoryCandidate(current, candidate.id, { content }))}
                />
              ))}
              {pendingMemory.length === 0 ? <p className="muted">No pending memory candidates.</p> : null}
            </div>
          </Section>

          <Section title="Approved Memory" kicker={`${data.memories.filter((memory) => memory.approved).length} active`}>
            <div className="memory-grid">
              {data.memories.map((memory) => (
                <article className="memory-card" key={memory.id}>
                  <span className="quiet-label">{memory.memoryType}</span>
                  <Field label="Memory">
                    <textarea
                      rows={3}
                      value={memory.content}
                      onChange={(event) => setData((current) => updateMemory(current, memory.id, { content: event.target.value }))}
                    />
                  </Field>
                  <small>Source: {memory.source}</small>
                  <Button variant={memory.approved ? 'secondary' : 'ghost'} onClick={() => setData((current) => updateMemory(current, memory.id, { approved: !memory.approved }))}>
                    {memory.approved ? 'Active' : 'Inactive'}
                  </Button>
                </article>
              ))}
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}

