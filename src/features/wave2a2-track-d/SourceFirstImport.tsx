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
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  canConfirmTrackDImport,
  createUnavailableExtractionDraft,
  parseTrackDImportText,
  revalidateTrackDImportRows,
  type TrackDConfirmedImport,
  type TrackDImportDraft,
  type TrackDImportKind,
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
  onConfirm: (
    confirmed: TrackDConfirmedImport,
  ) => Promise<void> | void;
}

export function SourceFirstImport({
  attachmentPermission,
  existingUnitNumbers = [],
  initialKind = 'property-roster',
  onBack,
  onConfirm,
}: SourceFirstImportProps) {
  const [kind, setKind] = useState<TrackDImportKind>(initialKind);
  const [draft, setDraft] = useState<TrackDImportDraft | null>(null);
  const [sourceFiles, setSourceFiles] = useState<readonly File[]>([]);
  const [textMode, setTextMode] = useState<'paste' | 'manual' | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const includedRows = useMemo(
    () => draft?.rows.filter((row) => !row.excluded) ?? [],
    [draft],
  );

  const resetIntake = () => {
    setDraft(null);
    setSourceFiles([]);
    setTextMode(null);
    setSourceText('');
    setReviewed(false);
    setStatus('');
  };

  const chooseSource = (choice: TrackDImportSourceKind) => {
    setStatus('');
    if (choice === 'camera') {
      cameraInputRef.current?.click();
    } else if (choice === 'photos') {
      photosInputRef.current?.click();
    } else if (choice === 'file') {
      fileInputRef.current?.click();
    } else {
      setTextMode(choice);
      setSourceText('');
      setDraft(null);
      setSourceFiles([]);
      setReviewed(false);
    }
  };

  const attachFiles = async (
    sourceKind: Extract<TrackDImportSourceKind, 'camera' | 'photos' | 'file'>,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    const first = files[0];
    const name =
      files.length === 1 ? first.name : `${files.length} source photos`;
    const source = createSourceReference(sourceKind, name, first);
    setSourceFiles(files);
    setTextMode(null);
    setReviewed(false);

    if (files.length === 1 && isTextSource(first)) {
      try {
        const text = await first.text();
        const nextDraft = await parseTrackDImportText(text, {
          existingUnitNumbers,
          kind,
          source,
        });
        setDraft(nextDraft);
        setStatus('Source attached. Review every row before confirming.');
      } catch {
        setDraft(null);
        setStatus(
          'Turn OS could not read this text file. Nothing was imported.',
        );
      }
      return;
    }

    setDraft(createUnavailableExtractionDraft(kind, source));
    setStatus(
      'Source attached — extraction not yet available. Paste text or enter rows manually.',
    );
  };

  const createTextPreview = async () => {
    if (!textMode) return;
    const source = createSourceReference(
      textMode,
      textMode === 'paste' ? 'Pasted source text' : 'Manual entry',
    );
    const nextDraft = await parseTrackDImportText(sourceText, {
      existingUnitNumbers,
      kind,
      source,
    });
    setDraft(nextDraft);
    setSourceFiles([]);
    setReviewed(false);
    setStatus(
      nextDraft.rows.length > 0
        ? 'Preview created. Review every row before confirming.'
        : 'No reviewable rows were found.',
    );
  };

  const updateRow = (
    rowId: string,
    patch: Partial<TrackDImportRow>,
  ) => {
    if (!draft) return;
    const rows = revalidateTrackDImportRows(
      draft.rows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
      existingUnitNumbers,
    );
    setDraft({ ...draft, rows });
    setReviewed(false);
  };

  const confirm = async () => {
    if (!draft || !reviewed || !canConfirmTrackDImport(draft)) return;
    setSaving(true);
    setStatus('');
    try {
      await onConfirm({
        kind: draft.kind,
        source: draft.source,
        rows: includedRows,
        sourceFiles,
        confirmedAt: new Date().toISOString(),
      });
      setStatus(
        'Confirmed personal intake sent to the host. Official paper remains authoritative.',
      );
    } catch {
      setStatus('Confirmation failed. The reviewed source remains on this screen.');
    } finally {
      setSaving(false);
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
              key={option}
              onClick={() => {
                if (kind !== option) {
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
                  disabled={disabled}
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
            <button className="w2a2d-text-button" onClick={resetIntake} type="button">
              Change source
            </button>
          </div>
          <label className="w2a2d-field">
            <span>Source wording</span>
            <textarea
              autoFocus
              onChange={(event) => setSourceText(event.currentTarget.value)}
              placeholder="Paste or type the source exactly as received"
              rows={8}
              value={sourceText}
            />
          </label>
          <button
            className="w2a2d-primary-button"
            disabled={!sourceText.trim()}
            onClick={() => void createTextPreview()}
            type="button"
          >
            Create review preview
          </button>
        </section>
      ) : null}

      {draft ? (
        <section className="w2a2d-preview" aria-labelledby="preview-label">
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
            <button className="w2a2d-text-button" onClick={resetIntake} type="button">
              Start over
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
              <button onClick={() => chooseSource('paste')} type="button">
                Paste Text
              </button>
              <button onClick={() => chooseSource('manual')} type="button">
                Enter manually
              </button>
            </div>
          ) : null}

          {draft.rows.length > 0 ? (
            <div className="w2a2d-import-rows">
              {draft.rows.map((row) => (
                <ImportReviewCard key={row.id} onChange={updateRow} row={row} />
              ))}
            </div>
          ) : null}

          {draft.extractionAvailable && draft.rows.length > 0 ? (
            <div className="w2a2d-confirm-panel">
              <label className="w2a2d-review-check">
                <input
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  I reviewed this personal preview against the source. This does
                  not mark work assigned, complete, inspected, accepted, or paid.
                </span>
              </label>
              {!canConfirmTrackDImport(draft) ? (
                <p className="w2a2d-error-copy">
                  Resolve duplicate, existing-Unit, and missing-Unit conflicts
                  before confirming.
                </p>
              ) : null}
              <button
                className="w2a2d-primary-button"
                disabled={
                  saving || !reviewed || !canConfirmTrackDImport(draft)
                }
                onClick={() => void confirm()}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={20} />
                {saving ? 'Confirming…' : 'Confirm reviewed intake'}
              </button>
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
        hidden
        onChange={(event) => void attachFiles('camera', event)}
        ref={cameraInputRef}
        type="file"
      />
      <input
        accept="image/*"
        hidden
        multiple
        onChange={(event) => void attachFiles('photos', event)}
        ref={photosInputRef}
        type="file"
      />
      <input
        accept=".csv,.txt,.pdf,image/*,text/csv,text/plain,application/pdf"
        hidden
        onChange={(event) => void attachFiles('file', event)}
        ref={fileInputRef}
        type="file"
      />
    </TrackDPage>
  );
}

interface ImportReviewCardProps {
  onChange: (rowId: string, patch: Partial<TrackDImportRow>) => void;
  row: TrackDImportRow;
}

function ImportReviewCard({ onChange, row }: ImportReviewCardProps) {
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
            onChange={(event) =>
              onChange(row.id, { unitNumber: event.currentTarget.value })
            }
            value={row.unitNumber}
          />
        </label>
        <label className="w2a2d-field">
          <span>Unit type</span>
          <input
            onChange={(event) =>
              onChange(row.id, { unitType: event.currentTarget.value })
            }
            value={row.unitType}
          />
        </label>
        <label className="w2a2d-field">
          <span>Building</span>
          <input
            onChange={(event) =>
              onChange(row.id, { building: event.currentTarget.value })
            }
            value={row.building}
          />
        </label>
        <label className="w2a2d-field">
          <span>Floor</span>
          <input
            onChange={(event) =>
              onChange(row.id, { floor: event.currentTarget.value })
            }
            value={row.floor}
          />
        </label>
        <label className="w2a2d-field w2a2d-field--wide">
          <span>Applicable sections</span>
          <input
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
            onChange={(event) =>
              onChange(row.id, { restrictions: event.currentTarget.value })
            }
            rows={2}
            value={row.restrictions}
          />
        </label>
      </div>
      <dl className="w2a2d-scope-summary">
        <div>
          <dt>Paint</dt>
          <dd>{scopeLabel(row.paintRequested)}</dd>
        </div>
        <div>
          <dt>Clean</dt>
          <dd>{scopeLabel(row.cleanRequested)}</dd>
        </div>
      </dl>
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

const scopeLabel = (value: boolean | undefined) => {
  if (value === true) return 'Explicitly included';
  if (value === false) return 'Explicitly excluded';
  return 'Not stated';
};
