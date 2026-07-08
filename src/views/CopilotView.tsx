import { Bot, Check, ClipboardCopy, FileText, Lightbulb, Mic, RotateCcw, Save, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { AppData, AppView, BriefingType, DailyLog, DraftAction, DraftActionStatus, MemoryCandidate } from '../types';

interface CopilotViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: (view: AppView, unitId?: string) => void;
}

type CopilotMode = 'quick' | 'ask' | 'briefings' | 'memory';
type DraftFilter = 'pending' | 'applied' | 'rejected' | 'failed' | 'all';

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const modeLabels: { mode: CopilotMode; label: string }[] = [
  { mode: 'quick', label: 'Capture' },
  { mode: 'ask', label: 'Ask' },
  { mode: 'briefings', label: 'Reports' },
  { mode: 'memory', label: 'Memory' },
];

const confidenceLabel = (value: number) => `${Math.round(value * 100)}%`;
const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value : '';
};
const captureBatchId = (draft: DraftAction) => payloadString(draft, 'captureBatchId');
const isStalePendingDraft = (draft: DraftAction) => draft.status === 'pending' && draft.createdAt.slice(0, 10) !== todayISO();
const draftTargetLabel = (draft: DraftAction) => {
  const unitNumber = payloadString(draft, 'unitNumber');
  if (unitNumber) return `Unit ${unitNumber}`;
  if (draft.targetEntityType === 'issue') return 'Issues';
  if (draft.targetEntityType === 'assignment' || draft.targetEntityType === 'crew') return 'Assignments';
  if (draft.targetEntityType === 'dailyLog') return 'Daily Log';
  return draft.targetEntityType;
};

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
  isStale,
  targetLabel,
  onApply,
  onConfirmConflictAndApply,
  onOpenTarget,
  onReject,
  onSavePayload,
}: {
  draft: DraftAction;
  isStale: boolean;
  targetLabel: string;
  onApply: () => void;
  onConfirmConflictAndApply: () => void;
  onOpenTarget?: () => void;
  onReject: () => void;
  onSavePayload: (payload: Record<string, unknown>) => void;
}) {
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(draft.payload, null, 2));
  const [payloadError, setPayloadError] = useState('');
  const isActionable = draft.status === 'pending' || draft.status === 'failed';
  const needsConflictConfirmation =
    draft.payload.requiresConflictConfirmation === true && draft.payload.explicitConflictConfirmation !== true;

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
        <span>Target: {targetLabel}</span>
        <span>Confidence: {confidenceLabel(draft.confidence)}</span>
        {captureBatchId(draft) ? <span>Batch: {captureBatchId(draft).slice(-6)}</span> : null}
        {isStale ? <span>Stale</span> : null}
      </div>
      <details>
        <summary>Why this draft exists</summary>
        <p>{draft.why}</p>
      </details>
      {isStale ? <p className="error-text">This pending draft is from a previous day. Review it by itself before approving.</p> : null}
      {needsConflictConfirmation ? (
        <p className="error-text">
          This conflicts with another draft from the same capture. Confirm this is the correct update before approving.
        </p>
      ) : null}
      <Field label="Editable payload">
        <textarea rows={6} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
      </Field>
      {payloadError ? <p className="error-text">{payloadError}</p> : null}
      {draft.error ? <p className="error-text">{draft.error}</p> : null}
      {draft.status === 'applied' ? <p className="success-text">Applied to {targetLabel}.</p> : null}
      {draft.status === 'rejected' ? <p className="muted">Rejected. No board record was changed.</p> : null}
      {draft.status === 'applied' && onOpenTarget ? (
        <div className="button-row">
          <Button onClick={onOpenTarget}>Open {targetLabel}</Button>
        </div>
      ) : null}
      {isActionable ? (
        <div className="button-row">
          <Button onClick={savePayload}>
            <Save size={16} aria-hidden="true" />
            Save Edit
          </Button>
          {needsConflictConfirmation ? (
            <Button variant="primary" onClick={onConfirmConflictAndApply}>
              <Check size={16} aria-hidden="true" />
              Confirm & Approve
            </Button>
          ) : (
            <Button variant="primary" onClick={onApply}>
              <Check size={16} aria-hidden="true" />
              Approve
            </Button>
          )}
          <Button variant="ghost" onClick={onReject}>
            <X size={16} aria-hidden="true" />
            Reject
          </Button>
        </div>
      ) : null}
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

export function CopilotView({ data, setData, onNavigate }: CopilotViewProps) {
  const [mode, setMode] = useState<CopilotMode>('quick');
  const [quickInput, setQuickInput] = useState('');
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [parseSummary, setParseSummary] = useState('');
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('pending');
  const [activeDraftBatchId, setActiveDraftBatchId] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [askInput, setAskInput] = useState('');
  const [askResult, setAskResult] = useState<AskOsResult | null>(null);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingText, setBriefingText] = useState('');
  const [copied, setCopied] = useState(false);
  const smartSuggestions = useMemo(() => generateSmartSuggestions(data), [data]);
  const draftCounts = useMemo(
    () => ({
      pending: data.draftActions.filter((draft) => draft.status === 'pending').length,
      applied: data.draftActions.filter((draft) => draft.status === 'applied').length,
      rejected: data.draftActions.filter((draft) => draft.status === 'rejected').length,
      failed: data.draftActions.filter((draft) => draft.status === 'failed').length,
      all: data.draftActions.length,
    }),
    [data.draftActions],
  );
  const latestPendingBatchId = useMemo(() => {
    const latestPendingDraft = data.draftActions.find((draft) => draft.status === 'pending' && captureBatchId(draft));
    return latestPendingDraft ? captureBatchId(latestPendingDraft) : '';
  }, [data.draftActions]);
  const selectedPendingBatchId = activeDraftBatchId || latestPendingBatchId || '';
  const visibleDrafts = useMemo(() => {
    if (draftFilter === 'all') {
      return data.draftActions.slice(0, 20);
    }
    const byStatus = data.draftActions.filter((draft) => draft.status === draftFilter);
    if (draftFilter === 'pending' && selectedPendingBatchId) {
      return byStatus.filter((draft) => captureBatchId(draft) === selectedPendingBatchId).slice(0, 20);
    }
    return byStatus.slice(0, 20);
  }, [data.draftActions, draftFilter, selectedPendingBatchId]);
  const visiblePendingDraftIds = useMemo(
    () => visibleDrafts.filter((draft) => draft.status === 'pending').map((draft) => draft.id),
    [visibleDrafts],
  );
  const pendingMemory = data.memoryCandidates.filter((candidate) => candidate.status === 'pending');
  const quickInputReady = quickInput.trim().length > 0;
  const speechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  useEffect(() => {
    if (mode !== 'quick') {
      return;
    }

    const id = window.setTimeout(() => quickInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [mode]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
    },
    [],
  );

  const stopVoiceCapture = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimTranscript('');
  };

  const startVoiceCapture = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('Voice transcription is not available in this browser. Use the iPad/iPhone keyboard dictation mic in the note box.');
      quickInputRef.current?.focus();
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interim = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalTranscript = [finalTranscript, transcript.trim()].filter(Boolean).join(' ');
        } else {
          interim = [interim, transcript.trim()].filter(Boolean).join(' ');
        }
      }

      if (finalTranscript) {
        setQuickInput((current) => [current.trim(), finalTranscript].filter(Boolean).join(current.trim() ? ' ' : ''));
      }
      setInterimTranscript(interim);
    };
    recognition.onerror = (event) => {
      setVoiceStatus(`Voice capture stopped: ${event.error ?? event.message ?? 'browser error'}.`);
      setIsRecording(false);
    };
    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };
    recognitionRef.current = recognition;
    setVoiceStatus('Listening. Speak naturally, then stop when the note is done.');
    setIsRecording(true);
    recognition.start();
  };

  const parseQuickCapture = async () => {
    if (!quickInputReady) {
      return;
    }

    const result = await agentProvider.parseQuickCapture(quickInput, data);
    setParseSummary(result.summary);
    setDraftNotice('');
    setDraftFilter('pending');
    const batchId = createId('capture_batch');
    if (result.draftActions.length > 0) {
      setActiveDraftBatchId(batchId);
    }
    setData((current) => {
      let next = addDraftActions(current, result.draftActions, quickInput, batchId);
      next = addMemoryCandidates(next, result.memoryCandidates);
      return addAgentRun(next, 'quick_capture', quickInput, result);
    });
  };

  const afterDraftChange = (draft: DraftAction, status: DraftActionStatus) => {
    if (status === 'applied') {
      setDraftNotice(`Approved "${draft.title}". It moved to Applied.`);
      setDraftFilter('applied');
      return;
    }
    if (status === 'rejected') {
      setDraftNotice(`Rejected "${draft.title}". It moved to Rejected.`);
      setDraftFilter('rejected');
      return;
    }
    if (status === 'failed') {
      setDraftNotice(`"${draft.title}" needs review. It moved to Failed.`);
      setDraftFilter('failed');
    }
  };

  const applyOneDraft = (draft: DraftAction) => {
    setData((current) => {
      const next = applyDraftAction(current, draft.id);
      const updated = next.draftActions.find((item) => item.id === draft.id);
      if (updated) {
        window.queueMicrotask(() => afterDraftChange(draft, updated.status));
      }
      return next;
    });
  };

  const confirmConflictAndApplyOneDraft = (draft: DraftAction) => {
    setData((current) => {
      const confirmedPayload = { ...draft.payload, explicitConflictConfirmation: true };
      const withConfirmation = updateDraftAction(current, draft.id, { payload: confirmedPayload });
      const next = applyDraftAction(withConfirmation, draft.id);
      const updated = next.draftActions.find((item) => item.id === draft.id);
      if (updated) {
        window.queueMicrotask(() => afterDraftChange(draft, updated.status));
      }
      return next;
    });
  };

  const rejectOneDraft = (draft: DraftAction) => {
    setData((current) => {
      const next = rejectDraftAction(current, draft.id);
      const updated = next.draftActions.find((item) => item.id === draft.id);
      if (updated) {
        window.queueMicrotask(() => afterDraftChange(draft, updated.status));
      }
      return next;
    });
  };

  const applyPendingDrafts = () => {
    const count = visiblePendingDraftIds.length;
    setData((current) => applyAllPendingDraftActions(current, visiblePendingDraftIds));
    setDraftNotice(`Approved ${count} visible pending draft(s). Applied items moved to Applied; anything blocked moved to Failed.`);
    setDraftFilter('applied');
  };

  const rejectPendingDrafts = () => {
    const count = visiblePendingDraftIds.length;
    setData((current) => rejectAllPendingDraftActions(current, visiblePendingDraftIds));
    setDraftNotice(`Rejected ${count} visible pending draft(s). They moved to Rejected and no board records changed.`);
    setDraftFilter('rejected');
  };

  const openDraftTarget = (draft: DraftAction) => {
    const unitNumber = payloadString(draft, 'unitNumber');
    const unitId =
      draft.targetEntityId ??
      data.units.find((unit) => unit.projectId === data.activeProjectId && unitNumber && unit.unitNumber === unitNumber)?.id;

    if (unitId && (draft.targetEntityType === 'unit' || unitNumber)) {
      onNavigate('unitDetail', unitId);
      return;
    }

    if (draft.type === 'CREATE_ISSUE' || draft.type === 'UPDATE_ISSUE') {
      onNavigate('issues');
      return;
    }

    if (draft.type === 'CREATE_ASSIGNMENT' || draft.type === 'UPDATE_ASSIGNMENT') {
      onNavigate('assignments');
      return;
    }

    if (draft.type === 'ADD_DAILY_LOG_ENTRY') {
      onNavigate('daily');
    }
  };

  const canOpenDraftTarget = (draft: DraftAction) =>
    Boolean(
      (draft.targetEntityType === 'unit' && (draft.targetEntityId || payloadString(draft, 'unitNumber'))) ||
        draft.type === 'CREATE_ISSUE' ||
        draft.type === 'UPDATE_ISSUE' ||
        draft.type === 'CREATE_ASSIGNMENT' ||
        draft.type === 'UPDATE_ASSIGNMENT' ||
        draft.type === 'ADD_DAILY_LOG_ENTRY',
    );

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
          <span className="quiet-label">Draft-first field notes</span>
          <h1>Capture</h1>
        </div>
        <Mic size={28} aria-hidden="true" />
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Capture modes">
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
          <Section title="Field Capture" kicker="Draft-first">
            <div className="form-card copilot-card">
              <div className={`voice-memo ${isRecording ? 'is-recording' : ''}`}>
                <button
                  className="voice-record-button"
                  type="button"
                  onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                  aria-pressed={isRecording}
                >
                  {isRecording ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
                  <span>{isRecording ? 'Stop' : 'Record'}</span>
                </button>
                <div className="voice-meter" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div>
                  <strong>{isRecording ? 'Recording voice note' : 'Voice note'}</strong>
                  <p>
                    {speechSupported
                      ? 'Tap Record to transcribe, or tap the note box and use keyboard dictation.'
                      : 'Use the iPad/iPhone keyboard dictation mic in the note box.'}
                  </p>
                </div>
              </div>
              {interimTranscript ? <p className="voice-interim">{interimTranscript}</p> : null}
              {voiceStatus ? <p className={isRecording ? 'success-text' : 'muted'}>{voiceStatus}</p> : null}

              <Field label="Voice or messy note">
                <textarea
                  ref={quickInputRef}
                  autoFocus
                  enterKeyHint="done"
                  rows={7}
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="Unit 204 paint done but cleaning blocked because keys are missing. Jose crew moved from 203 to 205. Unit 312 has sink leak, ask Tony."
                />
              </Field>
              <p className="muted">Drafts only. Nothing changes until approval.</p>
              <div className="button-row capture-actions">
                <Button disabled={!quickInputReady} variant="primary" onClick={parseQuickCapture}>
                  <Sparkles size={18} aria-hidden="true" />
                  Create Drafts
                </Button>
                <Button disabled={!quickInputReady} onClick={saveRawNoteOnly}>
                  <Save size={18} aria-hidden="true" />
                  Save Raw Note
                </Button>
                <Button disabled={!quickInputReady} variant="ghost" onClick={() => setQuickInput('')}>
                  <RotateCcw size={18} aria-hidden="true" />
                  Clear
                </Button>
              </div>
              {parseSummary ? <p className="success-text">{parseSummary}</p> : null}
            </div>
          </Section>

          <Section
            title="Draft Actions Inbox"
            kicker={`${draftCounts.pending} pending`}
            action={
              <div className="button-row">
                <Button disabled={visiblePendingDraftIds.length === 0} onClick={applyPendingDrafts}>Approve Visible</Button>
                <Button disabled={visiblePendingDraftIds.length === 0} variant="ghost" onClick={rejectPendingDrafts}>
                  Reject Visible
                </Button>
              </div>
            }
          >
            <div className="draft-filter-row" role="tablist" aria-label="Draft action status">
              {(['pending', 'applied', 'rejected', 'failed', 'all'] as DraftFilter[]).map((filter) => (
                <button
                  key={filter}
                  className={draftFilter === filter ? 'is-active' : ''}
                  type="button"
                  onClick={() => setDraftFilter(filter)}
                >
                  <span>{filter === 'all' ? 'All' : `${filter[0].toUpperCase()}${filter.slice(1)}`}</span>
                  <strong>{draftCounts[filter]}</strong>
                </button>
              ))}
            </div>
            <p className="muted">
              Approved drafts update the board. Bulk actions only affect the visible pending drafts in this view.
            </p>
            {draftFilter === 'pending' && selectedPendingBatchId ? (
              <p className="muted">Showing the current capture batch. Use All to review older drafts.</p>
            ) : null}
            {draftNotice ? <p className="success-text">{draftNotice}</p> : null}
            <div className="draft-list">
              {visibleDrafts.map((draft) => (
                <DraftActionCard
                  key={draft.id}
                  draft={draft}
                  isStale={isStalePendingDraft(draft)}
                  targetLabel={draftTargetLabel(draft)}
                  onApply={() => applyOneDraft(draft)}
                  onConfirmConflictAndApply={() => confirmConflictAndApplyOneDraft(draft)}
                  onOpenTarget={canOpenDraftTarget(draft) ? () => openDraftTarget(draft) : undefined}
                  onReject={() => rejectOneDraft(draft)}
                  onSavePayload={(payload) => setData((current) => updateDraftAction(current, draft.id, { payload }))}
                />
              ))}
              {visibleDrafts.length === 0 ? <p className="muted">No {draftFilter === 'all' ? '' : `${draftFilter} `}draft actions yet.</p> : null}
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
