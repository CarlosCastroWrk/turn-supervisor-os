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
import { useEffect, useMemo, useRef, useState } from 'react';
import { DraftActionCard } from '../components/DraftActionCard';
import { Button, CommittedTextarea, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { useToast } from '../components/toast-context';
import { StatusBadge } from '../components/StatusBadge';
import { VoiceCaptureSheet } from '../components/VoiceCaptureSheet';
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
import { getActiveProjectMemoryCandidates, prepareMemoryCandidatesForActiveProject } from '../lib/memory';
import { preparePhotoFile } from '../lib/photoProcessing';
import { blobToDataUrl, putPhotoBlob } from '../lib/photoStorage';
import { getProjectDraftActions } from '../lib/projectScope';
import type { AppNavigate } from '../lib/routing';
import { formatVoiceDuration, getVoiceCaptureGuidance, isRestartableSpeechError, shouldAutoFocusCaptureText, voiceErrorStatus } from '../lib/voiceCapture';
import type { AiUsageEvent, AppData, BriefingType, DraftAction, DraftActionStatus, MemoryCandidate, PhotoNote } from '../types';

interface CopilotViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: AppNavigate;
  presentation?: 'page' | 'overlay';
  isOpen?: boolean;
  onClose?: () => void;
}

type CopilotMode = 'quick' | 'ask' | 'briefings' | 'memory';
type DraftFilter = 'pending' | 'applied' | 'rejected' | 'failed' | 'all';

const MAX_CAPTURE_TEXT_FILE_BYTES = 2_000_000;
const MAX_EMBEDDED_PHOTO_FALLBACK_BYTES = 450_000;

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

export function CopilotView({
  data,
  setData,
  onNavigate,
  presentation = 'page',
  isOpen = true,
  onClose,
}: CopilotViewProps) {
  const { notify } = useToast();
  const [mode, setMode] = useState<CopilotMode>('quick');
  const [quickInput, setQuickInput] = useState('');
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const captureWorkspaceRef = useRef<HTMLElement | null>(null);
  const captureCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const captureAttachmentsRef = useRef<StagedCaptureAttachment[]>([]);
  const voiceModeButtonRef = useRef<HTMLButtonElement | null>(null);
  const voiceSheetTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const lastSpeechErrorRef = useRef<string | undefined>(undefined);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const noTranscriptTimerRef = useRef<number | undefined>(undefined);
  const parseInFlightRef = useRef(false);
  const [isVoiceSheetOpen, setIsVoiceSheetOpen] = useState(false);
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
  const [isPreparingAttachment, setIsPreparingAttachment] = useState(false);
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
  const unsavedPhotoAttachments = captureAttachments.filter(
    (attachment): attachment is StagedPhotoAttachment => attachment.kind === 'photo' && !attachment.savedPhotoId,
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

  useEffect(() => {
    captureAttachmentsRef.current = captureAttachments;
  }, [captureAttachments]);

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
    voiceModeButtonRef.current?.focus({ preventScroll: true });
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

  const saveCapturePhoto = async (attachmentId: string) => {
    const attachment = captureAttachmentsRef.current.find(
      (item): item is StagedPhotoAttachment => item.id === attachmentId && item.kind === 'photo',
    );
    if (!attachment || attachment.savedPhotoId) {
      return true;
    }

    const unit = data.units.find(
      (item) => item.id === attachment.targetUnitId && item.projectId === data.activeProjectId,
    );
    if (!unit) {
      setCaptureAttachmentError(`Choose a Unit for ${attachment.name} before saving it.`);
      return false;
    }

    const now = nowISO();
    const photoId = createId('photo');
    let photo: PhotoNote = {
      id: photoId,
      projectId: data.activeProjectId,
      unitId: unit.id,
      localImageAvailable: true,
      imageMimeType: attachment.blob.type,
      imageByteSize: attachment.blob.size,
      category: 'Problem',
      caption: quickInput.trim() || attachment.name,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await putPhotoBlob(photoId, attachment.blob);
    } catch {
      if (attachment.blob.size > MAX_EMBEDDED_PHOTO_FALLBACK_BYTES) {
        setCaptureAttachmentError(
          `${attachment.name} could not be saved in durable photo storage. Keep it staged and try again.`,
        );
        return false;
      }

      photo = {
        ...photo,
        imageData: await blobToDataUrl(attachment.blob),
        localImageAvailable: false,
      };
    }

    setData((current) => addPhotoNote(current, photo));
    setCaptureAttachments((current) =>
      current.map((item) =>
        item.id === attachmentId && item.kind === 'photo' ? { ...item, savedPhotoId: photoId } : item,
      ),
    );
    setCaptureAttachmentError('');
    setDraftNotice(`Saved ${attachment.name} to Unit ${unit.unitNumber}.`);
    return true;
  };

  const saveAllCapturePhotos = async () => {
    const pendingPhotos = captureAttachmentsRef.current.filter(
      (attachment): attachment is StagedPhotoAttachment => attachment.kind === 'photo' && !attachment.savedPhotoId,
    );
    if (pendingPhotos.some((attachment) => !attachment.targetUnitId)) {
      setCaptureAttachmentError('Choose a Unit for every photo before approving this capture.');
      return false;
    }

    for (const attachment of pendingPhotos) {
      if (!(await saveCapturePhoto(attachment.id))) {
        return false;
      }
    }

    return true;
  };

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

  const parseQuickCapture = async () => {
    if (!captureInputReady || parseInFlightRef.current) {
      return;
    }

    parseInFlightRef.current = true;
    setIsParsingCapture(true);
    const captureProjectId = data.activeProjectId;
    const result = await agentProvider
      .parseQuickCapture(captureSourceInput, data)
      .finally(() => {
        parseInFlightRef.current = false;
        setIsParsingCapture(false);
      });
    const usageEvent = aiUsageEventFromResult(result, captureProjectId);
    setLastAiUsage(usageEvent);
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
    if (result.draftActions.length > 0) {
      setActiveDraftBatchId(batchId);
    }
    setData((current) => {
      let next = addDraftActions(current, result.draftActions, captureSourceInput, batchId);
      next = addMemoryCandidates(next, newMemoryCandidates);
      if (usageEvent) {
        next = addAiUsageEvent(next, usageEvent);
      }
      return addAgentRun(next, 'quick_capture', captureSourceInput, reviewedResult);
    });
    const inferredUnitId = inferSingleCaptureUnitId(result.draftActions, data.units, data.activeProjectId);
    if (inferredUnitId) {
      setCaptureAttachments((current) =>
        current.map((attachment) =>
          attachment.kind === 'photo' && !attachment.targetUnitId
            ? { ...attachment, targetUnitId: inferredUnitId }
            : attachment,
        ),
      );
    }
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
    if (!(await saveAllCapturePhotos())) {
      return;
    }
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
    if (!captureSourceInput.trim()) {
      return;
    }

    setData((current) => {
      const existing =
        findDailyLog(current.dailyLogs, current.activeProjectId, todayISO()) ??
        createEmptyDailyLog(current.activeProjectId, todayISO());
      return upsertDailyLog(current, {
        ...existing,
        middayUpdate: [existing.middayUpdate, `Raw Copilot note: ${captureSourceInput.trim()}`].filter(Boolean).join('\n'),
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
        findDailyLog(current.dailyLogs, current.activeProjectId, todayISO()) ??
        createEmptyDailyLog(current.activeProjectId, todayISO());
      return upsertDailyLog(current, {
        ...existing,
        endOfDayReflection: [existing.endOfDayReflection, briefingText].filter(Boolean).join('\n\n'),
      });
    });
  };

  const handleCaptureWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !isVoiceSheetOpen) {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab' || isVoiceSheetOpen) {
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

  const recentAppliedDrafts = projectDraftActions.filter((draft) => draft.status === 'applied').slice(0, 3);
  const captureReviewCount = currentCapturePendingDraftIds.length + unsavedPhotoAttachments.length;

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
              <strong>{activeProject?.name || activeProject?.propertyName || 'Current Turn'}</strong>
              <span>{activeProject?.mode === 'real' ? 'Real Turn' : 'Demo'} · Draft-first</span>
            </div>
            <div className="capture-workspace__title">
              <Sparkles size={20} aria-hidden="true" />
              <h1 id="capture-workspace-title">Field Copilot</h1>
            </div>
            <button
              ref={captureCloseButtonRef}
              className="icon-button"
              type="button"
              onClick={onClose}
              aria-label="Close Field Copilot"
              title="Close"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div className="capture-workspace__timeline" aria-live="polite">
            {!captureSourceInput && captureAttachments.length === 0 && currentCaptureDrafts.length === 0 ? (
              <div className="capture-empty-state">
                <div className="capture-empty-state__icon">
                  <Mic size={24} aria-hidden="true" />
                </div>
                <div>
                  <h2>Capture the field once</h2>
                  <p>Speak, type, take a photo, or attach a field note. You will review every change before it reaches the board.</p>
                </div>
              </div>
            ) : null}

            {captureSourceInput || captureAttachments.length > 0 ? (
              <article className="capture-thread-event capture-thread-event--user">
                <div className="capture-thread-event__marker">You</div>
                <div className="capture-message-bubble">
                  {captureAttachments.some((attachment) => attachment.kind === 'photo') ? (
                    <div className="capture-message-photos">
                      {captureAttachments
                        .filter((attachment): attachment is StagedPhotoAttachment => attachment.kind === 'photo')
                        .map((attachment) => (
                          <img key={attachment.id} src={attachment.previewUrl} alt={attachment.name} />
                        ))}
                    </div>
                  ) : null}
                  <p>{quickInput.trim() || 'Attached field material ready for review.'}</p>
                  {textAttachments.length > 0 ? (
                    <small>{textAttachments.length} text attachment{textAttachments.length === 1 ? '' : 's'} included</small>
                  ) : null}
                </div>
              </article>
            ) : null}

            {currentCaptureDrafts.length > 0 || captureAttachments.some((attachment) => attachment.kind === 'photo') ? (
              <article className="capture-thread-event capture-thread-event--assistant">
                <div className="capture-thread-event__marker capture-thread-event__marker--assistant">
                  <Sparkles size={17} aria-hidden="true" />
                </div>
                <div className="capture-review-panel">
                  <div className="capture-review-panel__header">
                    <div>
                      <span className="quiet-label">Review before applying</span>
                      <h2>
                        {captureReviewCount > 0
                          ? `${captureReviewCount} change${captureReviewCount === 1 ? '' : 's'} ready to review`
                          : 'Capture review complete'}
                      </h2>
                    </div>
                    {captureReviewCount > 1 ? (
                      <Button variant="primary" onClick={applyPendingDrafts}>
                        <Check size={17} aria-hidden="true" />
                        Approve shown
                      </Button>
                    ) : null}
                  </div>

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
                        showAppliedOpenButton={draft.id !== lastChangedDraftId || !draftNotice}
                        compact
                      />
                    ))}

                    {captureAttachments
                      .filter((attachment): attachment is StagedPhotoAttachment => attachment.kind === 'photo')
                      .map((attachment) => {
                        const selectedUnit = activeProjectUnits.find((unit) => unit.id === attachment.targetUnitId);
                        return (
                          <article className={`capture-photo-review ${attachment.savedPhotoId ? 'is-saved' : ''}`} key={attachment.id}>
                            <img src={attachment.previewUrl} alt={attachment.name} />
                            <div className="capture-photo-review__body">
                              <span className="quiet-label">Photo attachment</span>
                              <strong>{attachment.savedPhotoId ? `Saved to Unit ${selectedUnit?.unitNumber ?? ''}` : attachment.name}</strong>
                              {attachment.savedPhotoId ? (
                                <p>Stored offline and ready for Real Turn photo sync.</p>
                              ) : (
                                <label>
                                  <span>Save to Unit</span>
                                  <select
                                    value={attachment.targetUnitId}
                                    onChange={(event) => updateCapturePhotoTarget(attachment.id, event.target.value)}
                                  >
                                    <option value="">Choose Unit</option>
                                    {activeProjectUnits.map((unit) => (
                                      <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                            </div>
                            <div className="capture-photo-review__actions">
                              {attachment.savedPhotoId ? (
                                <Button onClick={() => onNavigate('unitDetail', attachment.targetUnitId)}>Open Unit</Button>
                              ) : (
                                <>
                                  <Button variant="primary" onClick={() => saveCapturePhoto(attachment.id)}>
                                    <Check size={17} aria-hidden="true" />
                                    Save photo
                                  </Button>
                                  <Button variant="ghost" onClick={() => removeCaptureAttachment(attachment.id)}>
                                    <X size={17} aria-hidden="true" />
                                    Remove
                                  </Button>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </div>
              </article>
            ) : null}

            {draftNotice ? (
              <article className="capture-applied-event" role="status">
                <Check size={20} aria-hidden="true" />
                <div>
                  <strong>{draftNotice}</strong>
                  <p>The board and activity history now reflect the approved change.</p>
                </div>
                {lastChangedDraft && canOpenDraftTarget(lastChangedDraft) ? (
                  <Button onClick={() => openDraftTarget(lastChangedDraft)}>Open {draftTargetLabel(lastChangedDraft)}</Button>
                ) : null}
              </article>
            ) : null}

            {!captureSourceInput && captureAttachments.length === 0 && recentAppliedDrafts.length > 0 ? (
              <div className="capture-recent-list">
                <span className="quiet-label">Recently applied</span>
                {recentAppliedDrafts.map((draft) => (
                  <button key={draft.id} type="button" onClick={() => canOpenDraftTarget(draft) && openDraftTarget(draft)}>
                    <Check size={17} aria-hidden="true" />
                    <span>
                      <strong>{draft.title}</strong>
                      <small>{draftTargetLabel(draft)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <footer className="capture-composer">
            {captureAttachments.length > 0 ? (
              <div className="capture-attachment-strip">
                {captureAttachments.map((attachment) => (
                  <div className="capture-attachment-chip" key={attachment.id}>
                    {attachment.kind === 'photo' ? (
                      <img src={attachment.previewUrl} alt="" />
                    ) : (
                      <FileText size={18} aria-hidden="true" />
                    )}
                    <span>{attachment.name}</span>
                    {!('savedPhotoId' in attachment) || !attachment.savedPhotoId ? (
                      <button
                        type="button"
                        disabled={isParsingCapture}
                        onClick={() => removeCaptureAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.name}`}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <textarea
              ref={quickInputRef}
              rows={2}
              disabled={isParsingCapture}
              value={quickInput}
              onChange={(event) => setQuickInput(event.target.value)}
              placeholder="Speak, type, add a photo, or attach a field note..."
              aria-label="Capture update"
            />

            <div className="capture-composer__toolbar">
              {isParsingCapture ? (
                <span className="visually-hidden" role="status" aria-live="polite">
                  Reviewing capture. No board changes have been applied.
                </span>
              ) : null}
              <div className="capture-composer__attachments">
                <button
                  type="button"
                  disabled={isParsingCapture}
                  onClick={() => cameraInputRef.current?.click()}
                  aria-label="Take a photo"
                  title="Take photo"
                >
                  <Camera size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={isParsingCapture}
                  onClick={() => attachmentInputRef.current?.click()}
                  aria-label="Add photo or file"
                  title="Add photo or file"
                >
                  <Paperclip size={20} aria-hidden="true" />
                </button>
                <button
                  ref={voiceModeButtonRef}
                  type="button"
                  disabled={isParsingCapture}
                  onClick={openVoiceSheet}
                  aria-label="Record a voice note"
                  title="Voice note"
                >
                  <Mic size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="capture-composer__actions">
                {(quickInput || captureAttachments.length > 0) ? (
                  <button
                    type="button"
                    disabled={isParsingCapture}
                    onClick={clearCapture}
                    aria-label="Clear capture"
                    title="Clear"
                  >
                    <Trash2 size={19} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  className="capture-send-button"
                  type="button"
                  disabled={!captureInputReady || isPreparingAttachment || isParsingCapture}
                  onClick={parseQuickCapture}
                  aria-label={isParsingCapture ? 'Reviewing captured changes' : 'Review captured changes'}
                  title={isParsingCapture ? 'Reviewing capture' : 'Review changes'}
                >
                  <Send size={20} aria-hidden="true" />
                </button>
              </div>
            </div>

            <input
              ref={cameraInputRef}
              className="visually-hidden"
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCaptureAttachmentChange}
              tabIndex={-1}
            />
            <input
              ref={attachmentInputRef}
              className="visually-hidden"
              hidden
              type="file"
              accept="image/*,.csv,.txt,.json,.eml,text/csv,text/plain,application/json,message/rfc822"
              multiple
              onChange={handleCaptureAttachmentChange}
              tabIndex={-1}
            />

            {isPreparingAttachment ? <p className="muted">Preparing attachment...</p> : null}
            {captureAttachmentError ? <p className="error-text" role="alert">{captureAttachmentError}</p> : null}
            {parseSummary ? <p className="success-text" role="status">{parseSummary}</p> : null}
            {lastAiUsage ? <AiCallReceipt event={lastAiUsage} /> : null}
            <small>Draft-first: nothing changes until you approve it.</small>
          </footer>

          {isVoiceSheetOpen ? (
            <VoiceCaptureSheet
              guidance={activeVoiceGuidance}
              canUseBrowserSpeech={canUseBrowserSpeech}
              isRecording={isRecording}
              duration={voiceDuration}
              transcriptPreview={voiceTranscriptPreview}
              input={quickInput}
              onInputChange={setQuickInput}
              inputRef={voiceSheetTextareaRef}
              status={voiceStatus}
              titleId="voice-sheet-title-overlay"
              dictationPlaceholder="Tap Use keyboard mic, then speak your field update."
              onClose={closeVoiceSheet}
              onStart={startVoiceCapture}
              onStop={stopVoiceCapture}
              onFallback={focusFallbackDictation}
              onKeyDown={handleVoiceSheetKeyDown}
            />
          ) : null}
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

          {isVoiceSheetOpen ? (
            <VoiceCaptureSheet
              guidance={activeVoiceGuidance}
              canUseBrowserSpeech={canUseBrowserSpeech}
              isRecording={isRecording}
              duration={voiceDuration}
              transcriptPreview={voiceTranscriptPreview}
              input={quickInput}
              onInputChange={setQuickInput}
              inputRef={voiceSheetTextareaRef}
              status={voiceStatus}
              titleId="voice-sheet-title"
              showOrb
              dictationPlaceholder="Tap Use keyboard mic, then dictate: unit 204 paint done but cleaning blocked keys missing."
              onClose={closeVoiceSheet}
              onStart={startVoiceCapture}
              onStop={stopVoiceCapture}
              onFallback={focusFallbackDictation}
              onKeyDown={handleVoiceSheetKeyDown}
            />
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
}
