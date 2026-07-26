import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  ASSIGNMENT_INTAKE_MAX_BYTES,
  ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE,
  clearAssignmentRelationshipResolution,
  confirmAssignmentIntakeDraft,
  createAssignmentAttachmentMetadata,
  createAssignmentIntakeDraft,
  getAssignmentFieldAccessibility,
  resolveAssignmentRelationship,
  sliceAssignmentIntakePreview,
  updateAssignmentDraftRecord,
  updateAssignmentDraftSourceLabel,
  type AssignmentRecordPatch,
} from './assignmentIntake';
import type {
  AssignmentColumnField,
  AssignmentColumnMapping,
  AssignmentEditableField,
  AssignmentIntakeConfirmation,
  AssignmentIntakeDraft,
  AssignmentIntakeRecord,
  AssignmentIntakeSourceKind,
} from './types';
import './assignment-intake.css';

const mappingFields: Array<{ field: AssignmentColumnField; label: string; required: boolean }> = [
  { field: 'unit', label: 'Unit', required: true },
  { field: 'section', label: 'Section', required: true },
  { field: 'trade', label: 'Trade', required: true },
  { field: 'crew', label: 'Crew', required: false },
  { field: 'notes', label: 'Notes', required: false },
];

export interface AssignmentIntakePanelProps {
  onConfirmed?: (confirmation: AssignmentIntakeConfirmation) => void;
}

const editableFields: AssignmentEditableField[] = [
  'unitInput',
  'sectionInput',
  'tradeInput',
  'crewInput',
  'notesInput',
];

const retainReadySelections = (
  selectedIds: Set<string>,
  records: AssignmentIntakeRecord[],
) => {
  const readyIds = new Set(
    records
      .filter((record) => record.reviewState === 'ready-for-confirmation')
      .map((record) => record.id),
  );
  return new Set([...selectedIds].filter((id) => readyIds.has(id)));
};

interface AssignmentIntakeRecordEditorProps {
  record: AssignmentIntakeRecord;
  selected: boolean;
  onToggle: (recordId: string) => void;
  onCorrect: (recordId: string, patch: AssignmentRecordPatch) => void;
  onResolveRelationship: (recordId: string) => void;
  onClearRelationship: (recordId: string) => void;
}

export function AssignmentIntakeRecordEditor({
  record,
  selected,
  onToggle,
  onCorrect,
  onResolveRelationship,
  onClearRelationship,
}: AssignmentIntakeRecordEditorProps) {
  const [values, setValues] = useState<Record<AssignmentEditableField, string>>(() => ({
    unitInput: record.unitInput,
    sectionInput: record.sectionInput,
    tradeInput: record.tradeInput,
    crewInput: record.crewInput,
    notesInput: record.notesInput,
  }));

  useEffect(() => {
    setValues({
      unitInput: record.unitInput,
      sectionInput: record.sectionInput,
      tradeInput: record.tradeInput,
      crewInput: record.crewInput,
      notesInput: record.notesInput,
    });
  }, [
    record.id,
    record.unitInput,
    record.sectionInput,
    record.tradeInput,
    record.crewInput,
    record.notesInput,
  ]);

  const accessibility = Object.fromEntries(
    editableFields.map((field) => [field, getAssignmentFieldAccessibility(record, field)]),
  ) as Record<AssignmentEditableField, ReturnType<typeof getAssignmentFieldAccessibility>>;
  const relationshipFlag = record.flags.find(
    (flag) => flag.code === 'duplicate-assignment' || flag.code === 'assignment-conflict',
  );
  const excluded = record.reviewState === 'excluded';
  const generalFlags = record.flags.filter((flag) => !flag.field);

  const setValue = (field: AssignmentEditableField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };
  const commit = (field: AssignmentEditableField) => {
    if (values[field] === record[field]) return;
    onCorrect(record.id, { [field]: values[field] });
  };
  const commitSelect = (field: 'sectionInput' | 'tradeInput', value: string) => {
    setValue(field, value);
    if (value !== record[field]) onCorrect(record.id, { [field]: value });
  };
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) event.currentTarget.blur();
  };
  const fieldErrors = (field: AssignmentEditableField) => {
    const details = accessibility[field];
    return details.invalid ? (
      <span className="jul28-assignment-intake__field-error" id={details.errorId}>
        {details.messages.join(' ')}
      </span>
    ) : null;
  };

  const statusLabel =
    record.reviewState === 'excluded'
      ? 'Excluded by review'
      : record.reviewState === 'blocked'
        ? 'Needs correction'
        : 'Ready for confirmation';

  return (
    <article className="jul28-assignment-intake__record" data-state={record.reviewState}>
      <header>
        <label>
          <input
            type="checkbox"
            checked={selected}
            disabled={record.reviewState !== 'ready-for-confirmation'}
            onChange={() => onToggle(record.id)}
          />
          Row {record.sourceRow}
        </label>
        <span data-state={record.reviewState}>{statusLabel}</span>
      </header>
      <blockquote>{record.originalWording}</blockquote>
      <div className="jul28-assignment-intake__record-grid">
        <label>
          Unit
          <input
            value={values.unitInput}
            disabled={excluded}
            aria-invalid={accessibility.unitInput.invalid || undefined}
            aria-describedby={accessibility.unitInput.invalid ? accessibility.unitInput.errorId : undefined}
            onChange={(event) => setValue('unitInput', event.target.value)}
            onBlur={() => commit('unitInput')}
            onKeyDown={blurOnEnter}
          />
          {fieldErrors('unitInput')}
        </label>
        <label>
          Section
          <select
            value={values.sectionInput}
            disabled={excluded}
            aria-invalid={accessibility.sectionInput.invalid || undefined}
            aria-describedby={
              accessibility.sectionInput.invalid ? accessibility.sectionInput.errorId : undefined
            }
            onChange={(event) => commitSelect('sectionInput', event.target.value)}
          >
            <option value="">Choose</option>
            <option value="Common">Common</option>
            {['A', 'B', 'C', 'D', 'E'].map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
            {values.sectionInput && !record.section ? (
              <option value={values.sectionInput}>{values.sectionInput} (unknown)</option>
            ) : null}
          </select>
          {fieldErrors('sectionInput')}
        </label>
        <label>
          Trade
          <select
            value={values.tradeInput}
            disabled={excluded}
            aria-invalid={accessibility.tradeInput.invalid || undefined}
            aria-describedby={accessibility.tradeInput.invalid ? accessibility.tradeInput.errorId : undefined}
            onChange={(event) => commitSelect('tradeInput', event.target.value)}
          >
            <option value="">Choose</option>
            <option value="Paint">Paint</option>
            <option value="Clean">Clean</option>
            {values.tradeInput && !record.trade ? (
              <option value={values.tradeInput}>{values.tradeInput} (unknown)</option>
            ) : null}
          </select>
          {fieldErrors('tradeInput')}
        </label>
        <label>
          Crew
          <input
            value={values.crewInput}
            disabled={excluded}
            aria-invalid={accessibility.crewInput.invalid || undefined}
            aria-describedby={accessibility.crewInput.invalid ? accessibility.crewInput.errorId : undefined}
            onChange={(event) => setValue('crewInput', event.target.value)}
            onBlur={() => commit('crewInput')}
            onKeyDown={blurOnEnter}
          />
          {fieldErrors('crewInput')}
        </label>
        <label className="jul28-assignment-intake__wide">
          Notes
          <textarea
            value={values.notesInput}
            disabled={excluded}
            rows={2}
            aria-invalid={accessibility.notesInput.invalid || undefined}
            aria-describedby={accessibility.notesInput.invalid ? accessibility.notesInput.errorId : undefined}
            onChange={(event) => setValue('notesInput', event.target.value)}
            onBlur={() => commit('notesInput')}
            onKeyDown={blurOnEnter}
          />
          {fieldErrors('notesInput')}
        </label>
      </div>
      {generalFlags.length ? (
        <ul>
          {generalFlags.map((item, index) => (
            <li key={`${item.code}:${index}`}>{item.message}</li>
          ))}
        </ul>
      ) : null}
      {relationshipFlag ? (
        <button type="button" className="secondary" onClick={() => onResolveRelationship(record.id)}>
          Use this row and exclude {relationshipFlag.relatedRecordIds?.length ?? 0} related row
          {(relationshipFlag.relatedRecordIds?.length ?? 0) === 1 ? '' : 's'}
        </button>
      ) : null}
      {record.relationshipResolution ? (
        <div className="jul28-assignment-intake__resolution">
          <span>
            {record.relationshipResolution.status === 'supported'
              ? 'Selected as the supported row; related source rows remain preserved.'
              : `Excluded in favor of row linked to ${record.relationshipResolution.supportedRecordId}.`}
          </span>
          <button type="button" className="quiet" onClick={() => onClearRelationship(record.id)}>
            Reconsider related rows
          </button>
        </div>
      ) : null}
      {record.corrections.length ? (
        <small>
          {record.corrections.length} manual correction{record.corrections.length === 1 ? '' : 's'} recorded; original
          wording retained.
        </small>
      ) : null}
    </article>
  );
}

export function AssignmentIntakePanel({ onConfirmed }: AssignmentIntakePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceKind, setSourceKind] = useState<AssignmentIntakeSourceKind>('paste-text');
  const [sourceLabel, setSourceLabel] = useState('Synthetic assignment note');
  const [sourceText, setSourceText] = useState('');
  const [attachment, setAttachment] = useState<ReturnType<typeof createAssignmentAttachmentMetadata>>();
  const [mapping, setMapping] = useState<AssignmentColumnMapping>({});
  const [draft, setDraft] = useState<AssignmentIntakeDraft>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [paperChecked, setPaperChecked] = useState(false);
  const [confirmation, setConfirmation] = useState<AssignmentIntakeConfirmation>();
  const [isReading, setIsReading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const [mappingDirty, setMappingDirty] = useState(false);

  const readyRecords = useMemo(
    () => draft?.records.filter((record) => record.reviewState === 'ready-for-confirmation') ?? [],
    [draft],
  );
  const excludedRecords = useMemo(
    () => draft?.records.filter((record) => record.reviewState === 'excluded') ?? [],
    [draft],
  );
  const previewRecords = useMemo(
    () => sliceAssignmentIntakePreview(draft?.records ?? [], previewPage),
    [draft, previewPage],
  );
  const previewPageCount = Math.max(
    1,
    Math.ceil((draft?.records.length ?? 0) / ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE),
  );

  useEffect(() => {
    setPreviewPage((current) => Math.min(current, previewPageCount - 1));
  }, [previewPageCount]);

  const analyze = async (nextMapping = mapping) => {
    setLocalError('');
    setConfirmation(undefined);
    try {
      const next = await createAssignmentIntakeDraft({
        sourceKind,
        text: sourceText,
        sourceLabel,
        ...(attachment ? { attachment } : {}),
        mapping: nextMapping,
      });
      setDraft(next);
      setMapping(next.mapping);
      setSelectedIds(new Set());
      setPaperChecked(false);
      setPreviewPage(0);
      setMappingDirty(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The source could not be reviewed.');
    }
  };

  const chooseFile = () => fileInputRef.current?.click();

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsReading(true);
    setLocalError('');
    if (file.size > ASSIGNMENT_INTAKE_MAX_BYTES) {
      setIsReading(false);
      setLocalError(`Choose a CSV or TSV file no larger than ${ASSIGNMENT_INTAKE_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    try {
      const text = await file.text();
      const nextKind: AssignmentIntakeSourceKind = file.name.toLocaleLowerCase('en-US').endsWith('.tsv')
        ? 'excel-compatible'
        : 'csv';
      const metadata = createAssignmentAttachmentMetadata(file);
      setSourceKind(nextKind);
      setSourceLabel(file.name);
      setSourceText(text);
      setAttachment(metadata);
      setMapping({});
      const next = await createAssignmentIntakeDraft({
        sourceKind: nextKind,
        text,
        sourceLabel: file.name,
        attachment: metadata,
      });
      setDraft(next);
      setMapping(next.mapping);
      setSelectedIds(new Set());
      setPaperChecked(false);
      setConfirmation(undefined);
      setPreviewPage(0);
      setMappingDirty(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The local file could not be read.');
    } finally {
      setIsReading(false);
    }
  };

  const clear = () => {
    setSourceText('');
    setAttachment(undefined);
    setMapping({});
    setDraft(undefined);
    setSelectedIds(new Set());
    setPaperChecked(false);
    setConfirmation(undefined);
    setLocalError('');
    setPreviewPage(0);
    setMappingDirty(false);
  };

  const correctRecord = (recordId: string, patch: AssignmentRecordPatch) => {
    if (!draft) return;
    const next = updateAssignmentDraftRecord(draft, recordId, patch);
    setDraft(next);
    setSelectedIds((current) => retainReadySelections(current, next.records));
    setPaperChecked(false);
    setConfirmation(undefined);
  };

  const resolveRelationship = (recordId: string) => {
    if (!draft) return;
    const next = resolveAssignmentRelationship(draft, recordId);
    setDraft(next);
    setSelectedIds((current) => retainReadySelections(current, next.records));
    setPaperChecked(false);
    setConfirmation(undefined);
  };

  const clearRelationship = (recordId: string) => {
    if (!draft) return;
    const next = clearAssignmentRelationshipResolution(draft, recordId);
    setDraft(next);
    setSelectedIds((current) => retainReadySelections(current, next.records));
    setPaperChecked(false);
    setConfirmation(undefined);
  };

  const toggleRecord = (recordId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
    setPaperChecked(false);
  };

  const confirm = () => {
    if (!draft) return;
    if (mappingDirty) {
      setLocalError('Rebuild preview before confirmation because the column mapping changed.');
      return;
    }
    const result = confirmAssignmentIntakeDraft(draft, {
      recordIds: [...selectedIds],
      confirmedByLos: paperChecked,
    });
    if (!result.ok) {
      setLocalError(result.errors.join(' '));
      return;
    }
    setLocalError('');
    setConfirmation(result.confirmation);
    onConfirmed?.(result.confirmation);
  };

  return (
    <section className="jul28-assignment-intake" aria-labelledby="assignment-intake-title">
      <header className="jul28-assignment-intake__header">
        <p>Personal draft · Paper remains authoritative</p>
        <h2 id="assignment-intake-title">Assignment intake</h2>
        <span>Paste or map a synthetic Paint/Clean assignment source. Nothing is added to Turn OS automatically.</span>
      </header>

      <div className="jul28-assignment-intake__source">
        <label>
          Source format
          <select
            value={sourceKind}
            onChange={(event) => {
              setSourceKind(event.target.value as AssignmentIntakeSourceKind);
              setAttachment(undefined);
              setDraft(undefined);
              setSelectedIds(new Set());
              setPaperChecked(false);
              setConfirmation(undefined);
              setPreviewPage(0);
              setMappingDirty(false);
            }}
          >
            <option value="paste-text">Pasted text</option>
            <option value="csv">CSV with headers</option>
            <option value="excel-compatible">Excel-compatible CSV/TSV</option>
          </select>
        </label>
        <label>
          Source reference
          <input
            value={sourceLabel}
            onChange={(event) => {
              const nextLabel = event.target.value;
              setSourceLabel(nextLabel);
              setDraft((current) =>
                current ? updateAssignmentDraftSourceLabel(current, nextLabel) : current,
              );
              setPaperChecked(false);
              setConfirmation(undefined);
            }}
          />
        </label>
        <label className="jul28-assignment-intake__wide">
          Exact source wording
          <textarea
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setAttachment(undefined);
              setDraft(undefined);
              setSelectedIds(new Set());
              setPaperChecked(false);
              setConfirmation(undefined);
              setPreviewPage(0);
              setMappingDirty(false);
            }}
            placeholder={
              'Unit: 602 | Section: Common | Trade: Paint | Crew: Crew Alpha\n' +
              'Unit: 603 | Section: C | Trade: Clean'
            }
            rows={7}
          />
        </label>
        <input
          ref={fileInputRef}
          className="jul28-assignment-intake__hidden"
          type="file"
          aria-label="Choose assignment CSV or TSV file"
          tabIndex={-1}
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          onChange={(event) => void readFile(event)}
        />
        <div className="jul28-assignment-intake__actions jul28-assignment-intake__wide">
          <button type="button" onClick={() => void analyze()} disabled={isReading}>
            Review draft
          </button>
          <button type="button" className="secondary" onClick={chooseFile} disabled={isReading}>
            {isReading ? 'Reading local file…' : 'Choose CSV or TSV'}
          </button>
          <button type="button" className="quiet" onClick={clear}>
            Clear
          </button>
        </div>
        <p className="jul28-assignment-intake__safety jul28-assignment-intake__wide">
          Do not paste or upload tenant names, contact details, access credentials, QR contents, or other tenant data.
          Raw source wording stays only in this local review draft until cleared. Confirmation passes only selected
          normalized records and their review receipts; it never creates an official board or submitted assignment.
        </p>
      </div>

      {localError ? (
        <div className="jul28-assignment-intake__alert" role="alert">
          {localError}
        </div>
      ) : null}

      {draft?.headers.length ? (
        <section className="jul28-assignment-intake__mapping" aria-labelledby="assignment-mapping-title">
          <div>
            <h3 id="assignment-mapping-title">Column mapping</h3>
            <p>Map the source columns explicitly. Binary .xlsx files are not read in this candidate.</p>
          </div>
          <div className="jul28-assignment-intake__mapping-grid">
            {mappingFields.map(({ field, label, required }) => (
              <label key={field}>
                {label}
                {required ? ' *' : ''}
                <select
                  value={mapping[field] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping((current) => {
                      const next = { ...current };
                      if (value === '') next[field] = null;
                      else next[field] = Number(value);
                      return next;
                    });
                    setSelectedIds(new Set());
                    setPaperChecked(false);
                    setConfirmation(undefined);
                    setMappingDirty(true);
                  }}
                >
                  <option value="">Not mapped</option>
                  {draft.headers.map((header, index) => (
                    <option key={`${header}:${index}`} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void analyze(mapping)}>
            Rebuild preview
          </button>
        </section>
      ) : null}

      {draft ? (
        <section className="jul28-assignment-intake__review" aria-labelledby="assignment-review-title">
          <div className="jul28-assignment-intake__review-heading">
            <div>
              <p>Draft only</p>
              <h3 id="assignment-review-title">
                {draft.records.length} extracted record{draft.records.length === 1 ? '' : 's'}
              </h3>
            </div>
            <dl>
              <div>
                <dt>Ready</dt>
                <dd>{readyRecords.length}</dd>
              </div>
              <div>
                <dt>Blocked</dt>
                <dd>
                  {
                    draft.records.filter((record) => record.reviewState === 'blocked').length
                  }
                </dd>
              </div>
              <div>
                <dt>Excluded</dt>
                <dd>{excludedRecords.length}</dd>
              </div>
            </dl>
          </div>

          {draft.fatalErrors.map((message) => (
            <div className="jul28-assignment-intake__alert" role="alert" key={message}>
              {message}
            </div>
          ))}
          {draft.warnings.map((message) => (
            <div className="jul28-assignment-intake__notice" key={message}>
              {message}
            </div>
          ))}
          {mappingDirty ? (
            <div className="jul28-assignment-intake__notice" role="status">
              Column mapping changed. Rebuild preview before confirmation.
            </div>
          ) : null}

          {draft.records.length > ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE ? (
            <nav className="jul28-assignment-intake__pagination" aria-label="Assignment preview pages">
              <button
                type="button"
                className="secondary"
                disabled={previewPage === 0}
                onClick={() => setPreviewPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </button>
              <span>
                Rows {previewPage * ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE + 1}–
                {Math.min(
                  (previewPage + 1) * ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE,
                  draft.records.length,
                )}{' '}
                of {draft.records.length}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={previewPage >= previewPageCount - 1}
                onClick={() =>
                  setPreviewPage((current) => Math.min(previewPageCount - 1, current + 1))
                }
              >
                Next
              </button>
            </nav>
          ) : null}

          <div className="jul28-assignment-intake__records">
            {previewRecords.map((record) => (
              <AssignmentIntakeRecordEditor
                key={record.id}
                record={record}
                selected={selectedIds.has(record.id)}
                onToggle={toggleRecord}
                onCorrect={correctRecord}
                onResolveRelationship={resolveRelationship}
                onClearRelationship={clearRelationship}
              />
            ))}
          </div>

          {draft.records.length ? (
            <div className="jul28-assignment-intake__confirm">
              <label>
                <input
                  type="checkbox"
                  checked={paperChecked}
                  disabled={mappingDirty}
                  onChange={(event) => setPaperChecked(event.target.checked)}
                />
                I reviewed the selected records against the authoritative paper/source and want to confirm this personal
                candidate.
              </label>
              <button
                type="button"
                onClick={confirm}
                disabled={mappingDirty || !paperChecked || selectedIds.size === 0}
              >
                Confirm {selectedIds.size} reviewed record{selectedIds.size === 1 ? '' : 's'}
              </button>
              <p>
                Confirmation creates a callback receipt only. This component does not write to AppData, approve property
                work, submit a form, or affect payroll.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {confirmation ? (
        <section className="jul28-assignment-intake__receipt" aria-live="polite">
          <strong>
            {confirmation.records.length} personal candidate record{confirmation.records.length === 1 ? '' : 's'}{' '}
            confirmed
          </strong>
          <span>Paper remains authoritative. Integration and persistence are separate reviewed steps.</span>
        </section>
      ) : null}
    </section>
  );
}
