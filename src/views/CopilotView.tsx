import { Bot, Check, ClipboardCopy, FileText, Lightbulb, Mic, RotateCcw, Save, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { useToast } from '../components/toast-context';
import { StatusBadge } from '../components/StatusBadge';
import {
  addAgentRun,
  addCopilotConversation,
  addDraftActions,
  addMemoryCandidates,
  applyAllPendingDraftActions,
  applyDraftAction,
  approveMemoryCandidate,
  markMemoriesUsed,
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
import { createId, localISODateFromDateTime, nowISO, todayISO } from '../lib/constants';
import { getActiveProjectMemoryCandidates, prepareMemoryCandidatesForActiveProject } from '../lib/memory';
import { getProjectDraftActions } from '../lib/projectScope';
import type { AppNavigate } from '../lib/routing';
import { formatVoiceDuration, getVoiceCaptureGuidance, isRestartableSpeechError, shouldAutoFocusCaptureText, voiceErrorStatus } from '../lib/voiceCapture';
import type { AppData, BriefingType, DailyLog, DraftAction, DraftActionStatus, MemoryCandidate } from '../types';

interface CopilotViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: AppNavigate;
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
];

const confidenceLabel = (value: number) => `${Math.round(value * 100)}%`;
const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value : '';
};
const captureBatchId = (draft: DraftAction) => payloadString(draft, 'captureBatchId');
const isStalePendingDraft = (draft: DraftAction) =>
  draft.status === 'pending' && localISODateFromDateTime(draft.createdAt) !== todayISO();
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
  showAppliedOpenButton = true,
}: {
  draft: DraftAction;
  isStale: boolean;
  targetLabel: string;
  onApply: () => void;
  onConfirmConflictAndApply: () => void;
  onOpenTarget?: () => void;
  onReject: () => void;
  onSavePayload: (payload: Record<string, unknown>) => void;
  showAppliedOpenButton?: boolean;
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
          This capture produced more than one possible update for {targetLabel}. Approve only the version that matches the field.
        </p>
      ) : null}
      {draft.error ? <p className="error-text">{draft.error}</p> : null}
      {draft.status === 'applied' ? <p className="success-text">Applied to {targetLabel}.</p> : null}
      {draft.status === 'rejected' ? <p className="muted">Rejected. No board record was changed.</p> : null}
      {showAppliedOpenButton && draft.status === 'applied' && onOpenTarget ? (
        <div className="button-row">
          <Button onClick={onOpenTarget}>Open {targetLabel}</Button>
        </div>
      ) : null}
      {isActionable ? (
        <details className="draft-advanced">
          <summary>Advanced edit</summary>
          <Field label="Editable draft details">
            <textarea rows={6} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
          </Field>
          {payloadError ? <p className="error-text">{payloadError}</p> : null}
          <Button onClick={savePayload}>
            <Save size={16} aria-hidden="true" />
            Save Edit
          </Button>
        </details>
      ) : null}
      {isActionable ? (
        <div className="button-row">
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
  const { notify } = useToast();
  const [mode, setMode] = useState<CopilotMode>('quick');
  const [quickInput, setQuickInput] = useState('');
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceModeButtonRef = useRef<HTMLButtonElement | null>(null);
  const voiceSheetTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const lastSpeechErrorRef = useRef<string | undefined>(undefined);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const noTranscriptTimerRef = useRef<number | undefined>(undefined);
  const [isVoiceSheetOpen, setIsVoiceSheetOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceFallbackActive, setVoiceFallbackActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [parseSummary, setParseSummary] = useState('');
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('pending');
  const [activeDraftBatchId, setActiveDraftBatchId] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [lastChangedDraftId, setLastChangedDraftId] = useState('');
  const [askInput, setAskInput] = useState('');
  const [askResult, setAskResult] = useState<AskOsResult | null>(null);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingText, setBriefingText] = useState('');
  const [copied, setCopied] = useState(false);
  const smartSuggestions = useMemo(() => generateSmartSuggestions(data), [data]);
  const projectDraftActions = useMemo(
    () => getProjectDraftActions(data, data.activeProjectId),
    [data],
  );
  const draftCounts = useMemo(
    () => ({
      pending: projectDraftActions.filter((draft) => draft.status === 'pending').length,
      applied: projectDraftActions.filter((draft) => draft.status === 'applied').length,
      rejected: projectDraftActions.filter((draft) => draft.status === 'rejected').length,
      failed: projectDraftActions.filter((draft) => draft.status === 'failed').length,
      all: projectDraftActions.length,
    }),
    [projectDraftActions],
  );
  const selectedPendingBatchId = activeDraftBatchId;
  const currentCaptureDrafts = useMemo(() => {
    if (!selectedPendingBatchId) {
      return [];
    }

    return projectDraftActions.filter((draft) => captureBatchId(draft) === selectedPendingBatchId).slice(0, 20);
  }, [projectDraftActions, selectedPendingBatchId]);
  const currentCapturePendingDraftIds = useMemo(
    () => currentCaptureDrafts.filter((draft) => draft.status === 'pending').map((draft) => draft.id),
    [currentCaptureDrafts],
  );
  const olderDrafts = useMemo(
    () => projectDraftActions.filter((draft) => !selectedPendingBatchId || captureBatchId(draft) !== selectedPendingBatchId).slice(0, 10),
    [projectDraftActions, selectedPendingBatchId],
  );
  const visibleDrafts = useMemo(() => {
    if (draftFilter === 'all') {
      return olderDrafts;
    }
    const byStatus = olderDrafts.filter((draft) => draft.status === draftFilter);
    return byStatus.slice(0, 20);
  }, [draftFilter, olderDrafts]);
  const lastChangedDraft = useMemo(
    () => projectDraftActions.find((draft) => draft.id === lastChangedDraftId),
    [lastChangedDraftId, projectDraftActions],
  );
  const pendingMemory = getActiveProjectMemoryCandidates(data, 'pending');
  const quickInputReady = quickInput.trim().length > 0;
  const speechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const deviceCaptureContext = useMemo(
    () => {
      const navigatorWithStandalone =
        typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { standalone?: boolean });

      return {
        userAgent: navigatorWithStandalone?.userAgent ?? '',
        platform: navigatorWithStandalone?.platform ?? '',
        maxTouchPoints: navigatorWithStandalone?.maxTouchPoints ?? 0,
        standaloneApp:
          typeof window !== 'undefined' &&
          (window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone?.standalone === true),
      };
    },
    [],
  );
  const voiceGuidance = useMemo(
    () =>
      getVoiceCaptureGuidance({
        speechRecognitionAvailable: speechSupported,
        ...deviceCaptureContext,
      }),
    [deviceCaptureContext, speechSupported],
  );

  useEffect(() => {
    setActiveDraftBatchId('');
    setDraftNotice('');
    setLastChangedDraftId('');
  }, [data.activeProjectId]);
  const fallbackVoiceGuidance = useMemo(
    () =>
      getVoiceCaptureGuidance({
        speechRecognitionAvailable: false,
        ...deviceCaptureContext,
      }),
    [deviceCaptureContext],
  );
  const activeVoiceGuidance = voiceFallbackActive ? fallbackVoiceGuidance : voiceGuidance;
  const canUseBrowserSpeech = speechSupported && activeVoiceGuidance.mode === 'browserSpeech';
  const canAutoFocusCaptureText = useMemo(() => shouldAutoFocusCaptureText(deviceCaptureContext), [deviceCaptureContext]);
  const voiceDuration = formatVoiceDuration(voiceElapsedSeconds);
  const voiceTranscriptPreview = [quickInput.trim(), interimTranscript.trim()].filter(Boolean).join(' ');

  useEffect(() => {
    if (mode !== 'quick' || !canAutoFocusCaptureText) {
      return;
    }

    const id = window.setTimeout(() => quickInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [canAutoFocusCaptureText, mode]);

  useEffect(
    () => () => {
      keepListeningRef.current = false;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }
      if (noTranscriptTimerRef.current) {
        window.clearTimeout(noTranscriptTimerRef.current);
      }
      recognitionRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isVoiceSheetOpen || !isRecording) {
      return;
    }

    const id = window.setInterval(() => setVoiceElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording, isVoiceSheetOpen]);

  useEffect(() => {
    document.body.classList.toggle('voice-sheet-open', isVoiceSheetOpen);
    return () => document.body.classList.remove('voice-sheet-open');
  }, [isVoiceSheetOpen]);

  const clearNoTranscriptTimer = () => {
    if (noTranscriptTimerRef.current) {
      window.clearTimeout(noTranscriptTimerRef.current);
      noTranscriptTimerRef.current = undefined;
    }
  };

  const switchToDictationFallback = (message: string) => {
    keepListeningRef.current = false;
    clearNoTranscriptTimer();
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsRecording(false);
    setInterimTranscript('');
    setVoiceFallbackActive(true);
    setVoiceStatus(message);
  };

  const stopVoiceCapture = () => {
    keepListeningRef.current = false;
    clearNoTranscriptTimer();
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimTranscript('');
    setVoiceStatus('Stopped. Review the text, then create drafts or save the raw note.');
  };

  const focusFallbackDictation = () => {
    keepListeningRef.current = false;
    clearNoTranscriptTimer();
    setIsRecording(false);
    setInterimTranscript('');
    setVoiceFallbackActive(true);
    setVoiceStatus(activeVoiceGuidance.unavailableStatus);
    window.requestAnimationFrame(() => {
      const target = isVoiceSheetOpen ? voiceSheetTextareaRef.current : quickInputRef.current;
      target?.focus({ preventScroll: true });
    });
  };

  const startVoiceCapture = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceFallbackActive(true);
      setVoiceStatus(fallbackVoiceGuidance.unavailableStatus);
      return;
    }

    setVoiceFallbackActive(false);
    lastSpeechErrorRef.current = undefined;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }
    clearNoTranscriptTimer();
    if (recognitionRef.current) {
      keepListeningRef.current = false;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
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
        clearNoTranscriptTimer();
        setQuickInput((current) => [current.trim(), finalTranscript].filter(Boolean).join(current.trim() ? ' ' : ''));
      }
      if (interim) {
        clearNoTranscriptTimer();
      }
      setInterimTranscript(interim);
    };
    recognition.onerror = (event) => {
      lastSpeechErrorRef.current = event.error;
      if (isRestartableSpeechError(event.error) && keepListeningRef.current) {
        setVoiceStatus('Still listening. Pauses are okay.');
        return;
      }

      keepListeningRef.current = false;
      clearNoTranscriptTimer();
      setVoiceFallbackActive(true);
      setVoiceStatus(voiceErrorStatus(event.error, event.message));
      setIsRecording(false);
    };
    recognition.onend = () => {
      setInterimTranscript('');
      if (keepListeningRef.current && isRestartableSpeechError(lastSpeechErrorRef.current)) {
        restartTimerRef.current = window.setTimeout(() => {
          try {
            lastSpeechErrorRef.current = undefined;
            recognition.start();
            setIsRecording(true);
            setVoiceStatus('Still listening. Pauses are okay.');
          } catch {
            keepListeningRef.current = false;
            clearNoTranscriptTimer();
            setIsRecording(false);
            setVoiceFallbackActive(true);
            setVoiceStatus('Voice capture paused by the browser. Tap Use keyboard mic, then talk.');
          }
        }, 250);
        return;
      }

      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    keepListeningRef.current = true;
    setVoiceElapsedSeconds(0);
    noTranscriptTimerRef.current = window.setTimeout(() => {
      if (!keepListeningRef.current) {
        return;
      }

      switchToDictationFallback(
        fallbackVoiceGuidance.mode === 'keyboardDictation'
          ? 'No words came through from browser voice capture. Tap Use keyboard mic, then talk.'
          : 'No words came through from browser voice capture. Type into the note box or use system dictation.',
      );
    }, 7000);
    setVoiceStatus('Listening. Speak naturally; short pauses are okay.');
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      keepListeningRef.current = false;
      clearNoTranscriptTimer();
      setVoiceFallbackActive(true);
      setVoiceStatus('Voice capture could not start. Tap Use keyboard mic, then talk.');
    }
  };

  const openVoiceSheet = () => {
    setIsVoiceSheetOpen(true);
    setVoiceElapsedSeconds(0);
    setVoiceFallbackActive(false);
    setInterimTranscript('');
    setVoiceStatus('');
    if (voiceGuidance.mode === 'browserSpeech') {
      startVoiceCapture();
      return;
    }

    setVoiceStatus(voiceGuidance.unavailableStatus);
  };

  const closeVoiceSheet = () => {
    if (isRecording || keepListeningRef.current) {
      stopVoiceCapture();
    }
    setIsVoiceSheetOpen(false);
    setInterimTranscript('');
    if (quickInput.trim()) {
      setVoiceStatus('Voice note saved to the text box. Review it, then create drafts.');
    }
    window.requestAnimationFrame(() => voiceModeButtonRef.current?.focus({ preventScroll: true }));
  };

  const handleVoiceSheetKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeVoiceSheet();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])'),
    ).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const parseQuickCapture = async () => {
    if (!quickInputReady) {
      return;
    }

    const result = await agentProvider.parseQuickCapture(quickInput, data);
    const newMemoryCandidates = prepareMemoryCandidatesForActiveProject(data, result.memoryCandidates);
    const duplicateMemoryCount = result.memoryCandidates.length - newMemoryCandidates.length;
    const summaryParts: string[] = [];
    if (result.draftActions.length > 0) {
      summaryParts.push(
        `Found ${result.draftActions.length} draft change${result.draftActions.length === 1 ? '' : 's'}. Review below before the board changes.`,
      );
    }
    if (newMemoryCandidates.length > 0) {
      summaryParts.push(
        `Sent ${newMemoryCandidates.length} Memory suggestion${newMemoryCandidates.length === 1 ? '' : 's'} to Setup for approval.`,
      );
    }
    if (duplicateMemoryCount > 0) {
      summaryParts.push(
        `Ignored ${duplicateMemoryCount} Memory suggestion${duplicateMemoryCount === 1 ? '' : 's'} already saved or reviewed for this Turn.`,
      );
    }
    if (summaryParts.length === 0) {
      summaryParts.push('No board change or new Memory suggestion was detected.');
    }
    const parseSummaryMessage = summaryParts.join(' ');
    const reviewedResult = { ...result, memoryCandidates: newMemoryCandidates, summary: parseSummaryMessage };
    setParseSummary(parseSummaryMessage);
    setDraftNotice('');
    setLastChangedDraftId('');
    setDraftFilter('pending');
    const batchId = createId('capture_batch');
    if (result.draftActions.length > 0) {
      setActiveDraftBatchId(batchId);
    }
    setData((current) => {
      let next = addDraftActions(current, result.draftActions, quickInput, batchId);
      next = addMemoryCandidates(next, newMemoryCandidates);
      return addAgentRun(next, 'quick_capture', quickInput, reviewedResult);
    });
  };

  const afterDraftChange = (draft: DraftAction, status: DraftActionStatus) => {
    setLastChangedDraftId(draft.id);
    if (status === 'applied') {
      setDraftNotice(`Applied "${draft.title}" to ${draftTargetLabel(draft)}.`);
      return;
    }
    if (status === 'rejected') {
      setDraftNotice(`Rejected "${draft.title}". No board record changed.`);
      return;
    }
    if (status === 'failed') {
      setDraftNotice(`"${draft.title}" still needs review before it can update the board.`);
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
    const count = currentCapturePendingDraftIds.length;
    setData((current) => applyAllPendingDraftActions(current, currentCapturePendingDraftIds));
    setLastChangedDraftId('');
    setDraftNotice(`Applied ${count} current capture draft(s). Anything blocked still needs review.`);
  };

  const rejectPendingDrafts = () => {
    const count = currentCapturePendingDraftIds.length;
    setData((current) => rejectAllPendingDraftActions(current, currentCapturePendingDraftIds));
    setLastChangedDraftId('');
    setDraftNotice(`Rejected ${count} current capture draft(s). No board records changed.`);
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
      return addAgentRun(markMemoriesUsed(withConversation, result.usedMemoryIds ?? []), 'ask_os', askInput, result);
    });
  };

  const generateBriefing = async (type: BriefingType) => {
    const result = await agentProvider.generateBriefing(type, data);
    setBriefing(result);
    setBriefingText(result.body);
    setData((current) =>
      addAgentRun(
        markMemoriesUsed(current, result.usedMemoryIds ?? []),
        type === 'end_of_day' ? 'report' : 'briefing',
        type,
        result,
      ),
    );
  };

  const copyBriefing = async () => {
    try {
      await navigator.clipboard.writeText(briefingText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      notify('Copy failed. Press and hold the briefing text to select and copy it manually.', { tone: 'error' });
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

      {modeLabels.length > 1 ? (
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
      ) : null}

      {mode === 'quick' ? (
        <>
          <Section title="Field Capture" kicker="Draft-first">
            <div className="form-card copilot-card">
              <div className={`voice-memo voice-memo--${activeVoiceGuidance.mode} ${isRecording ? 'is-recording' : ''}`}>
                <button
                  ref={voiceModeButtonRef}
                  className="voice-record-button"
                  type="button"
                  onClick={openVoiceSheet}
                  aria-haspopup="dialog"
                  aria-expanded={isVoiceSheetOpen}
                  aria-describedby="voice-capture-guidance"
                >
                  <Mic size={18} aria-hidden="true" />
                  <span>{activeVoiceGuidance.idleButtonLabel}</span>
                </button>
                <div className="voice-meter" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div>
                  <strong>{activeVoiceGuidance.title}</strong>
                  <p id="voice-capture-guidance">{activeVoiceGuidance.description}</p>
                  <small>{activeVoiceGuidance.privacyNote}</small>
                </div>
              </div>
              {interimTranscript ? <p className="voice-interim">{interimTranscript}</p> : null}
              {voiceStatus ? (
                <p className={isRecording ? 'success-text' : 'muted'} role="status" aria-live="polite">
                  {voiceStatus}
                </p>
              ) : null}

              <Field label="Voice or messy note">
                <textarea
                  ref={quickInputRef}
                  enterKeyHint="done"
                  inputMode="text"
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
                  Review Changes
                </Button>
                <Button disabled={!quickInputReady} variant="ghost" onClick={() => setQuickInput('')}>
                  <RotateCcw size={18} aria-hidden="true" />
                  Clear
                </Button>
              </div>
              <details className="capture-more-actions">
                <summary>More options</summary>
                <Button disabled={!quickInputReady} onClick={saveRawNoteOnly}>
                  <Save size={18} aria-hidden="true" />
                  Save as note only
                </Button>
              </details>
              {parseSummary ? <p className="success-text">{parseSummary}</p> : null}
            </div>
          </Section>

          {isVoiceSheetOpen ? (
            <div className="voice-sheet-backdrop" role="presentation">
              <section
                className={`voice-sheet voice-sheet--${activeVoiceGuidance.mode} ${isRecording ? 'is-recording' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="voice-sheet-title"
                onKeyDown={handleVoiceSheetKeyDown}
              >
                <div className="voice-sheet__handle" aria-hidden="true" />
                <div className="voice-sheet__topline">
                  <div>
                    <span className="quiet-label">Voice capture</span>
                    <h2 id="voice-sheet-title">{canUseBrowserSpeech ? 'Listening mode' : 'Dictation mode'}</h2>
                  </div>
                  <button autoFocus className="icon-button" type="button" onClick={closeVoiceSheet} aria-label="Close voice mode">
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>

                <div className="voice-orb-wrap" aria-hidden="true">
                  <div className="voice-orb">
                    <Mic size={28} />
                  </div>
                  <span />
                  <span />
                </div>

                <div className="voice-session-meta">
                  <strong>{isRecording ? 'Recording' : canUseBrowserSpeech ? 'Ready' : 'Ready for keyboard mic'}</strong>
                  <span>{voiceDuration}</span>
                </div>

                <div className="voice-sheet-meter" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="voice-transcript-panel" aria-live="polite">
                  {canUseBrowserSpeech ? (
                    <p>{voiceTranscriptPreview || 'Transcript will appear here as your browser returns words.'}</p>
                  ) : (
                    <textarea
                      ref={voiceSheetTextareaRef}
                      rows={5}
                      value={quickInput}
                      onChange={(event) => setQuickInput(event.target.value)}
                      placeholder="Tap Use keyboard mic, then dictate: unit 204 paint done but cleaning blocked keys missing."
                      aria-label="Voice mode dictation text"
                    />
                  )}
                </div>

                {voiceStatus ? (
                  <p className={isRecording ? 'success-text' : 'muted'} role="status" aria-live="polite">
                    {voiceStatus}
                  </p>
                ) : null}

                <div className="voice-sheet-actions">
                  {canUseBrowserSpeech ? (
                    <Button variant={isRecording ? 'ghost' : 'primary'} onClick={isRecording ? stopVoiceCapture : startVoiceCapture}>
                      {isRecording ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
                      {isRecording ? 'Stop' : 'Record'}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={focusFallbackDictation}>
                      <Mic size={18} aria-hidden="true" />
                      {activeVoiceGuidance.sheetPrimaryAction}
                    </Button>
                  )}
                  <Button onClick={closeVoiceSheet}>
                    <Check size={18} aria-hidden="true" />
                    Done
                  </Button>
                </div>
                <small>{activeVoiceGuidance.privacyNote}</small>
              </section>
            </div>
          ) : null}

          <Section
            title="Review This Capture"
            kicker={currentCaptureDrafts.length > 0 ? `${currentCapturePendingDraftIds.length} need approval` : 'Nothing waiting'}
            action={
              currentCaptureDrafts.length > 1 ? (
                <div className="button-row">
                  <Button disabled={currentCapturePendingDraftIds.length === 0} onClick={applyPendingDrafts}>
                    Approve Shown
                  </Button>
                  <Button disabled={currentCapturePendingDraftIds.length === 0} variant="ghost" onClick={rejectPendingDrafts}>
                    Reject Shown
                  </Button>
                </div>
              ) : undefined
            }
          >
            {draftNotice ? (
              <div className="draft-result-banner" role="status">
                <p>{draftNotice}</p>
                {lastChangedDraft && canOpenDraftTarget(lastChangedDraft) ? (
                  <Button onClick={() => openDraftTarget(lastChangedDraft)}>Open {draftTargetLabel(lastChangedDraft)}</Button>
                ) : null}
              </div>
            ) : null}
            <p className="muted">Approve only what should update the board. Rejected drafts do not change units, issues, or logs.</p>
            <div className="draft-list">
              {currentCaptureDrafts.map((draft) => (
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
                  showAppliedOpenButton={draft.id !== lastChangedDraftId || !draftNotice}
                />
              ))}
              {currentCaptureDrafts.length === 0 ? (
                <p className="muted">Capture a note above, then review the changes here before anything updates.</p>
              ) : null}
            </div>

            {projectDraftActions.length > currentCaptureDrafts.length ? (
              <details className="draft-history">
                <summary>Older draft history ({projectDraftActions.length - currentCaptureDrafts.length})</summary>
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
                  {visibleDrafts.length === 0 ? (
                    <p className="muted">No {draftFilter === 'all' ? '' : `${draftFilter} `}older drafts in this view.</p>
                  ) : null}
                </div>
              </details>
            ) : null}
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
