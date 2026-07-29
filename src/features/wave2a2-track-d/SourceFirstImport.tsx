import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Image as ImageIcon,
  Keyboard,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  canConfirmTrackDImport,
  createTrackDSourceBinding,
  createUnavailableExtractionDraft,
  isTrackDImportCommitReceipt,
  isTrackDImportDraftCurrent,
  parseTrackDImportText,
  prepareTrackDConfirmedImport,
  revalidateTrackDImportRows,
  trackDSourceBindingsMatch,
  type TrackDConfirmedImport,
  type TrackDImportCommitReceipt,
  type TrackDImportDraft,
  type TrackDImportKind,
  type TrackDImportProvenance,
  type TrackDImportRow,
  type TrackDImportSourceKind,
  type TrackDSourceReference,
} from './model';
import { TrackDPage } from './TrackDPrimitives';

interface SourceChoice {
  description: string;
  icon: ReactNode;
  id: TrackDImportSourceKind;
  label: string;
}

const SOURCE_CHOICES: readonly SourceChoice[] = [
  {
    id: 'camera',
    label: 'Take Photo',
    description: 'Attach a new source photo',
    icon: <Camera aria-hidden="true" size={22} />,
  },
  {
    id: 'photos',
    label: 'Choose Photos',
    description: 'Attach source photos from this device',
    icon: <ImageIcon aria-hidden="true" size={22} />,
  },
  {
    id: 'file',
    label: 'Choose File',
    description: 'Use CSV or text; keep PDF as source only',
    icon: <FileText aria-hidden="true" size={22} />,
  },
  {
    id: 'paste',
    label: 'Paste Text',
    description: 'Parse copied rows deterministically',
    icon: <ClipboardPaste aria-hidden="true" size={22} />,
  },
  {
    id: 'manual',
    label: 'Enter Manually',
    description: 'Use only when no source can be attached',
    icon: <Keyboard aria-hidden="true" size={22} />,
  },
] as const;

const createSourceId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `track-d-source-${Date.now()}`;

const createSourceReference = (
  kind: TrackDImportSourceKind,
  name: string,
  file?: File,
): TrackDSourceReference => ({
  id: createSourceId(),
  kind,
  name,
  ...(file?.type ? { mimeType: file.type } : {}),
  ...(file ? { byteSize: file.size } : {}),
  capturedAt: new Date().toISOString(),
});

const isTextSource = (file: File) =>
  file.type === 'text/csv' ||
  file.type === 'text/plain' ||
  /\.(csv|txt)$/i.test(file.name);

const importKindCopy: Record<
  TrackDImportKind,
  { label: string; description: string }
> = {
  'property-roster': {
    label: 'Property roster',
    description: 'Reference inventory only. This does not release work.',
  },
  'daily-release': {
    label: 'Daily release',
    description:
      'Personal intake of today’s source. Confirmation does not assign a crew.',
  },
};

export interface SourceFirstImportProps {
  attachmentPermission: {
    canAttach: boolean;
    detail?: string;
    label: string;
  };
  existingUnitNumbers?: readonly string[];
  initialKind?: TrackDImportKind;
  onBack?: () => void;
  /**
   * The host must commit the complete prepared import atomically or reject
   * without leaving partial operational records.
   */
  onConfirm: (
    confirmed: TrackDConfirmedImport,
  ) => Promise<TrackDImportCommitReceipt> | TrackDImportCommitReceipt;
  parseSource?: typeof parseTrackDImportText;
}

export function SourceFirstImport({
  attachmentPermission,
  existingUnitNumbers = [],
  initialKind = 'property-roster',
  onBack,
  onConfirm,
  parseSource = parseTrackDImportText,
}: SourceFirstImportProps) {
  const [kind, setKind] = useState<TrackDImportKind>(initialKind);
  const [draft, setDraft] = useState<TrackDImportDraft | null>(null);
  const [provenance, setProvenance] =
    useState<TrackDImportProvenance | null>(null);
  const [textMode, setTextMode] = useState<'paste' | 'manual' | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const confirmationInFlightRef = useRef(false);
  const confirmationAttemptRef = useRef(0);
  const parseAttemptRef = useRef(0);
  const sourceRevisionRef = useRef(0);
  const draftRef = useRef<TrackDImportDraft | null>(null);
  const provenanceRef = useRef<TrackDImportProvenance | null>(null);
  const mountedRef = useRef(true);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      confirmationAttemptRef.current += 1;
      parseAttemptRef.current += 1;
    };
  }, []);

  const includedRows = useMemo(
    () => draft?.rows.filter((row) => !row.excluded) ?? [],
    [draft],
  );

  const canMutateIntake = () =>
    !saving && !confirmationInFlightRef.current;

  const replaceDraft = (nextDraft: TrackDImportDraft | null) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const replaceProvenance = (
    nextProvenance: TrackDImportProvenance | null,
  ) => {
    provenanceRef.current = nextProvenance;
    setProvenance(nextProvenance);
  };

  const invalidatePendingWork = () => {
    parseAttemptRef.current += 1;
    confirmationAttemptRef.current += 1;
  };

  const bindSource = (
    source: TrackDSourceReference,
    sourceFiles: readonly File[],
    revision: number,
    originalText?: string,
  ): TrackDImportProvenance => {
    const { binding } = createTrackDSourceBinding(
      source,
      revision,
      originalText,
      sourceFiles,
    );
    return {
      source,
      sourceFiles,
      ...(originalText !== undefined ? { originalText } : {}),
      revision,
      fingerprint: binding.fingerprint,
    };
  };

  const resetIntake = () => {
    if (!canMutateIntake()) return;
    invalidatePendingWork();
    sourceRevisionRef.current += 1;
    replaceDraft(null);
    replaceProvenance(null);
    setTextMode(null);
    setSourceText('');
    setReviewed(false);
    setConfirmed(false);
    setStatus('');
  };

  const chooseSource = (choice: TrackDImportSourceKind) => {
    if (!canMutateIntake()) return;
    setStatus('');
    if (choice === 'camera') {
      cameraInputRef.current?.click();
    } else if (choice === 'photos') {
      photosInputRef.current?.click();
    } else if (choice === 'file') {
      fileInputRef.current?.click();
    } else {
      const continuesAttachedSource =
        draft?.extractionAvailable === false &&
        (provenance?.sourceFiles.length ?? 0) > 0;
      invalidatePendingWork();
      const revision = sourceRevisionRef.current + 1;
      sourceRevisionRef.current = revision;
      const fallbackSource = createSourceReference(
        choice,
        choice === 'paste' ? 'Pasted source text' : 'Manual entry',
      );
      const nextSource =
        continuesAttachedSource && provenance
          ? provenance
          : bindSource(fallbackSource, [], revision, '');
      setTextMode(choice);
      setSourceText('');
      replaceDraft(null);
      replaceProvenance(
        continuesAttachedSource && provenance
          ? bindSource(
              provenance.source,
              provenance.sourceFiles,
              revision,
              '',
            )
          : nextSource,
      );
      setReviewed(false);
      setConfirmed(false);
    }
  };

  const attachFiles = async (
    sourceKind: Extract<TrackDImportSourceKind, 'camera' | 'photos' | 'file'>,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!canMutateIntake()) return;
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    const first = files[0];
    const name =
      files.length === 1 ? first.name : `${files.length} source photos`;
    const source = createSourceReference(sourceKind, name, first);
    invalidatePendingWork();
    const revision = sourceRevisionRef.current + 1;
    sourceRevisionRef.current = revision;
    const initialProvenance = bindSource(source, files, revision);
    replaceProvenance(initialProvenance);
    replaceDraft(null);
    setTextMode(null);
    setReviewed(false);
    setConfirmed(false);

    if (files.length === 1 && isTextSource(first)) {
      const parseAttempt = parseAttemptRef.current + 1;
      parseAttemptRef.current = parseAttempt;
      try {
        const text = await first.text();
        if (
          !mountedRef.current ||
          parseAttemptRef.current !== parseAttempt ||
          provenanceRef.current?.source.id !== source.id ||
          provenanceRef.current.revision !== revision
        ) {
          return;
        }
        const textProvenance = bindSource(source, files, revision, text);
        replaceProvenance(textProvenance);
        const nextDraft = await parseSource(text, {
          existingUnitNumbers,
          kind,
          source,
          sourceFiles: files,
          sourceRevision: revision,
        });
        if (
          !mountedRef.current ||
          parseAttemptRef.current !== parseAttempt ||
          !isTrackDImportDraftCurrent(
            nextDraft,
            provenanceRef.current,
          )
        ) {
          return;
        }
        replaceDraft(nextDraft);
        setStatus('Source attached. Review every row before confirming.');
      } catch {
        if (
          mountedRef.current &&
          parseAttemptRef.current === parseAttempt
        ) {
          replaceDraft(null);
          setStatus(
            'Turn OS could not read this text file. Nothing was imported. Retry or choose another source.',
          );
        }
      }
      return;
    }

    replaceDraft(
      createUnavailableExtractionDraft(kind, source, files, revision),
    );
    setStatus(
      'Source attached — extraction not yet available. Paste text or enter rows manually.',
    );
  };

  const createTextPreview = async () => {
    if (!textMode || !canMutateIntake()) return;
    const textSnapshot = sourceText;
    let sourceProvenance = provenanceRef.current;
    if (!sourceProvenance) {
      const source = createSourceReference(
        textMode,
        textMode === 'paste' ? 'Pasted source text' : 'Manual entry',
      );
      const revision = sourceRevisionRef.current + 1;
      sourceRevisionRef.current = revision;
      sourceProvenance = bindSource(source, [], revision, textSnapshot);
      replaceProvenance(sourceProvenance);
    } else if (sourceProvenance.originalText !== textSnapshot) {
      const revision = sourceRevisionRef.current + 1;
      sourceRevisionRef.current = revision;
      sourceProvenance = bindSource(
        sourceProvenance.source,
        sourceProvenance.sourceFiles,
        revision,
        textSnapshot,
      );
      replaceProvenance(sourceProvenance);
    }

    const parseAttempt = parseAttemptRef.current + 1;
    parseAttemptRef.current = parseAttempt;
    const attachedSource = sourceProvenance.sourceFiles.length > 0;
    setReviewed(false);
    setConfirmed(false);
    setStatus('Creating a source-bound preview…');
    try {
      const nextDraft = await parseSource(textSnapshot, {
        existingUnitNumbers,
        kind,
        source: sourceProvenance.source,
        sourceFiles: sourceProvenance.sourceFiles,
        sourceRevision: sourceProvenance.revision,
      });
      if (
        !mountedRef.current ||
        parseAttemptRef.current !== parseAttempt ||
        !isTrackDImportDraftCurrent(nextDraft, provenanceRef.current)
      ) {
        return;
      }
      replaceDraft({
        ...nextDraft,
        ...(attachedSource ? { transcriptionKind: textMode } : {}),
      });
      setStatus(
        nextDraft.rows.length > 0
          ? attachedSource
            ? 'Preview created from the transcription. The original attachment remains linked.'
            : 'Preview created. Review every row before confirming.'
          : 'No reviewable rows were found. Edit the source or discard this intake.',
      );
    } catch {
      if (
        mountedRef.current &&
        parseAttemptRef.current === parseAttempt
      ) {
        replaceDraft(null);
        setStatus(
          'Preview failed. Nothing was imported. Your exact source remains available to retry, edit, or discard.',
        );
      }
    }
  };

  const updateRow = (
    rowId: string,
    patch: Partial<TrackDImportRow>,
  ) => {
    if (!draft || confirmed || !canMutateIntake()) return;
    const rows = revalidateTrackDImportRows(
      draft.rows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
      existingUnitNumbers,
      draft.kind,
    );
    replaceDraft({ ...draft, rows });
    setReviewed(false);
  };

  const confirm = async () => {
    const currentDraft = draftRef.current;
    const currentProvenance = provenanceRef.current;
    if (
      !currentDraft ||
      !reviewed ||
      confirmed ||
      confirmationInFlightRef.current ||
      !canConfirmTrackDImport(currentDraft, currentProvenance)
    ) {
      return;
    }
    const prepared = prepareTrackDConfirmedImport(
      currentDraft,
      currentProvenance,
      existingUnitNumbers,
    );
    if (!prepared) {
      setReviewed(false);
      setStatus(
        'This review no longer matches the current source or has unresolved validation. Nothing was saved. Recreate and review the preview.',
      );
      return;
    }
    confirmationInFlightRef.current = true;
    const attemptId = confirmationAttemptRef.current + 1;
    confirmationAttemptRef.current = attemptId;
    const committedBinding = prepared.sourceBinding;
    setSaving(true);
    setStatus('');
    try {
      const receipt = await onConfirm(prepared);
      if (!isTrackDImportCommitReceipt(receipt, committedBinding)) {
        throw new Error('Import host did not return a complete commit receipt.');
      }
      if (
        !mountedRef.current ||
        confirmationAttemptRef.current !== attemptId
      ) {
        return;
      }
      const latestDraft = draftRef.current;
      const latestProvenance = provenanceRef.current;
      const stillCurrent =
        latestDraft !== null &&
        latestProvenance !== null &&
        isTrackDImportDraftCurrent(latestDraft, latestProvenance) &&
        trackDSourceBindingsMatch(
          latestDraft.sourceBinding,
          committedBinding,
        );
      if (!stillCurrent) {
        setReviewed(false);
        setStatus(
          'An earlier intake was saved, but newer source changes remain unsaved on this screen. Review them before saving again.',
        );
        return;
      }
      setConfirmed(true);
      setStatus(
        'Intake confirmed once and locked on this screen. Official paper remains authoritative.',
      );
    } catch {
      if (
        mountedRef.current &&
        confirmationAttemptRef.current === attemptId
      ) {
        setStatus(
          'Confirmation failed. Nothing is marked saved. The exact source and reviewed draft remain available to retry, edit, or discard.',
        );
      }
    } finally {
      if (confirmationAttemptRef.current === attemptId) {
        confirmationInFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    }
  };

  return (
    <TrackDPage
      description="Attach the original source, review a personal preview, then confirm explicitly."
      onBack={onBack}
      statusLabel="Nothing is released or assigned before confirmation"
      title="Import Work"
    >
      <section className="w2a2d-import-kind" aria-labelledby="import-kind-label">
        <h2 id="import-kind-label">Import type</h2>
        <div className="w2a2d-segmented">
          {(Object.keys(importKindCopy) as TrackDImportKind[]).map((option) => (
            <button
              aria-pressed={kind === option}
              disabled={saving || confirmed}
              key={option}
              onClick={() => {
                if (canMutateIntake() && kind !== option) {
                  setKind(option);
                  resetIntake();
                }
              }}
              type="button"
            >
              {importKindCopy[option].label}
            </button>
          ))}
        </div>
        <p>{importKindCopy[kind].description}</p>
      </section>

      {!draft && !textMode ? (
        <section className="w2a2d-source-panel" aria-labelledby="source-label">
          <h2 id="source-label">Choose the source</h2>
          <p>Source-first options are ordered for field use.</p>
          <p className="w2a2d-permission-copy">
            Source attachment permission:{' '}
            <strong>{attachmentPermission.label || 'Not recorded'}</strong>
            {attachmentPermission.detail
              ? ` · ${attachmentPermission.detail}`
              : ''}
          </p>
          <div className="w2a2d-source-list">
            {SOURCE_CHOICES.map((choice) => {
              const needsAttachmentPermission = [
                'camera',
                'photos',
                'file',
              ].includes(choice.id);
              const disabled =
                needsAttachmentPermission && !attachmentPermission.canAttach;
              return (
                <button
                  className="w2a2d-source-choice"
                  disabled={saving || disabled}
                  key={choice.id}
                  onClick={() => chooseSource(choice.id)}
                  type="button"
                >
                  <span aria-hidden="true">{choice.icon}</span>
                  <span>
                    <strong>{choice.label}</strong>
                    <small>
                      {disabled
                        ? 'Unavailable until attachment permission is recorded'
                        : choice.description}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {textMode && !draft ? (
        <section className="w2a2d-text-intake" aria-labelledby="text-source-label">
          <div className="w2a2d-section-heading">
            <div>
              <h2 id="text-source-label">
                {textMode === 'paste' ? 'Paste source text' : 'Enter rows manually'}
              </h2>
              <p>
                One row per line. Use explicit labels such as{' '}
                <code>Unit: 413; sections: A,C,D; paint: yes</code>.
              </p>
            </div>
            <button
              className="w2a2d-text-button"
              disabled={saving}
              onClick={resetIntake}
              type="button"
            >
              Change source
            </button>
          </div>
          <label className="w2a2d-field">
            <span>Source wording</span>
            <textarea
              autoFocus
              disabled={saving}
              onChange={(event) => {
                if (canMutateIntake()) {
                  const nextText = event.currentTarget.value;
                  invalidatePendingWork();
                  const revision = sourceRevisionRef.current + 1;
                  sourceRevisionRef.current = revision;
                  const current = provenanceRef.current;
                  const source =
                    current?.source ??
                    createSourceReference(
                      textMode,
                      textMode === 'paste'
                        ? 'Pasted source text'
                        : 'Manual entry',
                    );
                  const files = current?.sourceFiles ?? [];
                  setSourceText(nextText);
                  replaceProvenance(
                    bindSource(source, files, revision, nextText),
                  );
                  replaceDraft(null);
                  setReviewed(false);
                  setConfirmed(false);
                  setStatus('');
                }
              }}
              placeholder="Paste or type the source exactly as received"
              rows={8}
              value={sourceText}
            />
          </label>
          {(provenance?.sourceFiles.length ?? 0) > 0 ? (
            <p className="w2a2d-retained-source">
              Original attachment retained: {provenance?.source.name}. This text
              is a manual transcription, not image or PDF extraction.
            </p>
          ) : null}
          <button
            className="w2a2d-primary-button"
            disabled={saving || !sourceText.trim()}
            onClick={() => void createTextPreview()}
            type="button"
          >
            Create review preview
          </button>
        </section>
      ) : null}

      {draft ? (
        <section
          aria-busy={saving}
          aria-labelledby="preview-label"
          className="w2a2d-preview"
        >
          <div className="w2a2d-section-heading">
            <div>
              <p className="w2a2d-eyebrow">Source attached</p>
              <h2 id="preview-label">{draft.source.name}</h2>
              <p>
                {draft.rows.length} preview row
                {draft.rows.length === 1 ? '' : 's'} · {includedRows.length}{' '}
                included
              </p>
            </div>
            <button
              className="w2a2d-text-button"
              disabled={saving}
              onClick={resetIntake}
              type="button"
            >
              {confirmed ? 'Start a new intake' : 'Start over'}
            </button>
          </div>

          {draft.warnings.length > 0 ? (
            <div className="w2a2d-callout w2a2d-callout--attention">
              <AlertTriangle aria-hidden="true" size={21} />
              <div>
                {draft.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}

          {!draft.extractionAvailable ? (
            <div className="w2a2d-unavailable-actions">
              <button
                disabled={saving}
                onClick={() => chooseSource('paste')}
                type="button"
              >
                Paste Text
              </button>
              <button
                disabled={saving}
                onClick={() => chooseSource('manual')}
                type="button"
              >
                Enter manually
              </button>
            </div>
          ) : null}

          {draft.rows.length > 0 ? (
            <div className="w2a2d-import-rows">
              {draft.rows.map((row) => (
                <ImportReviewCard
                  disabled={saving || confirmed}
                  key={row.id}
                  onChange={updateRow}
                  row={row}
                />
              ))}
            </div>
          ) : null}

          {draft.extractionAvailable && draft.rows.length > 0 ? (
            <div className="w2a2d-confirm-panel">
              <label className="w2a2d-review-check">
                <input
                  checked={reviewed}
                  disabled={saving || confirmed}
                  onChange={(event) => {
                    if (canMutateIntake()) {
                      setReviewed(event.currentTarget.checked);
                    }
                  }}
                  type="checkbox"
                />
                <span>
                  I reviewed this personal preview against the source. This does
                  not mark work assigned, complete, inspected, accepted, or paid.
                </span>
              </label>
              {!canConfirmTrackDImport(draft, provenance) ? (
                <p className="w2a2d-error-copy">
                  Recreate stale previews and resolve every warning,
                  uncertainty, duplicate, unsupported scope, roster, and Unit
                  conflict before confirming.
                </p>
              ) : null}
              <button
                className="w2a2d-primary-button"
                disabled={
                  saving ||
                  confirmed ||
                  !reviewed ||
                  !canConfirmTrackDImport(draft, provenance)
                }
                onClick={() => void confirm()}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={20} />
                {confirmed
                  ? 'Intake confirmed'
                  : saving
                    ? 'Confirming…'
                    : 'Confirm reviewed intake'}
              </button>
              {confirmed ? (
                <p className="w2a2d-confirmed-lock">
                  Durable confirmation succeeded. Start a new intake to submit
                  another source.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {status ? (
        <p aria-live="polite" className="w2a2d-inline-status" role="status">
          {status}
        </p>
      ) : null}

      <input
        accept="image/*"
        capture="environment"
        disabled={saving}
        hidden
        onChange={(event) => void attachFiles('camera', event)}
        ref={cameraInputRef}
        type="file"
      />
      <input
        accept="image/*"
        disabled={saving}
        hidden
        multiple
        onChange={(event) => void attachFiles('photos', event)}
        ref={photosInputRef}
        type="file"
      />
      <input
        accept=".csv,.txt,.pdf,image/*,text/csv,text/plain,application/pdf"
        disabled={saving}
        hidden
        onChange={(event) => void attachFiles('file', event)}
        ref={fileInputRef}
        type="file"
      />
    </TrackDPage>
  );
}

interface ImportReviewCardProps {
  disabled: boolean;
  onChange: (rowId: string, patch: Partial<TrackDImportRow>) => void;
  row: TrackDImportRow;
}

function ImportReviewCard({
  disabled,
  onChange,
  row,
}: ImportReviewCardProps) {
  return (
    <article className="w2a2d-import-row">
      <header>
        <div>
          <p>Source row {row.sourceRow}</p>
          <strong>{row.unitNumber || 'Unit needed'}</strong>
        </div>
        <label className="w2a2d-exclude-check">
          <input
            checked={row.excluded}
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { excluded: event.currentTarget.checked })
            }
            type="checkbox"
          />
          Exclude
        </label>
      </header>
      <div className="w2a2d-import-row__fields">
        <label className="w2a2d-field">
          <span>Unit</span>
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { unitNumber: event.currentTarget.value })
            }
            value={row.unitNumber}
          />
        </label>
        <label className="w2a2d-field">
          <span>Unit type</span>
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { unitType: event.currentTarget.value })
            }
            value={row.unitType}
          />
        </label>
        <label className="w2a2d-field">
          <span>Building</span>
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { building: event.currentTarget.value })
            }
            value={row.building}
          />
        </label>
        <label className="w2a2d-field">
          <span>Floor</span>
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { floor: event.currentTarget.value })
            }
            value={row.floor}
          />
        </label>
        <label className="w2a2d-field w2a2d-field--wide">
          <span>Applicable sections</span>
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, {
                applicableSections: event.currentTarget.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Common, A, C, D"
            value={row.applicableSections.join(', ')}
          />
        </label>
        <label className="w2a2d-field w2a2d-field--wide">
          <span>Restrictions or source notes</span>
          <textarea
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, { restrictions: event.currentTarget.value })
            }
            rows={2}
            value={row.restrictions}
          />
        </label>
      </div>
      <div className="w2a2d-scope-editors">
        <label className="w2a2d-field">
          <span>Paint scope</span>
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, {
                paintRequested: parseScopeReviewValue(
                  event.currentTarget.value,
                ),
              })
            }
            value={scopeReviewValue(row.paintRequested)}
          >
            <option value="not-stated">Not stated</option>
            <option value="included">Explicitly included</option>
            <option value="excluded">Explicitly excluded</option>
          </select>
        </label>
        <label className="w2a2d-field">
          <span>Clean scope</span>
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange(row.id, {
                cleanRequested: parseScopeReviewValue(
                  event.currentTarget.value,
                ),
              })
            }
            value={scopeReviewValue(row.cleanRequested)}
          >
            <option value="not-stated">Not stated</option>
            <option value="included">Explicitly included</option>
            <option value="excluded">Explicitly excluded</option>
          </select>
        </label>
      </div>
      {row.conflicts.length > 0 || row.uncertainties.length > 0 ? (
        <div className="w2a2d-row-messages">
          {row.conflicts.map((message) => (
            <p className="w2a2d-error-copy" key={message}>
              {message}
            </p>
          ))}
          {row.uncertainties.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      <details>
        <summary>Original source wording</summary>
        <p>{row.sourceExcerpt}</p>
      </details>
    </article>
  );
}

const scopeReviewValue = (value: boolean | undefined) => {
  if (value === true) return 'included';
  if (value === false) return 'excluded';
  return 'not-stated';
};

const parseScopeReviewValue = (value: string) => {
  if (value === 'included') return true;
  if (value === 'excluded') return false;
  return undefined;
};
