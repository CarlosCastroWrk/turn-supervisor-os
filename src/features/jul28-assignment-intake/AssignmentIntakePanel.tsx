import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ASSIGNMENT_INTAKE_MAX_BYTES,
  confirmAssignmentIntakeDraft,
  createAssignmentAttachmentMetadata,
  createAssignmentIntakeDraft,
  updateAssignmentDraftRecord,
  type AssignmentRecordPatch,
} from './assignmentIntake';
import type {
  AssignmentColumnField,
  AssignmentColumnMapping,
  AssignmentIntakeConfirmation,
  AssignmentIntakeDraft,
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

  const readyRecords = useMemo(
    () => draft?.records.filter((record) => record.reviewState === 'ready-for-confirmation') ?? [],
    [draft],
  );

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
      setSelectedIds(
        new Set(
          next.records
            .filter((record) => record.reviewState === 'ready-for-confirmation')
            .map((record) => record.id),
        ),
      );
      setPaperChecked(false);
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
      setSelectedIds(
        new Set(
          next.records
            .filter((record) => record.reviewState === 'ready-for-confirmation')
            .map((record) => record.id),
        ),
      );
      setPaperChecked(false);
      setConfirmation(undefined);
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
  };

  const correctRecord = (recordId: string, patch: AssignmentRecordPatch) => {
    if (!draft) return;
    const next = updateAssignmentDraftRecord(draft, recordId, patch);
    setDraft(next);
    setSelectedIds((current) => {
      const selected = new Set(current);
      const record = next.records.find((item) => item.id === recordId);
      if (record?.reviewState === 'ready-for-confirmation') selected.add(recordId);
      else selected.delete(recordId);
      return selected;
    });
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
            }}
          >
            <option value="paste-text">Pasted text</option>
            <option value="csv">CSV with headers</option>
            <option value="excel-compatible">Excel-compatible CSV/TSV</option>
          </select>
        </label>
        <label>
          Source reference
          <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} />
        </label>
        <label className="jul28-assignment-intake__wide">
          Exact source wording
          <textarea
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setAttachment(undefined);
              setDraft(undefined);
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
          File bytes stay in this browser session only. The draft stores source wording and reference metadata, not an
          official board, tenant data, QR contents, or a submitted assignment.
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
                <dd>{draft.records.length - readyRecords.length}</dd>
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

          <div className="jul28-assignment-intake__records">
            {draft.records.map((record) => (
              <article className="jul28-assignment-intake__record" key={record.id}>
                <header>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      disabled={record.reviewState === 'blocked'}
                      onChange={() => toggleRecord(record.id)}
                    />
                    Row {record.sourceRow}
                  </label>
                  <span data-state={record.reviewState}>
                    {record.reviewState === 'blocked' ? 'Needs correction' : 'Ready for confirmation'}
                  </span>
                </header>
                <blockquote>{record.originalWording}</blockquote>
                <div className="jul28-assignment-intake__record-grid">
                  <label>
                    Unit
                    <input
                      value={record.unitInput}
                      onChange={(event) => correctRecord(record.id, { unitInput: event.target.value })}
                    />
                  </label>
                  <label>
                    Section
                    <select
                      value={record.sectionInput}
                      onChange={(event) => correctRecord(record.id, { sectionInput: event.target.value })}
                    >
                      <option value="">Choose</option>
                      <option value="Common">Common</option>
                      {['A', 'B', 'C', 'D', 'E'].map((section) => (
                        <option key={section} value={section}>
                          {section}
                        </option>
                      ))}
                      {record.sectionInput && !record.section ? (
                        <option value={record.sectionInput}>{record.sectionInput} (unknown)</option>
                      ) : null}
                    </select>
                  </label>
                  <label>
                    Trade
                    <select
                      value={record.tradeInput}
                      onChange={(event) => correctRecord(record.id, { tradeInput: event.target.value })}
                    >
                      <option value="">Choose</option>
                      <option value="Paint">Paint</option>
                      <option value="Clean">Clean</option>
                      {record.tradeInput && !record.trade ? (
                        <option value={record.tradeInput}>{record.tradeInput} (unknown)</option>
                      ) : null}
                    </select>
                  </label>
                  <label>
                    Crew
                    <input
                      value={record.crewInput}
                      onChange={(event) => correctRecord(record.id, { crewInput: event.target.value })}
                    />
                  </label>
                  <label className="jul28-assignment-intake__wide">
                    Notes
                    <input
                      value={record.notesInput}
                      onChange={(event) => correctRecord(record.id, { notesInput: event.target.value })}
                    />
                  </label>
                </div>
                {record.flags.length ? (
                  <ul>
                    {record.flags.map((item, index) => (
                      <li key={`${item.code}:${index}`}>{item.message}</li>
                    ))}
                  </ul>
                ) : null}
                {record.corrections.length ? (
                  <small>
                    {record.corrections.length} manual correction{record.corrections.length === 1 ? '' : 's'} recorded;
                    original wording retained.
                  </small>
                ) : null}
              </article>
            ))}
          </div>

          {draft.records.length ? (
            <div className="jul28-assignment-intake__confirm">
              <label>
                <input
                  type="checkbox"
                  checked={paperChecked}
                  onChange={(event) => setPaperChecked(event.target.checked)}
                />
                I reviewed the selected records against the authoritative paper/source and want to confirm this personal
                candidate.
              </label>
              <button type="button" onClick={confirm} disabled={!paperChecked || selectedIds.size === 0}>
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
