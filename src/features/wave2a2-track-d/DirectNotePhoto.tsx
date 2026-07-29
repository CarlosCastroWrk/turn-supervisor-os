import {
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  isTrackDSaveReceipt,
  type TrackDNoteRequest,
  type TrackDPhotoRequest,
  type TrackDSaveReceipt,
} from './model';
import {
  TrackDPage,
  TrackDReceipt,
  TrackDSection,
} from './TrackDPrimitives';

export interface TrackDUnitOption {
  id: string;
  unitNumber: string;
}

export interface TrackDResumableNote {
  id: string;
  unitId?: string;
  wording: string;
}

export interface DirectNoteFlowProps {
  initialUnitId?: string;
  onBack?: () => void;
  /** Resolve only after the exact request is durably saved. */
  onSave: (
    request: TrackDNoteRequest,
  ) => Promise<TrackDSaveReceipt> | TrackDSaveReceipt;
  onUndo: (recordId: string) => Promise<void> | void;
  onView: (recordId: string) => void;
  resumableNote?: TrackDResumableNote;
  units: readonly TrackDUnitOption[];
}

export function DirectNoteFlow({
  initialUnitId,
  onBack,
  onSave,
  onUndo,
  onView,
  resumableNote,
  units,
}: DirectNoteFlowProps) {
  const [wording, setWording] = useState('');
  const [unitId, setUnitId] = useState(initialUnitId ?? '');
  const [receipt, setReceipt] = useState<TrackDSaveReceipt | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const revisionRef = useRef(0);
  const saveAttemptRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveAttemptRef.current += 1;
    };
  }, []);

  const markEdited = () => {
    revisionRef.current += 1;
    setReceipt(null);
  };

  const startNew = () => {
    markEdited();
    setWording('');
    setUnitId(initialUnitId ?? '');
    setStatus('');
    textareaRef.current?.focus();
  };

  const resume = () => {
    if (!resumableNote) return;
    markEdited();
    setWording(resumableNote.wording);
    setUnitId(resumableNote.unitId ?? '');
    setStatus('Unsaved note restored. Review it before saving.');
    textareaRef.current?.focus();
  };

  const save = async () => {
    if (saveInFlightRef.current) return;
    if (!wording.trim()) {
      setStatus('Type a note before saving.');
      return;
    }
    const revision = revisionRef.current;
    const request: TrackDNoteRequest = {
      wording,
      ...(unitId ? { unitId } : {}),
      recordedAt: new Date().toISOString(),
    };
    saveInFlightRef.current = true;
    const attempt = saveAttemptRef.current + 1;
    saveAttemptRef.current = attempt;
    setSaving(true);
    setReceipt(null);
    setStatus('');
    try {
      const nextReceipt = await onSave(request);
      if (!isTrackDSaveReceipt(nextReceipt)) {
        throw new Error('Note host did not return a complete save receipt.');
      }
      if (!mountedRef.current || saveAttemptRef.current !== attempt) return;
      setReceipt(nextReceipt);
      if (revisionRef.current === revision) {
        revisionRef.current += 1;
        setWording('');
        setStatus('');
      } else {
        setStatus(
          'The earlier note was saved. Newer wording or Unit context remains unsaved.',
        );
      }
    } catch {
      if (mountedRef.current && saveAttemptRef.current === attempt) {
        setStatus(
          'Note was not saved. Your current wording and Unit context remain available to retry.',
        );
      }
    } finally {
      if (saveAttemptRef.current === attempt) {
        saveInFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    }
  };

  const undo = async (recordId: string) => {
    try {
      await onUndo(recordId);
      setReceipt(null);
      setStatus('Saved note was undone.');
    } catch {
      setStatus('Undo failed. Open the note to review its current state.');
    }
  };

  return (
    <TrackDPage
      description="A personal observation saved exactly as written."
      onBack={onBack}
      statusLabel="Saving a note does not change work status"
      title="New Note"
    >
      {resumableNote ? (
        <section className="w2a2d-resume-card" aria-label="Unsaved note available">
          <div>
            <strong>Unsaved note available</strong>
            <p>Resume it only if you want to replace this blank note.</p>
          </div>
          <button onClick={resume} type="button">
            <RotateCcw aria-hidden="true" size={18} />
            Resume
          </button>
        </section>
      ) : null}

      <TrackDSection
        footer="The host is responsible for durable local save and Activity linkage."
        label="Note"
      >
        <div className="w2a2d-form-stack">
          <label className="w2a2d-field">
            <span>Unit context (optional)</span>
            <select
              onChange={(event) => {
                markEdited();
                setUnitId(event.currentTarget.value);
              }}
              value={unitId}
            >
              <option value="">No Unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="w2a2d-field">
            <span>Note wording</span>
            <textarea
              autoFocus
              onChange={(event) => {
                markEdited();
                setWording(event.currentTarget.value);
              }}
              placeholder="Type the observation exactly as you want it saved"
              ref={textareaRef}
              rows={7}
              value={wording}
            />
          </label>
          <div className="w2a2d-button-row">
            <button className="w2a2d-secondary-button" onClick={startNew} type="button">
              Clear
            </button>
            <button
              className="w2a2d-primary-button"
              disabled={saving || !wording.trim()}
              onClick={() => void save()}
              type="button"
            >
              <Save aria-hidden="true" size={19} />
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </TrackDSection>

      {receipt ? (
        <TrackDReceipt
          onDismiss={() => setReceipt(null)}
          onUndo={(recordId) => void undo(recordId)}
          onView={onView}
          receipt={receipt}
        />
      ) : null}
      {status ? (
        <p aria-live="polite" className="w2a2d-inline-status" role="status">
          {status}
        </p>
      ) : null}
    </TrackDPage>
  );
}

export interface DirectPhotoFlowProps {
  initialFile?: File;
  initialUnitId?: string;
  onBack?: () => void;
  /** Resolve only after the exact file and context are durably saved. */
  onSave: (
    request: TrackDPhotoRequest,
  ) => Promise<TrackDSaveReceipt> | TrackDSaveReceipt;
  onUndo: (recordId: string) => Promise<void> | void;
  onView: (recordId: string) => void;
  permission: {
    canSave: boolean;
    canSelect: boolean;
    detail?: string;
    label: string;
  };
  propertyId?: string;
  units: readonly TrackDUnitOption[];
}

export function DirectPhotoFlow({
  initialFile,
  initialUnitId,
  onBack,
  onSave,
  onUndo,
  onView,
  permission,
  propertyId,
  units,
}: DirectPhotoFlowProps) {
  const [file, setFile] = useState<File | null>(() =>
    initialFile && isImageFile(initialFile) ? initialFile : null,
  );
  const [previewUrl, setPreviewUrl] = useState('');
  const [unitId, setUnitId] = useState(initialUnitId ?? '');
  const [trade, setTrade] = useState<'' | 'Paint' | 'Clean'>('');
  const [section, setSection] = useState('');
  const [caption, setCaption] = useState('');
  const [receipt, setReceipt] = useState<TrackDSaveReceipt | null>(null);
  const [status, setStatus] = useState(() => {
    if (!initialFile) return '';
    return isImageFile(initialFile)
      ? 'Photo selected by the opening action. Add optional context, then save.'
      : 'The opening action did not supply an image. Choose a photo instead.';
  });
  const [saving, setSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const revisionRef = useRef(0);
  const saveAttemptRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveAttemptRef.current += 1;
    };
  }, []);

  const markEdited = () => {
    revisionRef.current += 1;
    setReceipt(null);
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (!selected) return;
    if (!isImageFile(selected)) {
      setStatus('Choose an image file. Nothing was saved.');
      return;
    }
    markEdited();
    setFile(selected);
    setStatus('Photo selected. Add optional context, then save.');
  };

  const save = async () => {
    if (saveInFlightRef.current) return;
    if (!file) {
      setStatus('Take or choose a photo before saving.');
      return;
    }
    if (!permission.canSave) {
      setStatus(
        'Photo was not saved because storage permission is unavailable. The selected photo remains on this screen.',
      );
      return;
    }
    const revision = revisionRef.current;
    const request: TrackDPhotoRequest = {
      file,
      context: {
        ...(propertyId ? { propertyId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(trade ? { trade } : {}),
        ...(section.trim() ? { section: section.trim() } : {}),
        caption,
      },
      recordedAt: new Date().toISOString(),
    };
    saveInFlightRef.current = true;
    const attempt = saveAttemptRef.current + 1;
    saveAttemptRef.current = attempt;
    setSaving(true);
    setReceipt(null);
    setStatus('');
    try {
      const nextReceipt = await onSave(request);
      if (!isTrackDSaveReceipt(nextReceipt)) {
        throw new Error('Photo host did not return a complete save receipt.');
      }
      if (!mountedRef.current || saveAttemptRef.current !== attempt) return;
      setReceipt(nextReceipt);
      if (revisionRef.current === revision) {
        revisionRef.current += 1;
        setFile(null);
        setCaption('');
        setSection('');
        setStatus('');
      } else {
        setStatus(
          'The earlier photo was saved. The newer photo or context remains unsaved.',
        );
      }
    } catch {
      if (mountedRef.current && saveAttemptRef.current === attempt) {
        setStatus(
          'Photo was not saved. The selected photo and current context remain available to retry.',
        );
      }
    } finally {
      if (saveAttemptRef.current === attempt) {
        saveInFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    }
  };

  const undo = async (recordId: string) => {
    try {
      await onUndo(recordId);
      setReceipt(null);
      setStatus('Saved photo was undone.');
    } catch {
      setStatus('Undo failed. Open the photo to review its current state.');
    }
  };

  return (
    <TrackDPage
      description="Save a personal photo with optional field context."
      onBack={onBack}
      statusLabel={`Photo permission: ${permission.label?.trim() || 'Not recorded'}`}
      title="New Photo"
    >
      <TrackDSection
        footer="This flow does not upload photos to cloud AI or change operational status."
        label="Source"
      >
        <div className="w2a2d-photo-actions">
          <button
            className="w2a2d-source-choice"
            disabled={!permission.canSelect}
            onClick={() => cameraInputRef.current?.click()}
            type="button"
          >
            <Camera aria-hidden="true" size={22} />
            <span>
              <strong>Camera</strong>
              <small>Take a new photo</small>
            </span>
          </button>
          <button
            className="w2a2d-source-choice"
            disabled={!permission.canSelect}
            onClick={() => photosInputRef.current?.click()}
            type="button"
          >
            <ImageIcon aria-hidden="true" size={22} />
            <span>
              <strong>Photos</strong>
              <small>Choose from this device</small>
            </span>
          </button>
        </div>
        {!permission.canSelect || !permission.canSave ? (
          <p className="w2a2d-permission-copy">
            {permission.detail ||
              'Photo selection or storage is unavailable until permission is recorded.'}
          </p>
        ) : null}
      </TrackDSection>

      {file ? (
        <TrackDSection label="Preview">
          <div className="w2a2d-photo-preview">
            {previewUrl ? (
              <img alt="Selected field attachment preview" src={previewUrl} />
            ) : (
              <div className="w2a2d-photo-preview__pending" role="status">
                Preparing photo preview…
              </div>
            )}
            <p>
              <strong>{file.name}</strong>
              <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </p>
          </div>
          <div className="w2a2d-form-stack">
            <label className="w2a2d-field">
              <span>Unit (optional)</span>
              <select
                onChange={(event) => {
                  markEdited();
                  setUnitId(event.currentTarget.value);
                }}
                value={unitId}
              >
                <option value="">No Unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="w2a2d-field">
              <span>Trade (optional)</span>
              <select
                onChange={(event) => {
                  markEdited();
                  setTrade(
                    event.currentTarget.value as '' | 'Paint' | 'Clean',
                  );
                }}
                value={trade}
              >
                <option value="">No trade</option>
                <option value="Paint">Paint</option>
                <option value="Clean">Clean</option>
              </select>
            </label>
            <label className="w2a2d-field">
              <span>Section (optional)</span>
              <input
                onChange={(event) => {
                  markEdited();
                  setSection(event.currentTarget.value);
                }}
                placeholder="Common, A, B, C…"
                value={section}
              />
            </label>
            <label className="w2a2d-field">
              <span>Caption (optional)</span>
              <textarea
                onChange={(event) => {
                  markEdited();
                  setCaption(event.currentTarget.value);
                }}
                rows={3}
                value={caption}
              />
            </label>
            <button
              className="w2a2d-primary-button"
              disabled={saving || !permission.canSave}
              onClick={() => void save()}
              type="button"
            >
              <Save aria-hidden="true" size={19} />
              {saving ? 'Saving…' : 'Save photo'}
            </button>
          </div>
        </TrackDSection>
      ) : null}

      {receipt ? (
        <TrackDReceipt
          onDismiss={() => setReceipt(null)}
          onUndo={(recordId) => void undo(recordId)}
          onView={onView}
          receipt={receipt}
        />
      ) : null}
      {status ? (
        <p aria-live="polite" className="w2a2d-inline-status" role="status">
          {status}
        </p>
      ) : null}

      <input
        accept="image/*"
        capture="environment"
        hidden
        onChange={selectFile}
        ref={cameraInputRef}
        type="file"
      />
      <input
        accept="image/*"
        hidden
        onChange={selectFile}
        ref={photosInputRef}
        type="file"
      />
    </TrackDPage>
  );
}

const isImageFile = (file: File) => file.type.startsWith('image/');
