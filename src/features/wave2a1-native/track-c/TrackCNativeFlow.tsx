import {
  AlertTriangle,
  Camera,
  ChevronRight,
  ClipboardPaste,
  FileText,
  FolderUp,
  Image,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import type { ActivityLog, AppData } from '../../../types';
import {
  TRACK_C_COMPATIBILITY_PLUS_ACTIONS,
  type TrackCPlusActionAvailabilityMap,
} from '../../wave2a21-track-c/plusDisposition';
import { appendPersonalNoteActivity } from './personalActivity';
import {
  browserSessionDraftStorage,
  createBlankPersonalNoteSession,
  createPersonalNoteDraftStore,
  resumePersonalNoteSession,
  type NoteDraftStorage,
} from './noteDraft';
import { NativeSheet } from './NativeSheet';
import type {
  PersonalNoteSession,
  TrackCNativeFileAction,
  TrackCNativeFileSelection,
  TrackCPlusAction,
} from './types';
import './track-c.css';

type TrackCFlowScreen = 'menu' | 'note';

export interface TrackCNativeFlowProps {
  actionAvailability?: TrackCPlusActionAvailabilityMap;
  data: AppData;
  draftStorage?: NoteDraftStorage | null;
  initialUnitId?: string;
  initialScreen?: 'menu' | 'note';
  onDismiss: () => void;
  onExternalAction?: (action: Exclude<TrackCPlusAction, 'note' | TrackCNativeFileAction>) => void;
  onNativeFiles?: (selection: TrackCNativeFileSelection) => void;
  onSave: (nextData: AppData, activity: ActivityLog) => void;
  open: boolean;
}

interface PlusItem {
  action: TrackCPlusAction;
  description: string;
  icon: ReactNode;
  label: string;
}

const PLUS_ITEMS: readonly PlusItem[] = [
  {
    action: 'import-work',
    description: 'Joseph released more units — tap them on the grid',
    icon: <FolderUp aria-hidden="true" size={20} />,
    label: 'Quick Add Units',
  },
  {
    action: 'note',
    description: 'Save a note — find it later in Activity or Search',
    icon: <MessageSquare aria-hidden="true" size={20} />,
    label: 'Note',
  },
  {
    action: 'blocker',
    description: 'Locked out or blocked unit — record why',
    icon: <AlertTriangle aria-hidden="true" size={20} />,
    label: 'Blocked Unit',
  },
  {
    action: 'camera',
    description: 'Take a photo with the device camera',
    icon: <Camera aria-hidden="true" size={20} />,
    label: 'Camera',
  },
  {
    action: 'photos',
    description: 'Choose one or more photos',
    icon: <Image aria-hidden="true" size={20} />,
    label: 'Photos',
  },
  {
    action: 'files',
    description: 'Choose a file from the device',
    icon: <FileText aria-hidden="true" size={20} />,
    label: 'Files',
  },
  {
    action: 'paste-text',
    description: 'Open the existing text intake',
    icon: <ClipboardPaste aria-hidden="true" size={20} />,
    label: 'Paste Text',
  },
];

const nativeFileActions = new Set<TrackCPlusAction>(['camera', 'photos', 'files']);

const noteErrorCopy = {
  'empty-note': 'Type a note before saving.',
  'missing-project': 'The current project is unavailable. Nothing was saved.',
  'missing-unit': 'That Unit is no longer available in this project. Choose another Unit or remove the Unit context.',
} as const;

export function TrackCNativeFlow({
  actionAvailability,
  data,
  draftStorage,
  initialUnitId,
  initialScreen = 'menu',
  onDismiss,
  onExternalAction,
  onNativeFiles,
  onSave,
  open,
}: TrackCNativeFlowProps) {
  const [screen, setScreen] = useState<TrackCFlowScreen>('menu');
  const [note, setNote] = useState<PersonalNoteSession>(() =>
    createBlankPersonalNoteSession(initialUnitId),
  );
  const [hasResumeDraft, setHasResumeDraft] = useState(false);
  const [status, setStatus] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const dispositionFor = useCallback(
    (action: TrackCPlusAction) =>
      actionAvailability?.[action]
      ?? TRACK_C_COMPATIBILITY_PLUS_ACTIONS[action],
    [actionAvailability],
  );
  const actionIsAvailable = useCallback(
    (action: TrackCPlusAction) =>
      dispositionFor(action).availability === 'available',
    [dispositionFor],
  );

  const activeUnits = useMemo(
    () =>
      data.units
        .filter((unit) => unit.projectId === data.activeProjectId)
        .slice()
        .sort((left, right) =>
          left.unitNumber.localeCompare(right.unitNumber, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
    [data.activeProjectId, data.units],
  );

  const noteDraftStore = useMemo(
    () =>
      createPersonalNoteDraftStore(
        draftStorage === undefined ? browserSessionDraftStorage() : draftStorage,
        data.activeProjectId,
      ),
    [data.activeProjectId, draftStorage],
  );

  const preserveNoteDraft = useCallback(() => {
    const savedDraft = noteDraftStore.save(note);
    const wordingRequiresDraft = Boolean(note.wording.trim());
    if (wordingRequiresDraft && !savedDraft) {
      setStatus(
        'Turn OS could not preserve this note draft. Keep this sheet open and copy the wording before leaving.',
      );
      return false;
    }
    setHasResumeDraft(noteDraftStore.hasDraft());
    return true;
  }, [note, noteDraftStore]);

  useEffect(() => {
    if (!open) return;
    setScreen(initialScreen);
    setNote(createBlankPersonalNoteSession(initialUnitId));
    setHasResumeDraft(noteDraftStore.hasDraft());
    setStatus('');
  }, [initialScreen, initialUnitId, noteDraftStore, open]);

  const dismiss = useCallback(() => {
    if (screen === 'note' && !preserveNoteDraft()) return;
    setScreen('menu');
    setStatus('');
    onDismiss();
  }, [onDismiss, preserveNoteDraft, screen]);

  const startNewNote = () => {
    setNote(createBlankPersonalNoteSession(initialUnitId));
    setStatus('');
    setScreen('note');
  };

  const resumeDraft = () => {
    const resumed = resumePersonalNoteSession(noteDraftStore);
    if (!resumed) {
      setHasResumeDraft(false);
      setStatus('That session draft is no longer available.');
      return;
    }
    setNote(resumed);
    setStatus('');
    setScreen('note');
  };

  const requestExternalAction = (
    action: Exclude<TrackCPlusAction, 'note' | TrackCNativeFileAction>,
  ) => {
    if (!onExternalAction) {
      setStatus(`${PLUS_ITEMS.find((item) => item.action === action)?.label ?? 'This action'} is not connected by the host yet.`);
      return;
    }
    onExternalAction(action);
    onDismiss();
  };

  const fileInputFor = (action: TrackCNativeFileAction) => {
    if (action === 'camera') return cameraInputRef.current;
    if (action === 'photos') return photosInputRef.current;
    return filesInputRef.current;
  };

  const selectPlusAction = (action: TrackCPlusAction) => {
    const disposition = dispositionFor(action);
    if (disposition.availability !== 'available') {
      setStatus(
        disposition.reason
        ?? `${PLUS_ITEMS.find((item) => item.action === action)?.label ?? 'This action'} is unavailable.`,
      );
      return;
    }
    if (action === 'note') {
      startNewNote();
      return;
    }
    if (nativeFileActions.has(action)) {
      fileInputFor(action as TrackCNativeFileAction)?.click();
      return;
    }
    requestExternalAction(action as Exclude<TrackCPlusAction, 'note' | TrackCNativeFileAction>);
  };

  const selectedNativeFiles = (
    kind: TrackCNativeFileAction,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    if (!onNativeFiles) {
      setStatus('The device picker worked, but this host has not connected file intake yet.');
      return;
    }
    onNativeFiles({ files, kind });
    onDismiss();
  };

  const saveNote = () => {
    const result = appendPersonalNoteActivity(data, {
      wording: note.wording,
      ...(note.unitId ? { unitId: note.unitId } : {}),
    });
    if (!result.ok) {
      setStatus(noteErrorCopy[result.error]);
      return;
    }
    noteDraftStore.clear();
    setHasResumeDraft(false);
    onSave(result.data, result.activity);
    onDismiss();
  };

  if (!open) return null;

  return (
    <NativeSheet
      description={
        screen === 'note'
          ? 'Personal Activity only. No paper, approval, payroll, or official status changes.'
          : 'Record something quickly. Paper remains the official TurnBoard.'
      }
      initialFocusRef={screen === 'note' ? textareaRef : undefined}
      onDismiss={dismiss}
      title={screen === 'note' ? 'New Note' : 'Add to Turn OS'}
    >
      {screen === 'menu' ? (
        <>
          {hasResumeDraft ? (
            <button
              className="tc-resume"
              data-track-c-critical-target="true"
              onClick={resumeDraft}
              type="button"
            >
              <span className="tc-option__icon"><RotateCcw aria-hidden="true" size={19} /></span>
              <span>
                <strong>Resume Note Draft</strong>
                <small>Continue the explicitly saved session draft</small>
              </span>
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          ) : null}

          <div className="tc-option-list" aria-label="Add options">
            {PLUS_ITEMS.map((item) => {
              const disposition = dispositionFor(item.action);
              if (disposition.availability === 'hidden') return null;
              const unavailable = disposition.availability === 'unavailable';
              return (
                <button
                  className={unavailable ? 'is-unavailable' : undefined}
                  data-action-availability={disposition.availability}
                  data-track-c-critical-target="true"
                  disabled={unavailable}
                  key={item.action}
                  onClick={() => selectPlusAction(item.action)}
                  type="button"
                >
                  <span className="tc-option__icon">{item.icon}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {unavailable
                        ? disposition.reason ?? 'Unavailable in this candidate.'
                        : item.description}
                    </small>
                  </span>
                  {unavailable ? (
                    <span className="tc-option__availability">Unavailable</span>
                  ) : (
                    <ChevronRight aria-hidden="true" size={18} />
                  )}
                </button>
              );
            })}
          </div>

          {actionIsAvailable('camera') ? (
            <input
              accept="image/*"
              aria-hidden="true"
              capture="environment"
              className="tc-native-input"
              data-track-c-file-input="camera"
              onChange={(event) => selectedNativeFiles('camera', event)}
              ref={cameraInputRef}
              tabIndex={-1}
              type="file"
            />
          ) : null}
          {actionIsAvailable('photos') ? (
            <input
              accept="image/*"
              aria-hidden="true"
              className="tc-native-input"
              data-track-c-file-input="photos"
              multiple
              onChange={(event) => selectedNativeFiles('photos', event)}
              ref={photosInputRef}
              tabIndex={-1}
              type="file"
            />
          ) : null}
          {actionIsAvailable('files') ? (
            <input
              accept="image/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx"
              aria-hidden="true"
              className="tc-native-input"
              data-track-c-file-input="files"
              onChange={(event) => selectedNativeFiles('files', event)}
              ref={filesInputRef}
              tabIndex={-1}
              type="file"
            />
          ) : null}
        </>
      ) : (
        <div className="tc-note-form">
          <label htmlFor="tc-personal-note">
            <span>Note</span>
            <textarea
              id="tc-personal-note"
              onChange={(event) => {
                setNote((current) => ({ ...current, wording: event.target.value }));
                setStatus('');
              }}
              placeholder="What do you need to remember?"
              ref={textareaRef}
              rows={5}
              value={note.wording}
            />
          </label>

          <label htmlFor="tc-personal-note-unit">
            <span>Optional Unit context</span>
            <select
              id="tc-personal-note-unit"
              onChange={(event) => {
                const unitId = event.target.value || undefined;
                setNote((current) => ({ ...current, unitId }));
                setStatus('');
              }}
              value={note.unitId ?? ''}
            >
              <option value="">No Unit — project Activity</option>
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}
                </option>
              ))}
            </select>
          </label>

          <p className="tc-safety-copy">
            <ShieldCheck aria-hidden="true" size={17} />
            This saves exact wording to personal Activity only.
          </p>

          <div className="tc-note-actions">
            <button
              className="tc-secondary-button"
              data-track-c-critical-target="true"
              onClick={() => {
                if (!preserveNoteDraft()) return;
                setScreen('menu');
                setStatus('');
              }}
              type="button"
            >
              Back
            </button>
            <button
              className="tc-primary-button"
              data-track-c-critical-target="true"
              disabled={!note.wording.trim()}
              onClick={saveNote}
              type="button"
            >
              Save Note
            </button>
          </div>
        </div>
      )}
      {status ? <p className="tc-status" role="status">{status}</p> : null}
    </NativeSheet>
  );
}
