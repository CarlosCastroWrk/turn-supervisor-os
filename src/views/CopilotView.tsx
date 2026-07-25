import {
  Bot,
  Camera,
  Check,
  ClipboardCopy,
  FileText,
  Gauge,
  Lightbulb,
  Mic,
  Paperclip,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { CaptureIntentPicker } from '../components/CaptureIntentPicker';
import { CaptureResultCard } from '../components/CaptureResultCard';
import { CaptureVoicePanel } from '../components/CaptureVoicePanel';
import { DraftActionCard } from '../components/DraftActionCard';
import { Button, CommittedTextarea, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { useToast } from '../components/toast-context';
import { StatusBadge } from '../components/StatusBadge';
import {
  addAgentRun,
  addAiUsageEvent,
  addCopilotConversation,
  addDraftActions,
  addMemoryCandidates,
  addPhotoNote,
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
import { aiUsageEventFromResult, formatAiUsd } from '../lib/ai/usage';
import { createId, localISODateFromDateTime, nowISO, todayISO } from '../lib/constants';
import { createEmptyDailyLog, findDailyLog } from '../lib/dailyLogs';
import {
  buildCaptureInput,
  inferSingleCaptureUnitId,
  isSupportedCaptureTextFile,
  type StagedCaptureAttachment,
  type StagedPhotoAttachment,
  type StagedTextAttachment,
} from '../lib/captureWorkspace';
import {
  captureSessionReducer,
  initialCaptureSessionState,
  type CaptureInputMethod,
  type CaptureResultReceipt,
} from '../lib/captureSession';
import { persistCaptureSnapshot } from '../lib/capturePersistence';
import { getActiveProjectMemoryCandidates, prepareMemoryCandidatesForActiveProject } from '../lib/memory';
import { preparePhotoFile } from '../lib/photoProcessing';
import { persistPhotoRecord } from '../lib/photoStorage';
import { getProjectDraftActions } from '../lib/projectScope';
import type { AppNavigate } from '../lib/routing';
import { persistAppDataNow, type AppDataSaveStatus } from '../lib/storage';
import type { TurnCommandSourceRequest } from '../lib/turnCommand';
import { appendVoiceTranscript, formatVoiceDuration, getVoiceCaptureGuidance, isRestartableSpeechError, shouldAutoFocusCaptureText, voiceErrorStatus } from '../lib/voiceCapture';
import type { AiUsageEvent, AppData, BriefingType, DraftAction, DraftActionStatus, MemoryCandidate, PhotoNote } from '../types';

interface CopilotViewProps {
  commandSourceRequest?: TurnCommandSourceRequest;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onCommandSourceAccepted?: (requestId: number) => void;
  onNavigate: AppNavigate;
  presentation?: 'page' | 'overlay';
  isOpen?: boolean;
  onClose?: () => void;
  onOpenBackup?: () => void;
  onRetrySave?: () => boolean;
  saveStatus?: AppDataSaveStatus;
}

export interface CopilotViewHandle {
  openDefaultCapture: () => void;
  openVoiceSource: () => void;
}

type CopilotMode = 'quick' | 'ask' | 'briefings' | 'memory';
type DraftFilter = 'pending' | 'applied' | 'rejected' | 'failed' | 'all';

const MAX_CAPTURE_TEXT_FILE_BYTES = 2_000_000;
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
  onstart: (() => void) | null;
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

function AiCallReceipt({ event }: { event: AiUsageEvent }) {
  const tierLabel = event.modelClass === 'fast' ? 'Fast' : event.modelClass === 'complex' ? 'Complex' : 'Override';

  return (
    <div className="ai-call-receipt" role="status">
      <Gauge size={16} aria-hidden="true" />
      <span>{tierLabel} · {event.model}</span>
      <strong>{formatAiUsd(event.estimatedCostUsd)} estimated</strong>
      <small>{event.inputTokens.toLocaleString()} in · {event.outputTokens.toLocaleString()} out</small>
    </div>
  );
}

export const CopilotView = forwardRef<CopilotViewHandle, CopilotViewProps>(function CopilotView({
  commandSourceRequest,
  data,
  setData,
  onCommandSourceAccepted,
  onNavigate,
  presentation = 'page',
  isOpen = true,
  onClose,
  onOpenBackup,
  onRetrySave,
  saveStatus,
}: CopilotViewProps, ref) {
  const { notify } = useToast();
  const [mode, setMode] = useState<CopilotMode>('quick');
  const [quickInput, setQuickInput] = useState('');
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const captureWorkspaceRef = useRef<HTMLElement | null>(null);
  const captureCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const captureAttachmentsRef = useRef<StagedCaptureAttachment[]>([]);
  const voiceModeButtonRef = useRef<HTMLButtonElement | null>(null);
  const voiceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const interimTranscriptRef = useRef('');
  const keepListeningRef = useRef(false);
  const lastSpeechErrorRef = useRef<string | undefined>(undefined);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const noTranscriptTimerRef = useRef<number | undefined>(undefined);
  const parseInFlightRef = useRef(false);
  const lastAcceptedCommandRequestIdRef = useRef<number | undefined>(undefined);
  const captureProjectIdRef = useRef(data.activeProjectId);
  const [captureSession, dispatchCaptureSession] = useReducer(captureSessionReducer, initialCaptureSessionState);
  const [pageVoiceOpen, setPageVoiceOpen] = useState(false);
  const [voiceSourceOpen, setVoiceSourceOpen] = useState(false);
  const [isStartingVoice, setIsStartingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceFallbackActive, setVoiceFallbackActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [isParsingCapture, setIsParsingCapture] = useState(false);
  const [parseSummary, setParseSummary] = useState('');
  const [lastAiUsage, setLastAiUsage] = useState<AiUsageEvent | null>(null);
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('pending');
  const [activeDraftBatchId, setActiveDraftBatchId] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [lastChangedDraftId, setLastChangedDraftId] = useState('');
  const [captureAttachments, setCaptureAttachments] = useState<StagedCaptureAttachment[]>([]);
  const [captureAttachmentError, setCaptureAttachmentError] = useState('');
  const [commandSourceNotice, setCommandSourceNotice] = useState('');
  const [isPreparingAttachment, setIsPreparingAttachment] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askResult, setAskResult] = useState<AskOsResult | null>(null);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingText, setBriefingText] = useState('');
  const [copied, setCopied] = useState(false);
  const sessionVoicePanelOpen = presentation === 'overlay'
    ? captureSession.step === 'input' && captureSession.inputMethod === 'voice'
    : pageVoiceOpen;
  const voicePanelOpen = voiceSourceOpen || sessionVoicePanelOpen;
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
  const activeProject = data.projects.find((project) => project.id === data.activeProjectId);
  const activeProjectUnits = useMemo(
    () => data.units.filter((unit) => unit.projectId === data.activeProjectId),
    [data.activeProjectId, data.units],
  );
  const textAttachments = useMemo(
    () =>
      captureAttachments
        .filter((attachment): attachment is StagedTextAttachment => attachment.kind === 'text')
        .map((attachment) => ({ name: attachment.name, content: attachment.content })),
    [captureAttachments],
  );
  const captureSourceInput = useMemo(
    () => buildCaptureInput(quickInput, textAttachments),
    [quickInput, textAttachments],
  );
  const quickInputReady = captureSourceInput.trim().length > 0;
  const captureInputReady = quickInputReady || captureAttachments.some((attachment) => attachment.kind === 'photo');
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
    setLastAiUsage(null);
  }, [data.activeProjectId]);

  useEffect(() => {
    if (captureSession.step === 'intent') {
      captureProjectIdRef.current = data.activeProjectId;
    }
  }, [captureSession.step, data.activeProjectId]);
  const fallbackVoiceGuidance = useMemo(
    () =>
      getVoiceCaptureGuidance({
        speechRecognitionAvailable: false,
        ...deviceCaptureContext,
      }),
    [deviceCaptureContext],
  );
  const activeVoiceGuidance = voiceFallbackActive ? fallbackVoiceGuidance : voiceGuidance;
  const browserSpeechAvailable = speechSupported && voiceGuidance.mode === 'browserSpeech';
  const canUseBrowserSpeech = browserSpeechAvailable && !voiceFallbackActive;
  const canAutoFocusCaptureText = useMemo(() => shouldAutoFocusCaptureText(deviceCaptureContext), [deviceCaptureContext]);
  const voiceDuration = formatVoiceDuration(voiceElapsedSeconds);
  useEffect(() => {
    if (presentation !== 'page' || mode !== 'quick' || !canAutoFocusCaptureText) {
      return;
    }

    const id = window.setTimeout(() => quickInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [canAutoFocusCaptureText, mode, presentation]);

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
    if (!voicePanelOpen || !isRecording) {
      return;
    }

    const id = window.setInterval(() => setVoiceElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording, voicePanelOpen]);

  useEffect(() => {
    captureAttachmentsRef.current = captureAttachments;
  }, [captureAttachments]);

  useEffect(() => {
    if (
      presentation !== 'overlay'
      || !isOpen
      || !commandSourceRequest
      || lastAcceptedCommandRequestIdRef.current === commandSourceRequest.id
    ) {
      return;
    }

    const sourceText = commandSourceRequest.sourceText.trim();
    const existingSource = quickInput.trim();
    const hasProtectedSession =
      captureSession.step === 'review'
      || captureSession.step === 'result'
      || captureAttachments.length > 0
      || (existingSource.length > 0 && existingSource !== sourceText);

    if (hasProtectedSession) {
      setCommandSourceNotice(
        'Your earlier in-memory Capture is still here. Finish it or start over first; the new wording remains in the command bar.',
      );
      return;
    }

    if (existingSource !== sourceText) {
      setQuickInput(sourceText);
    }
    setCommandSourceNotice('');
    lastAcceptedCommandRequestIdRef.current = commandSourceRequest.id;
    onCommandSourceAccepted?.(commandSourceRequest.id);
  }, [
    captureAttachments.length,
    captureSession.step,
    commandSourceRequest,
    isOpen,
    onCommandSourceAccepted,
    presentation,
    quickInput,
  ]);

  useEffect(
    () => () => {
      for (const attachment of captureAttachmentsRef.current) {
        if (attachment.kind === 'photo') {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (presentation !== 'overlay' || !isOpen) {
      return;
    }

    document.body.classList.add('capture-workspace-open');
    const focusTimer = window.setTimeout(() => captureCloseButtonRef.current?.focus({ preventScroll: true }), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.classList.remove('capture-workspace-open');
    };
  }, [isOpen, presentation]);

  const clearNoTranscriptTimer = () => {
    if (noTranscriptTimerRef.current) {
      window.clearTimeout(noTranscriptTimerRef.current);
      noTranscriptTimerRef.current = undefined;
    }
  };

  const setPendingInterimTranscript = (transcript: string) => {
    interimTranscriptRef.current = transcript;
    setInterimTranscript(transcript);
  };

  const preservePendingInterimTranscript = () => {
    const pendingTranscript = interimTranscriptRef.current;
    if (!pendingTranscript.trim()) {
      setPendingInterimTranscript('');
      return;
    }

    setQuickInput((current) => appendVoiceTranscript(current, pendingTranscript));
    setPendingInterimTranscript('');
  };

  const switchToDictationFallback = (message: string) => {
    keepListeningRef.current = false;
    clearNoTranscriptTimer();
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }
    lastSpeechErrorRef.current = 'fallback';
    preservePendingInterimTranscript();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsStartingVoice(false);
    setIsRecording(false);
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
    lastSpeechErrorRef.current = undefined;
    setIsStartingVoice(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      preservePendingInterimTranscript();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setVoiceStatus('Stopping. Preserving your captured wording…');
  };

  const focusFallbackDictation = () => {
    keepListeningRef.current = false;
    clearNoTranscriptTimer();
    preservePendingInterimTranscript();
    setIsStartingVoice(false);
    setIsRecording(false);
    setVoiceFallbackActive(true);
    setVoiceStatus(activeVoiceGuidance.unavailableStatus);
    window.requestAnimationFrame(() => {
      const target = voicePanelOpen ? voiceTextareaRef.current : quickInputRef.current;
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
      recognitionRef.current.onstart = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => {
      if (!keepListeningRef.current) {
        recognition.stop();
        return;
      }

      lastSpeechErrorRef.current = undefined;
      setIsStartingVoice(false);
      setIsRecording(true);
      setVoiceStatus('Listening. Speak naturally; short pauses are okay.');
      clearNoTranscriptTimer();
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
    };
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
        setQuickInput((current) => appendVoiceTranscript(current, finalTranscript));
      }
      if (interim) {
        clearNoTranscriptTimer();
      }
      setPendingInterimTranscript(interim);
    };
    recognition.onerror = (event) => {
      lastSpeechErrorRef.current = event.error;
      preservePendingInterimTranscript();
      if (isRestartableSpeechError(event.error) && keepListeningRef.current) {
        setVoiceStatus('Voice paused. Reconnecting…');
        setIsRecording(false);
        return;
      }

      keepListeningRef.current = false;
      clearNoTranscriptTimer();
      setIsStartingVoice(false);
      setVoiceFallbackActive(true);
      setVoiceStatus(voiceErrorStatus(event.error, event.message));
      setIsRecording(false);
    };
    recognition.onend = () => {
      preservePendingInterimTranscript();
      setIsStartingVoice(false);
      if (keepListeningRef.current && isRestartableSpeechError(lastSpeechErrorRef.current)) {
        setIsRecording(false);
        setVoiceStatus('Voice paused. Reconnecting…');
        restartTimerRef.current = window.setTimeout(() => {
          try {
            lastSpeechErrorRef.current = undefined;
            setIsStartingVoice(true);
            recognition.start();
          } catch {
            keepListeningRef.current = false;
            clearNoTranscriptTimer();
            setIsStartingVoice(false);
            setIsRecording(false);
            setVoiceFallbackActive(true);
            setVoiceStatus('Voice capture paused by the browser. Tap Use keyboard mic, then talk.');
          }
        }, 250);
        return;
      }

      setIsRecording(false);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      if (!lastSpeechErrorRef.current) {
        setVoiceStatus('Stopped. Your captured wording is preserved and editable.');
      }
    };
    recognitionRef.current = recognition;
    keepListeningRef.current = true;
    setIsStartingVoice(true);
    setVoiceElapsedSeconds(0);
    setVoiceStatus('Requesting microphone access. Waiting for the browser to start…');
    try {
      recognition.start();
    } catch {
      keepListeningRef.current = false;
      clearNoTranscriptTimer();
      recognitionRef.current = null;
      setIsStartingVoice(false);
      setVoiceFallbackActive(true);
      setVoiceStatus('Voice capture could not start. Tap Use keyboard mic, then talk.');
    }
  };

  const openDefaultCapture = () => {
    if (isRecording || keepListeningRef.current) {
      stopVoiceCapture();
    }
    setVoiceSourceOpen(false);
  };

  const openVoiceSource = () => {
    setVoiceSourceOpen(true);
    setVoiceElapsedSeconds(0);
    preservePendingInterimTranscript();
    setVoiceFallbackActive(false);

    if (browserSpeechAvailable) {
      startVoiceCapture();
      return;
    }

    setVoiceFallbackActive(true);
    setIsStartingVoice(false);
    setVoiceStatus(voiceGuidance.unavailableStatus);
  };

  useImperativeHandle(ref, () => ({
    openDefaultCapture,
    openVoiceSource,
  }));

  const openVoicePanel = () => {
    if (presentation === 'overlay') {
      dispatchCaptureSession({ type: 'SELECT_INPUT_METHOD', inputMethod: 'voice' });
    } else {
      setPageVoiceOpen(true);
    }
    setVoiceElapsedSeconds(0);
    setVoiceFallbackActive(false);
    setPendingInterimTranscript('');
    setVoiceStatus(voiceGuidance.mode === 'browserSpeech' ? 'Ready. Tap Record when you are prepared.' : voiceGuidance.unavailableStatus);
  };

  const closeVoicePanel = (restoreFocus = true) => {
    if (isRecording || keepListeningRef.current) {
      stopVoiceCapture();
    }
    if (presentation === 'overlay') {
      dispatchCaptureSession({ type: 'SELECT_INPUT_METHOD', inputMethod: 'text' });
    } else {
      setPageVoiceOpen(false);
    }
    setPendingInterimTranscript('');
    if (quickInput.trim()) {
      setVoiceStatus('Voice wording is in the editable text box. Review it before continuing.');
    }
    if (restoreFocus) {
      voiceModeButtonRef.current?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => voiceModeButtonRef.current?.focus({ preventScroll: true }));
    }
  };

  const switchVoiceToTyping = () => {
    closeVoicePanel(false);
    window.requestAnimationFrame(() => quickInputRef.current?.focus({ preventScroll: true }));
  };

  const stageCaptureFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setIsPreparingAttachment(true);
    setCaptureAttachmentError('');
    const preparedAttachments: StagedCaptureAttachment[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith('image/')) {
          const prepared = await preparePhotoFile(file);
          preparedAttachments.push({
            id: createId('capture_attachment'),
            kind: 'photo',
            name: file.name || 'Field photo',
            blob: prepared.blob,
            previewUrl: URL.createObjectURL(prepared.blob),
            originalBytes: prepared.originalBytes,
            compressedBytes: prepared.compressedBytes,
            targetUnitId: '',
          });
          continue;
        }

        if (!isSupportedCaptureTextFile(file.name, file.type)) {
          errors.push(`${file.name}: choose a photo, CSV, text, JSON, or email file.`);
          continue;
        }

        if (file.size > MAX_CAPTURE_TEXT_FILE_BYTES) {
          errors.push(`${file.name}: file is larger than 2 MB.`);
          continue;
        }

        const content = await file.text();
        if (!content.trim()) {
          errors.push(`${file.name}: file is empty.`);
          continue;
        }

        preparedAttachments.push({
          id: createId('capture_attachment'),
          kind: 'text',
          name: file.name || 'Attached note',
          content,
          byteSize: file.size,
        });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'attachment could not be prepared.'}`);
      }
    }

    if (preparedAttachments.length > 0) {
      setCaptureAttachments((current) => [...current, ...preparedAttachments]);
    }
    if (errors.length > 0) {
      setCaptureAttachmentError(errors.join(' '));
    }
    setIsPreparingAttachment(false);
  };

  const handleCaptureAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    await stageCaptureFiles(input.files);
    input.value = '';
  };

  const removeCaptureAttachment = (attachmentId: string) => {
    setCaptureAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment?.kind === 'photo') {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return current.filter((item) => item.id !== attachmentId);
    });
    setCaptureAttachmentError('');
  };

  const updateCapturePhotoTarget = (attachmentId: string, targetUnitId: string) => {
    setCaptureAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId && attachment.kind === 'photo'
          ? { ...attachment, targetUnitId }
          : attachment,
      ),
    );
  };

  const saveCapturePhotos = async (attachmentIds?: string[]) => {
    const requestedIds = attachmentIds ? new Set(attachmentIds) : undefined;
    const pendingPhotos = captureAttachmentsRef.current.filter(
      (attachment): attachment is StagedPhotoAttachment =>
        attachment.kind === 'photo' &&
        !attachment.savedPhotoId &&
        (!requestedIds || requestedIds.has(attachment.id)),
    );
    let workingData = data;
    let savedCount = 0;
    let failedCount = 0;
    const failureMessages: string[] = [];

    for (const attachment of pendingPhotos) {
      const unit = workingData.units.find(
        (item) => item.id === attachment.targetUnitId && item.projectId === workingData.activeProjectId,
      );
      if (!unit) {
        const message = `Choose a Unit for ${attachment.name} before saving it.`;
        failedCount += 1;
        failureMessages.push(message);
        setCaptureAttachments((current) => current.map((item) =>
          item.id === attachment.id && item.kind === 'photo'
            ? { ...item, saveState: 'failed', saveError: message }
            : item,
        ));
        continue;
      }

      setCaptureAttachments((current) => current.map((item) =>
        item.id === attachment.id && item.kind === 'photo'
          ? { ...item, saveState: 'saving', saveError: undefined }
          : item,
      ));

      const now = nowISO();
      const photo: PhotoNote = {
        id: createId('photo'),
        projectId: workingData.activeProjectId,
        unitId: unit.id,
        localImageAvailable: true,
        imageMimeType: attachment.blob.type,
        imageByteSize: attachment.blob.size,
        category: 'Problem',
        caption: (presentation === 'overlay' ? captureSession.immutableSourceText : quickInput).trim() || attachment.name,
        createdAt: now,
        updatedAt: now,
      };
      const result = await persistPhotoRecord(photo, attachment.blob, (savedPhoto) => {
        const next = addPhotoNote(workingData, savedPhoto);
        if (!persistAppDataNow(next)) {
          return false;
        }
        workingData = next;
        setData(next);
        return true;
      });

      if (result.status === 'saved') {
        savedCount += 1;
        setCaptureAttachments((current) => current.map((item) =>
          item.id === attachment.id && item.kind === 'photo'
            ? { ...item, savedPhotoId: photo.id, saveState: undefined, saveError: undefined }
            : item,
        ));
        continue;
      }

      failedCount += 1;
      const message = result.status === 'file_failed'
        ? `${attachment.name} was not saved because offline photo storage is unavailable.`
        : `${attachment.name} was not saved because its app record could not be stored.`;
      const detailedMessage = `${message} Retry or remove this photo; other Draft Actions can still be applied.${result.cleanupFailed ? ' A temporary unreferenced photo file may remain on this device.' : ''}`;
      failureMessages.push(detailedMessage);
      setCaptureAttachments((current) => current.map((item) =>
        item.id === attachment.id && item.kind === 'photo'
          ? { ...item, saveState: 'failed', saveError: detailedMessage }
          : item,
      ));
    }

    setCaptureAttachmentError(failureMessages.join(' '));
    return { failedCount, savedCount };
  };

  const saveCapturePhoto = async (attachmentId: string) => {
    const result = await saveCapturePhotos([attachmentId]);
    if (result.savedCount > 0) {
      const attachment = captureAttachmentsRef.current.find((item) => item.id === attachmentId);
      setDraftNotice(`Saved ${attachment?.name ?? 'photo'} offline with its app record.`);
    }
    return result.failedCount === 0;
  };

  const saveAllCapturePhotos = () => saveCapturePhotos();

  const clearCapture = () => {
    for (const attachment of captureAttachmentsRef.current) {
      if (attachment.kind === 'photo') {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
    setCaptureAttachments([]);
    setCaptureAttachmentError('');
    setQuickInput('');
    setParseSummary('');
    setLastAiUsage(null);
  };

  const finishDurableCapture = (nextData: AppData) => {
    dataRef.current = nextData;
    setData(nextData);
    setQuickInput('');
    setCaptureAttachments((current) => current.filter((attachment) => {
      const keep = attachment.kind === 'photo' && !attachment.savedPhotoId;
      if (attachment.kind === 'photo' && !keep) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return keep;
    }));
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const reportCaptureError = (kind: 'save_failed' | 'ambiguous_update' | 'processing_failed', headline: string, detail: string) => {
    if (presentation === 'overlay') {
      dispatchCaptureSession({ type: 'FAIL', error: { kind, headline, detail } });
    } else {
      notify(`${headline} ${detail}`, { tone: 'error' });
    }
  };

  const parseQuickCapture = async (): Promise<CaptureResultReceipt | undefined> => {
    if (!captureInputReady || parseInFlightRef.current) {
      return;
    }

    parseInFlightRef.current = true;
    setIsParsingCapture(true);
    if (presentation === 'page') {
      captureProjectIdRef.current = dataRef.current.activeProjectId;
    }
    const sourceText = presentation === 'overlay' ? captureSession.immutableSourceText : captureSourceInput.trim();
    const captureProjectId = captureProjectIdRef.current || dataRef.current.activeProjectId;
    let result: Awaited<ReturnType<typeof agentProvider.parseQuickCapture>>;
    try {
      result = await agentProvider.parseQuickCapture(sourceText, dataRef.current);
    } catch {
      reportCaptureError('processing_failed', 'Capture could not be reviewed', 'Your wording is still here. Retry when the device is ready.');
      return;
    } finally {
        parseInFlightRef.current = false;
        setIsParsingCapture(false);
    }

    const latest = dataRef.current;
    if (latest.activeProjectId !== captureProjectId) {
      reportCaptureError('processing_failed', 'The active Turn changed', 'No Draft Action was saved. Return to Input and confirm the intended Turn.');
      return;
    }

    const usageEvent = aiUsageEventFromResult(result, captureProjectId);
    setLastAiUsage(usageEvent);
    const newMemoryCandidates = prepareMemoryCandidatesForActiveProject(latest, result.memoryCandidates);
    const duplicateMemoryCount = result.memoryCandidates.length - newMemoryCandidates.length;
    const summaryParts: string[] = [];
    if (result.draftActions.length > 0) {
      summaryParts.push(
        `Created ${result.draftActions.length} pending Draft Action${result.draftActions.length === 1 ? '' : 's'}. Nothing was applied.`,
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
      summaryParts.push('No production Draft Action was detected.');
    }
    if (result.providerNotice) {
      summaryParts.push(result.providerNotice);
    }
    const parseSummaryMessage = summaryParts.join(' ');
    const reviewedResult = { ...result, memoryCandidates: newMemoryCandidates, summary: parseSummaryMessage };
    setParseSummary(parseSummaryMessage);
    setDraftNotice('');
    setLastChangedDraftId('');
    setDraftFilter('pending');
    const batchId = createId('capture_batch');
    if (result.draftActions.length === 0) {
      reportCaptureError(
        'ambiguous_update',
        'No clear UPDATE was found',
        'Nothing was saved or changed. Edit the wording, or explicitly save this as a personal NOTE.',
      );
      return;
    }

    const persisted = persistCaptureSnapshot(latest, (current) => {
      let next = addDraftActions(current, result.draftActions, sourceText, batchId);
      next = addMemoryCandidates(next, newMemoryCandidates);
      if (usageEvent) {
        next = addAiUsageEvent(next, usageEvent);
      }
      return addAgentRun(next, 'quick_capture', sourceText, reviewedResult);
    });

    if (!persisted.ok) {
      reportCaptureError(
        'save_failed',
        'Draft Actions were not saved',
        'Your wording and attachments are preserved. Retry, copy the raw wording, or open Data & backup.',
      );
      return;
    }

    setActiveDraftBatchId(batchId);
    finishDurableCapture(persisted.data);
    const inferredUnitId = inferSingleCaptureUnitId(result.draftActions, persisted.data.units, captureProjectId);
    if (inferredUnitId) {
      setCaptureAttachments((current) =>
        current.map((attachment) =>
          attachment.kind === 'photo' && !attachment.targetUnitId
            ? { ...attachment, targetUnitId: inferredUnitId }
            : attachment,
        ),
      );
    }

    return {
      destinationKind: result.draftActions.length === 1 ? 'draft_awaiting_approval' : 'review',
      headline: `Added to Review — ${result.draftActions.length} Draft Action${result.draftActions.length === 1 ? '' : 's'} awaiting approval`,
      detail: 'Saved as pending changes in Los’s personal app. Nothing was applied to a Unit, paper TurnBoard, inspection, client approval, or payroll.',
      sourceText,
    };
  };

  const finishVoiceCapture = () => {
    closeVoicePanel();
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

  const applyPendingDrafts = async () => {
    const photoResult = await saveAllCapturePhotos();
    const count = currentCapturePendingDraftIds.length;
    setData((current) => applyAllPendingDraftActions(current, currentCapturePendingDraftIds));
    setLastChangedDraftId('');
    setDraftNotice(
      `Applied ${count} current capture draft(s). Anything blocked still needs review.${photoResult.failedCount > 0 ? ` ${photoResult.failedCount} photo${photoResult.failedCount === 1 ? '' : 's'} remain unsaved and can be retried or removed.` : ''}`,
    );
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

  const persistRawNote = (sourceText: string): CaptureResultReceipt | undefined => {
    if (!sourceText.trim()) {
      return;
    }

    const latest = dataRef.current;
    if (latest.activeProjectId !== captureProjectIdRef.current) {
      reportCaptureError('processing_failed', 'The active Turn changed', 'No note was saved. Return to Input and confirm the intended Turn.');
      return;
    }

    const date = todayISO();
    const persisted = persistCaptureSnapshot(latest, (current) => {
      const existing =
        findDailyLog(current.dailyLogs, current.activeProjectId, date) ??
        createEmptyDailyLog(current.activeProjectId, date);
      return upsertDailyLog(current, {
        ...existing,
        middayUpdate: [existing.middayUpdate, `Raw Copilot note: ${sourceText.trim()}`].filter(Boolean).join('\n'),
      });
    });

    if (!persisted.ok) {
      reportCaptureError(
        'save_failed',
        'Personal note was not saved',
        'Your wording and attachments are preserved. Retry, copy the raw wording, or open Data & backup.',
      );
      return;
    }

    finishDurableCapture(persisted.data);
    setParseSummary(`Saved personal note to Daily Log for ${date}.`);
    return {
      destinationKind: 'daily_log',
      headline: `Saved to Daily Log for ${date}`,
      detail: 'Saved as a personal note only. No Unit status, official paper mark, approval, payroll record, or external message changed.',
      sourceText: sourceText.trim(),
      openTarget: { view: 'daily' },
    };
  };

  const saveRawNoteOnly = () => {
    captureProjectIdRef.current = dataRef.current.activeProjectId;
    return persistRawNote(captureSourceInput.trim());
  };

  const runAskOs = async (question: string): Promise<CaptureResultReceipt | undefined> => {
    if (!question.trim()) {
      return;
    }

    const captureProjectId = captureProjectIdRef.current || dataRef.current.activeProjectId;
    let result: AskOsResult;
    try {
      result = await agentProvider.askOs(question, dataRef.current);
    } catch {
      reportCaptureError('processing_failed', 'The question could not be answered', 'Your wording is preserved. Retry when the device is ready.');
      return;
    }

    const latest = dataRef.current;
    if (latest.activeProjectId !== captureProjectId) {
      reportCaptureError('processing_failed', 'The active Turn changed', 'The answer was not saved. Return to Input and confirm the intended Turn.');
      return;
    }

    const persisted = persistCaptureSnapshot(latest, (current) => {
      const withConversation = addCopilotConversation(
        current,
        question,
        result.conciseAnswer,
        result.supportingRecords,
        result.suggestedNextActions,
      );
      return addAgentRun(markMemoriesUsed(withConversation, result.usedMemoryIds ?? []), 'ask_os', question, result);
    });

    if (!persisted.ok) {
      reportCaptureError(
        'save_failed',
        'The answer receipt was not saved',
        'Your question is preserved. Retry, copy the raw wording, or open Data & backup.',
      );
      return;
    }

    setAskResult(result);
    finishDurableCapture(persisted.data);
    return {
      destinationKind: 'answer',
      headline: 'Read-only answer',
      detail: `${result.supportingRecords.length} supporting record${result.supportingRecords.length === 1 ? '' : 's'} referenced. No production record was changed.`,
      sourceText: question.trim(),
    };
  };

  const askOs = () => {
    captureProjectIdRef.current = dataRef.current.activeProjectId;
    return runAskOs(askInput);
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
        findDailyLog(current.dailyLogs, current.activeProjectId, todayISO()) ??
        createEmptyDailyLog(current.activeProjectId, todayISO());
      return upsertDailyLog(current, {
        ...existing,
        endOfDayReflection: [existing.endOfDayReflection, briefingText].filter(Boolean).join('\n\n'),
      });
    });
  };

  const handleCaptureWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isRecording || keepListeningRef.current) {
        stopVoiceCapture();
      }
      onClose?.();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), summary',
      ),
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

  const sessionSourceText = captureSourceInput.trim() || captureAttachments
    .map((attachment) => `[${attachment.kind === 'photo' ? 'Photo' : 'File'}: ${attachment.name}]`)
    .join(' ');

  const selectCaptureInputMethod = (inputMethod: CaptureInputMethod) => {
    dispatchCaptureSession({ type: 'SELECT_INPUT_METHOD', inputMethod });
    if (inputMethod === 'voice') {
      openVoicePanel();
    } else if (inputMethod === 'photo') {
      window.requestAnimationFrame(() => photoInputRef.current?.click());
    } else if (inputMethod === 'file') {
      window.requestAnimationFrame(() => attachmentInputRef.current?.click());
    } else {
      window.requestAnimationFrame(() => quickInputRef.current?.focus({ preventScroll: true }));
    }
  };

  const continueCaptureToReview = () => {
    captureProjectIdRef.current = dataRef.current.activeProjectId;
    dispatchCaptureSession({ type: 'CONTINUE_TO_REVIEW', sourceText: sessionSourceText });
  };

  const confirmCaptureReview = async () => {
    dispatchCaptureSession({ type: 'CLEAR_ERROR' });
    let receipt: CaptureResultReceipt | undefined;
    if (captureSession.intent === 'update') {
      receipt = await parseQuickCapture();
    } else if (captureSession.intent === 'note') {
      receipt = persistRawNote(captureSession.immutableSourceText);
    } else if (captureSession.intent === 'ask') {
      receipt = await runAskOs(captureSession.immutableSourceText);
    } else {
      return;
    }
    if (receipt) {
      dispatchCaptureSession({ type: 'COMPLETE', result: receipt });
    }
  };

  const saveAmbiguousCaptureAsNote = () => {
    const receipt = persistRawNote(captureSession.immutableSourceText);
    if (receipt) {
      dispatchCaptureSession({ type: 'COMPLETE', result: receipt });
    }
  };

  const retryCaptureReview = () => {
    onRetrySave?.();
    void confirmCaptureReview();
  };

  const copyCaptureSource = async () => {
    try {
      await navigator.clipboard.writeText(captureSession.immutableSourceText);
      notify('Raw wording copied.', { tone: 'success' });
    } catch {
      notify('Copy failed. Press and hold the raw wording to copy it manually.', { tone: 'error' });
    }
  };

  const openCaptureReceiptTarget = () => {
    const target = captureSession.result?.openTarget;
    if (!target) return;
    onNavigate(target.view, target.recordId);
  };

  const backCaptureStep = () => {
    if (isRecording || keepListeningRef.current) {
      stopVoiceCapture();
    }
    dispatchCaptureSession({ type: 'BACK' });
  };

  const startCaptureOver = () => {
    const hasMaterial = Boolean(quickInput.trim() || captureAttachments.length > 0);
    if (hasMaterial && !window.confirm('Discard this in-memory capture and start over?')) {
      return;
    }
    clearCapture();
    setAskResult(null);
    dispatchCaptureSession({ type: 'START_OVER' });
  };

  const closeCaptureWorkspace = () => {
    if (isRecording || keepListeningRef.current) {
      stopVoiceCapture();
    }
    onClose?.();
  };

  if (presentation === 'overlay') {
    if (!isOpen) {
      return null;
    }

    return (
      <div className="capture-workspace-backdrop" role="presentation">
        <section
          ref={captureWorkspaceRef}
          className="capture-workspace"
          role="dialog"
          aria-modal="true"
          aria-labelledby="capture-workspace-title"
          onKeyDown={handleCaptureWorkspaceKeyDown}
        >
          <header className="capture-workspace__header">
            <div className="capture-workspace__project">
              <strong>Field Copilot</strong>
              <span>{activeProject?.name || activeProject?.propertyName || 'Current Turn'} · {activeProject?.mode === 'real' ? 'Real Turn' : 'Demo'}</span>
            </div>
            <div className="capture-workspace__title">
              <Mic size={20} aria-hidden="true" />
              <h1 id="capture-workspace-title">Capture</h1>
            </div>
            <button
              ref={captureCloseButtonRef}
              className="icon-button"
              type="button"
              onClick={closeCaptureWorkspace}
              aria-label="Close Field Copilot"
              title="Close"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div className="capture-workspace__timeline" aria-live="polite">
            {commandSourceNotice ? (
              <p className="capture-command-source-notice" role="status">
                {commandSourceNotice}
              </p>
            ) : null}
            {voiceSourceOpen ? (
              <section className="capture-step capture-voice-source" aria-labelledby="voice-source-title">
                <div className="capture-step__heading">
                  <div>
                    <span className="quiet-label">Source only</span>
                    <h2 id="voice-source-title">Capture your exact wording</h2>
                  </div>
                </div>
                <p className="capture-voice-source__intro">
                  Stop, review, and edit the transcript. This step does not decide what your words mean or change any record.
                </p>
                <CaptureVoicePanel
                  guidance={activeVoiceGuidance}
                  canUseBrowserSpeech={canUseBrowserSpeech}
                  isStarting={isStartingVoice}
                  isRecording={isRecording}
                  duration={voiceDuration}
                  interimTranscript={interimTranscript}
                  input={quickInput}
                  onInputChange={setQuickInput}
                  inputRef={voiceTextareaRef}
                  status={voiceStatus}
                  dictationPlaceholder="Speak, use the keyboard mic, or type your field wording here."
                  onStart={startVoiceCapture}
                  onStop={stopVoiceCapture}
                  onFallback={focusFallbackDictation}
                  onType={focusFallbackDictation}
                />
                <p className="capture-safety-copy">
                  Closing Capture keeps this wording in memory. Nothing is interpreted, sent, approved, or applied.
                </p>
              </section>
            ) : null}

            {!voiceSourceOpen && captureSession.step === 'intent' ? (
              <CaptureIntentPicker onSelect={(intent) => dispatchCaptureSession({ type: 'SELECT_INTENT', intent })} />
            ) : null}

            {!voiceSourceOpen && captureSession.step === 'input' ? (
              <section className="capture-step" aria-labelledby="capture-input-title">
                <div className="capture-step__heading">
                  <div>
                    <span className="quiet-label">{captureSession.intent}</span>
                    <h2 id="capture-input-title">Choose how to capture</h2>
                  </div>
                  <Button variant="ghost" onClick={backCaptureStep}>Back</Button>
                </div>
                <div className="capture-input-methods" aria-label="Capture input method">
                  <button type="button" onClick={() => selectCaptureInputMethod('voice')} aria-pressed={captureSession.inputMethod === 'voice'}>
                    <Mic size={20} aria-hidden="true" /> Voice
                  </button>
                  <button type="button" onClick={() => selectCaptureInputMethod('text')} aria-pressed={captureSession.inputMethod === 'text'}>
                    <FileText size={20} aria-hidden="true" /> Type
                  </button>
                  {captureSession.intent !== 'ask' ? (
                    <button type="button" onClick={() => selectCaptureInputMethod('photo')} aria-pressed={captureSession.inputMethod === 'photo'}>
                      <Camera size={20} aria-hidden="true" /> Photo
                    </button>
                  ) : null}
                  <button type="button" onClick={() => selectCaptureInputMethod('file')} aria-pressed={captureSession.inputMethod === 'file'}>
                    <Paperclip size={20} aria-hidden="true" /> File
                  </button>
                </div>

                {voicePanelOpen ? (
                  <CaptureVoicePanel
                    guidance={activeVoiceGuidance}
                    canUseBrowserSpeech={canUseBrowserSpeech}
                    isStarting={isStartingVoice}
                    isRecording={isRecording}
                    duration={voiceDuration}
                    interimTranscript={interimTranscript}
                    input={quickInput}
                    onInputChange={setQuickInput}
                    inputRef={voiceTextareaRef}
                    status={voiceStatus}
                    dictationPlaceholder="Tap Use keyboard mic, then speak."
                    onDone={finishVoiceCapture}
                    onStart={startVoiceCapture}
                    onStop={stopVoiceCapture}
                    onFallback={focusFallbackDictation}
                    onType={switchVoiceToTyping}
                  />
                ) : null}

                {captureSession.inputMethod && captureSession.inputMethod !== 'voice' ? (
                  <div className="capture-input-editor">
                    <textarea
                      ref={quickInputRef}
                      rows={6}
                      value={quickInput}
                      onChange={(event) => setQuickInput(event.target.value)}
                      placeholder={captureSession.intent === 'ask' ? 'What do you need to know?' : 'Capture the exact field wording...'}
                      aria-label="Capture wording"
                    />
                  </div>
                ) : null}

                {captureAttachments.length > 0 ? (
                  <div className="capture-attachment-strip">
                    {captureAttachments.map((attachment) => (
                      <div className="capture-attachment-chip" key={attachment.id}>
                        {attachment.kind === 'photo' ? <img src={attachment.previewUrl} alt="" /> : <FileText size={18} aria-hidden="true" />}
                        <span>{attachment.name}</span>
                        <button type="button" onClick={() => removeCaptureAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {captureAttachmentError ? <p className="error-text" role="alert">{captureAttachmentError}</p> : null}
                <div className="capture-step__actions">
                  <Button disabled={!captureInputReady || isPreparingAttachment || isRecording} variant="primary" onClick={continueCaptureToReview}>
                    Continue to review
                  </Button>
                </div>
              </section>
            ) : null}

            {!voiceSourceOpen && captureSession.step === 'review' ? (
              <section className="capture-step" aria-labelledby="capture-review-title">
                <div className="capture-step__heading">
                  <div>
                    <span className="quiet-label">Review {captureSession.intent}</span>
                    <h2 id="capture-review-title">Confirm your exact wording</h2>
                  </div>
                </div>
                <article className="capture-source-card">
                  <div className="capture-source-card__header">
                    <span className="quiet-label">Raw source — unchanged</span>
                    <small>Not saved yet</small>
                  </div>
                  <div className="capture-source-card__body"><p>{captureSession.immutableSourceText}</p></div>
                </article>
                <div className="capture-proposed-effect">
                  <strong>
                    {captureSession.intent === 'update' ? 'Create Draft Actions for personal review'
                      : captureSession.intent === 'note' ? 'Save a personal note to today’s Daily Log'
                        : 'Run a read-only question over recorded information'}
                  </strong>
                  <p>{captureSession.intent === 'update' ? 'No draft will apply itself. This does not mark paper, inspection, client approval, or payroll.' : 'No official workflow or external message will change.'}</p>
                </div>
                {captureSession.error ? (
                  <CaptureResultCard
                    intent={captureSession.intent!}
                    sourceText={captureSession.immutableSourceText}
                    error={captureSession.error}
                    onRetry={captureSession.error.kind === 'ambiguous_update' ? undefined : retryCaptureReview}
                    onSaveAsNote={captureSession.error.kind === 'ambiguous_update' ? saveAmbiguousCaptureAsNote : undefined}
                    onCopySource={() => void copyCaptureSource()}
                    onOpenBackup={onOpenBackup}
                  />
                ) : null}
                {saveStatus?.state === 'failed' && !captureSession.error ? (
                  <p className="error-text" role="alert">This device also reports unsaved app changes. Confirm only after storage is available.</p>
                ) : null}
                <div className="capture-step__actions">
                  <Button variant="ghost" onClick={backCaptureStep}>Back</Button>
                  <Button disabled={isParsingCapture} variant="primary" onClick={() => void confirmCaptureReview()}>
                    {isParsingCapture ? 'Working…' : captureSession.intent === 'update' ? 'Create drafts' : captureSession.intent === 'note' ? 'Save note' : 'Ask'}
                  </Button>
                </div>
              </section>
            ) : null}

            {!voiceSourceOpen && captureSession.step === 'result' ? (
              <section className="capture-step" aria-labelledby="capture-result-title">
                <div className="capture-step__heading">
                  <div>
                    <span className="quiet-label">Result</span>
                    <h2 id="capture-result-title">
                      {captureSession.intent === 'update' ? 'Draft review ready' : captureSession.intent === 'note' ? 'Personal note saved' : 'Read-only answer'}
                    </h2>
                  </div>
                </div>
                {captureSession.result ? (
                  <CaptureResultCard
                    intent={captureSession.intent!}
                    sourceText={captureSession.immutableSourceText}
                    receipt={captureSession.result}
                    onOpenTarget={captureSession.result.openTarget ? openCaptureReceiptTarget : undefined}
                    onCopySource={() => void copyCaptureSource()}
                  />
                ) : null}
                {parseSummary ? <p className="success-text" role="status">{parseSummary}</p> : null}
                {lastAiUsage ? <AiCallReceipt event={lastAiUsage} /> : null}
                {captureSession.intent === 'ask' && askResult ? (
                  <article className="answer-card">
                    <h3>{askResult.conciseAnswer}</h3>
                    <span className="quiet-label">Supporting records</span>
                    <ul>{askResult.supportingRecords.map((record) => <li key={record}>{record}</li>)}</ul>
                  </article>
                ) : null}
                {captureSession.intent === 'update' && currentCaptureDrafts.length > 0 ? (
                  <div className="capture-review-list">
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
                        compact
                      />
                    ))}
                  </div>
                ) : null}
                {captureAttachments.some((attachment) => attachment.kind === 'photo') ? (
                  <div className="capture-review-list" aria-label="Photo review">
                    {captureAttachments
                      .filter((attachment): attachment is StagedPhotoAttachment => attachment.kind === 'photo')
                      .map((attachment) => {
                        const selectedUnit = activeProjectUnits.find((unit) => unit.id === attachment.targetUnitId);
                        return (
                          <article className={`capture-photo-review ${attachment.savedPhotoId ? 'is-saved' : ''} ${attachment.saveState === 'failed' ? 'is-failed' : ''}`} key={attachment.id}>
                            <img src={attachment.previewUrl} alt={attachment.name} />
                            <div className="capture-photo-review__body">
                              <span className="quiet-label">Personal photo</span>
                              <strong>{attachment.savedPhotoId ? `Saved to Unit ${selectedUnit?.unitNumber ?? ''}` : attachment.name}</strong>
                              {!attachment.savedPhotoId ? (
                                <label>
                                  <span>Save to Unit</span>
                                  <select
                                    disabled={attachment.saveState === 'saving'}
                                    value={attachment.targetUnitId}
                                    onChange={(event) => updateCapturePhotoTarget(attachment.id, event.target.value)}
                                  >
                                    <option value="">Choose Unit</option>
                                    {activeProjectUnits.map((unit) => <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>)}
                                  </select>
                                </label>
                              ) : null}
                              {attachment.saveError ? <p className="capture-photo-review__error">{attachment.saveError}</p> : null}
                            </div>
                            <div className="capture-photo-review__actions">
                              {attachment.savedPhotoId ? (
                                <Button onClick={() => onNavigate('unitDetail', attachment.targetUnitId)}>Open Unit</Button>
                              ) : (
                                <>
                                  <Button disabled={attachment.saveState === 'saving'} variant="primary" onClick={() => void saveCapturePhoto(attachment.id)}>
                                    {attachment.saveState === 'failed' ? <RotateCcw size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
                                    {attachment.saveState === 'saving' ? 'Saving…' : attachment.saveState === 'failed' ? 'Retry photo' : 'Save photo'}
                                  </Button>
                                  <Button disabled={attachment.saveState === 'saving'} variant="ghost" onClick={() => removeCaptureAttachment(attachment.id)}>Remove</Button>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                ) : null}
                <div className="capture-step__actions">
                  <Button variant="primary" onClick={startCaptureOver}>Capture another</Button>
                  <Button onClick={closeCaptureWorkspace}>Done</Button>
                </div>
              </section>
            ) : null}
          </div>

          <input ref={cameraInputRef} className="visually-hidden" hidden type="file" accept="image/*" capture="environment" onChange={handleCaptureAttachmentChange} tabIndex={-1} />
          <input ref={photoInputRef} className="visually-hidden" hidden type="file" accept="image/*" multiple onChange={handleCaptureAttachmentChange} tabIndex={-1} />
          <input ref={attachmentInputRef} className="visually-hidden" hidden type="file" accept="image/*,.csv,.txt,.json,.eml,text/csv,text/plain,application/json,message/rfc822" multiple onChange={handleCaptureAttachmentChange} tabIndex={-1} />
        </section>
      </div>
    );
  }

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
                  onClick={openVoicePanel}
                  aria-expanded={pageVoiceOpen}
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
                  disabled={isParsingCapture}
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="Unit 204 paint done but cleaning blocked because keys are missing. Jose crew moved from 203 to 205. Unit 312 has a sink leak."
                />
              </Field>
              <p className="muted">Drafts only. Nothing changes until approval.</p>
              <div className="button-row capture-actions">
                <Button disabled={!quickInputReady || isParsingCapture} variant="primary" onClick={parseQuickCapture}>
                  <Sparkles size={18} aria-hidden="true" />
                  {isParsingCapture ? 'Reviewing...' : 'Review Changes'}
                </Button>
                <Button disabled={!quickInputReady || isParsingCapture} variant="ghost" onClick={() => setQuickInput('')}>
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
              {lastAiUsage ? <AiCallReceipt event={lastAiUsage} /> : null}
            </div>
          </Section>

          {pageVoiceOpen ? (
            <CaptureVoicePanel
              guidance={activeVoiceGuidance}
              canUseBrowserSpeech={canUseBrowserSpeech}
              isStarting={isStartingVoice}
              isRecording={isRecording}
              duration={voiceDuration}
              interimTranscript={interimTranscript}
              input={quickInput}
              onInputChange={setQuickInput}
              inputRef={voiceTextareaRef}
              status={voiceStatus}
              dictationPlaceholder="Tap Use keyboard mic, then dictate: unit 204 paint done but cleaning blocked keys missing."
              onDone={finishVoiceCapture}
              onStart={startVoiceCapture}
              onStop={stopVoiceCapture}
              onFallback={focusFallbackDictation}
              onType={switchVoiceToTyping}
            />
          ) : null}

          <Section
            title="Review This Capture"
            kicker={currentCaptureDrafts.length > 0 ? `${currentCapturePendingDraftIds.length} need approval` : 'Nothing waiting'}
            action={
              currentCaptureDrafts.length > 1 ? (
                <div className="button-row">
                  <Button disabled={currentCapturePendingDraftIds.length === 0} onClick={applyPendingDrafts}>
                    Apply shown to my app
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
            <p className="muted">Apply only what should update your personal app. Rejected drafts do not change Units, Issues, or Daily Logs.</p>
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
                    <CommittedTextarea
                      draftKey={`memory:${memory.id}:content`}
                      rows={3}
                      value={memory.content}
                      onCommit={(content) => setData((current) => updateMemory(current, memory.id, { content }))}
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
});
