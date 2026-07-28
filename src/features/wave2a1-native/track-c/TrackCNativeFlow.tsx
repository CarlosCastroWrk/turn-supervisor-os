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

interface TrackCNativeFlowProps {
  data: AppData;
  draftStorage?: NoteDraftStorage | null;
  initialUnitId?: string;
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
    action: 'note',
    description: 'Save a personal Activity note',
    icon: <MessageSquare aria-hidden="true" size={20} />,
    label: 'Note',
  },
  {
    action: 'blocker',
    description: 'Open the existing blocker flow',
    icon: <AlertTriangle aria-hidden="true" size={20} />,
    label: 'Blocker',
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
  {
    action: 'import-work',
    description: 'Open the existing work import',
    icon: <FolderUp aria-hidden="true" size={20} />,
    label: 'Import Work',
  },
];

const nativeFileActions = new Set<TrackCPlusAction>(['camera', 'photos', 'files']);

const noteErrorCopy = {
  'empty-note': 'Type a note before saving.',
  'missing-project': 'The current project is unavailable. Nothing was saved.',
  'missing-unit': 'That Unit is no longer available in this project. Choose another Unit or remove the Unit context.',
} as const;

export function TrackCNativeFlow({
  data,
  draftStorage,
  initialUnitId,
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

  useEffect(() => {
    if (!open) return;
    setScreen('menu');
    setNote(createBlankPersonalNoteSession(initialUnitId));
    setHasResumeDraft(noteDraftStore.hasDraft());
    setStatus('');
  }, [initialUnitId, noteDraftStore, open]);

  const dismiss = useCallback(() => {
    if (screen === 'note') {
      noteDraftStore.save(note);
      setHasResumeDraft(noteDraftStore.hasDraft());
    }
    setScreen('menu');
    setStatus('');
    onDismiss();
  }, [note, noteDraftStore, onDismiss, screen]);

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
          : 'Choose one direct action. Device media options use native pickers.'
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
            {PLUS_ITEMS.map((item) => (
              <button
                data-track-c-critical-target="true"
                key={item.action}
                onClick={() => selectPlusAction(item.action)}
                type="button"
              >
                <span className="tc-option__icon">{item.icon}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            ))}
          </div>

          <input
            accept="image/*"
            capture="environment"
            className="tc-native-input"
            data-track-c-file-input="camera"
            onChange={(event) => selectedNativeFiles('camera', event)}
            ref={cameraInputRef}
            type="file"
          />
          <input
            accept="image/*"
            className="tc-native-input"
            data-track-c-file-input="photos"
            multiple
            onChange={(event) => selectedNativeFiles('photos', event)}
            ref={photosInputRef}
            type="file"
          />
          <input
            accept="image/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx"
            className="tc-native-input"
            data-track-c-file-input="files"
            onChange={(event) => selectedNativeFiles('files', event)}
            ref={filesInputRef}
            type="file"
          />
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
                noteDraftStore.save(note);
                setHasResumeDraft(noteDraftStore.hasDraft());
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
