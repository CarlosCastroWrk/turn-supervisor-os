import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ManualAssignmentExtractorProvider } from './extractors';
import {
  createAssignmentConfirmationProposal,
  createAssignmentIntakeReview,
  createBinaryAssignmentSource,
  createTextAssignmentSource,
} from './intake';
import type {
  AssignmentIntakeEntryPoint,
  AssignmentIntakeReviewSession,
  AssignmentPersonalRecordProposal,
  AssignmentSourceArtifact,
  AssignmentValidationContext,
  ManualAssignmentFields,
} from './types';
import './assignment-intake.css';

const defaultExtractor = new ManualAssignmentExtractorProvider();

const emptyFields = (): ManualAssignmentFields => ({
  unit: '',
  unitType: '',
  sections: [],
  paintScope: '',
  cleanScope: '',
  uncertainties: [],
  accessSignals: [],
});

const splitValues = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const manualSourceText = (fields: ManualAssignmentFields) =>
  [
    `Unit: ${fields.unit}`,
    fields.unitType ? `Unit type: ${fields.unitType}` : '',
    fields.sections.length ? `Sections: ${fields.sections.join(', ')}` : '',
    fields.paintScope ? `Paint: ${fields.paintScope}` : '',
    fields.cleanScope ? `Clean: ${fields.cleanScope}` : '',
    fields.otherTradeMentions?.length
      ? `Other trade: ${fields.otherTradeMentions.join(', ')}`
      : '',
    fields.uncertainties?.length ? `Uncertainties: ${fields.uncertainties.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

const entryLabels: Array<{
  value: AssignmentIntakeEntryPoint;
  label: string;
}> = [
  { value: 'take-photo', label: 'Take photo' },
  { value: 'choose-image', label: 'Choose image' },
  { value: 'choose-file', label: 'Choose file' },
  { value: 'paste-text', label: 'Paste text' },
  { value: 'enter-manually', label: 'Enter manually' },
];

export interface AssignmentIntakePanelProps {
  context: AssignmentValidationContext;
  onProposal?: (proposal: AssignmentPersonalRecordProposal) => void;
}

export function AssignmentIntakePanel({
  context,
  onProposal,
}: AssignmentIntakePanelProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [entryPoint, setEntryPoint] =
    useState<AssignmentIntakeEntryPoint>('paste-text');
  const [pasteText, setPasteText] = useState('');
  const [fields, setFields] = useState<ManualAssignmentFields>(emptyFields);
  const [source, setSource] = useState<AssignmentSourceArtifact>();
  const [session, setSession] = useState<AssignmentIntakeReviewSession>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [acknowledgeDuplicates, setAcknowledgeDuplicates] = useState(false);
  const [acknowledgeAccess, setAcknowledgeAccess] = useState(false);
  const [acknowledgeUncertainties, setAcknowledgeUncertainties] = useState(false);

  const binaryMode =
    entryPoint === 'take-photo' ||
    entryPoint === 'choose-image' ||
    entryPoint === 'choose-file';
  const manualMode = entryPoint === 'enter-manually' || binaryMode;
  const canReview =
    entryPoint === 'paste-text'
      ? Boolean(pasteText.trim())
      : manualMode
        ? Boolean(fields.unit.trim() || source)
        : false;
  const hardBlocked = Boolean(session?.draft.validationConflicts.length);

  const resetReview = () => {
    setSession(undefined);
    setError('');
    setNotice('');
    setAcknowledgeWarnings(false);
    setAcknowledgeDuplicates(false);
    setAcknowledgeAccess(false);
    setAcknowledgeUncertainties(false);
  };

  const clear = () => {
    setPasteText('');
    setFields(emptyFields());
    setSource(undefined);
    resetReview();
  };

  const chooseEntry = (next: AssignmentIntakeEntryPoint) => {
    setEntryPoint(next);
    clear();
    if (next === 'take-photo') cameraRef.current?.click();
    if (next === 'choose-image') imageRef.current?.click();
    if (next === 'choose-file') fileRef.current?.click();
  };

  const readBinarySource = async (
    event: ChangeEvent<HTMLInputElement>,
    sourceEntryPoint: Extract<
      AssignmentIntakeEntryPoint,
      'take-photo' | 'choose-image' | 'choose-file'
    >,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setSource(
        createBinaryAssignmentSource({
          entryPoint: sourceEntryPoint,
          bytes,
          label: file.name || 'Captured assignment source',
          mediaType: file.type,
        }),
      );
      setNotice(
        'Original source held only in this local review. Manually enter the fields you can verify; OCR is not active.',
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The source could not be read.');
      setSource(undefined);
    } finally {
      setBusy(false);
    }
  };

  const review = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const nextSource =
        source ??
        createTextAssignmentSource({
          entryPoint:
            entryPoint === 'enter-manually' ? 'enter-manually' : 'paste-text',
          text: entryPoint === 'enter-manually' ? manualSourceText(fields) : pasteText,
          label:
            entryPoint === 'enter-manually'
              ? 'Manual assignment entry'
              : 'Pasted assignment source',
        });
      const result = await createAssignmentIntakeReview({
        source: nextSource,
        extractor: defaultExtractor,
        context,
        ...(manualMode ? { manualFields: fields } : {}),
      });

      if (result.status === 'rejected') {
        setSource(undefined);
        setSession(undefined);
        setError(
          `${result.rejection.messages.join(' ')} The original was discarded from this intake session.`,
        );
        return;
      }
      if (result.status === 'invalid-extraction') {
        setSource(nextSource);
        setSession(undefined);
        setError(`Draft validation failed: ${result.invalid.schemaIssues.join(' ')}`);
        return;
      }

      setSource(nextSource);
      setSession(result.session);
      setNotice(
        'Draft ready for review. It has no assignment authority and has not changed any Unit.',
      );
      setAcknowledgeWarnings(false);
      setAcknowledgeDuplicates(false);
      setAcknowledgeAccess(false);
      setAcknowledgeUncertainties(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The source could not be reviewed.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!session) return;
    const result = createAssignmentConfirmationProposal(session, {
      confirmedByLos: true,
      acknowledgeSourceWarningIds: acknowledgeWarnings
        ? session.draft.sourceWarnings.map(({ id }) => id)
        : [],
      acknowledgeDuplicateWarnings: acknowledgeDuplicates,
      acknowledgeOccupancyConflictIds: acknowledgeAccess
        ? session.draft.occupancyAccessConflicts.map(({ id }) => id)
        : [],
      acknowledgeUncertainties,
    });
    if (!result.ok) {
      setError(result.errors.join(' '));
      return;
    }
    setError('');
    setNotice(
      'Personal-record proposal created. A separate deterministic confirmation step must apply it later.',
    );
    onProposal?.(result.proposal);
  };

  const sourceSummary = useMemo(() => {
    if (!source) return '';
    return `${source.label} · ${Math.max(1, Math.ceil(source.sizeBytes / 1024))} KB · local review only`;
  }, [source]);

  return (
    <section className="launch-assignment-intake" aria-labelledby="assignment-intake-title">
      <header className="launch-assignment-intake__header">
        <p>Personal draft · Paper remains authoritative</p>
        <h2 id="assignment-intake-title">Import work</h2>
        <span>Preserve the source, review conflicts, then create a proposal. Nothing is assigned automatically.</span>
      </header>

      <div className="launch-assignment-intake__entry-points" aria-label="Assignment source options">
        {entryLabels.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            data-active={entryPoint === value || undefined}
            onClick={() => chooseEntry(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={cameraRef}
        className="launch-assignment-intake__hidden"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take assignment source photo"
        onChange={(event) => void readBinarySource(event, 'take-photo')}
      />
      <input
        ref={imageRef}
        className="launch-assignment-intake__hidden"
        type="file"
        accept="image/*"
        aria-label="Choose assignment source image"
        onChange={(event) => void readBinarySource(event, 'choose-image')}
      />
      <input
        ref={fileRef}
        className="launch-assignment-intake__hidden"
        type="file"
        accept="image/*,.txt,.csv,.pdf,text/plain,text/csv,application/pdf"
        aria-label="Choose assignment source file"
        onChange={(event) => void readBinarySource(event, 'choose-file')}
      />

      <form className="launch-assignment-intake__form" onSubmit={(event) => void review(event)}>
        {entryPoint === 'paste-text' ? (
          <label className="launch-assignment-intake__wide">
            Exact source text
            <textarea
              value={pasteText}
              rows={7}
              placeholder="Unit 602 | Sections A, C | Paint: full paint | Clean: A and C"
              onChange={(event) => {
                setPasteText(event.target.value);
                resetReview();
              }}
            />
          </label>
        ) : null}

        {manualMode ? (
          <fieldset>
            <legend>Manual transcription</legend>
            {sourceSummary ? <p className="launch-assignment-intake__source">{sourceSummary}</p> : null}
            <div className="launch-assignment-intake__grid">
              <label>
                Unit
                <input
                  value={fields.unit}
                  onChange={(event) => {
                    setFields((current) => ({ ...current, unit: event.target.value }));
                    resetReview();
                  }}
                />
              </label>
              <label>
                Unit type, if shown
                <input
                  value={fields.unitType ?? ''}
                  onChange={(event) => {
                    setFields((current) => ({ ...current, unitType: event.target.value }));
                    resetReview();
                  }}
                />
              </label>
              <label>
                Sections
                <input
                  value={fields.sections.join(', ')}
                  placeholder="Common, A, C"
                  onChange={(event) => {
                    setFields((current) => ({
                      ...current,
                      sections: splitValues(event.target.value),
                    }));
                    resetReview();
                  }}
                />
              </label>
              <label>
                Paint scope
                <input
                  value={fields.paintScope ?? ''}
                  placeholder="Exact source wording"
                  onChange={(event) => {
                    setFields((current) => ({ ...current, paintScope: event.target.value }));
                    resetReview();
                  }}
                />
              </label>
              <label>
                Clean scope
                <input
                  value={fields.cleanScope ?? ''}
                  placeholder="Exact source wording"
                  onChange={(event) => {
                    setFields((current) => ({ ...current, cleanScope: event.target.value }));
                    resetReview();
                  }}
                />
              </label>
              <label>
                Other trade mentioned
                <input
                  value={(fields.otherTradeMentions ?? []).join(', ')}
                  placeholder="Leave blank for Paint/Clean"
                  onChange={(event) => {
                    setFields((current) => ({
                      ...current,
                      otherTradeMentions: splitValues(event.target.value),
                    }));
                    resetReview();
                  }}
                />
              </label>
            </div>
          </fieldset>
        ) : null}

        <p className="launch-assignment-intake__safety">
          Do not upload signatures, W-9/paycard/payroll records, access credentials, tenant information, or real
          unredacted production material. Uploaded content is untrusted and cannot override safety or confirmation.
        </p>

        <div className="launch-assignment-intake__actions">
          <button type="submit" disabled={!canReview || busy}>
            {busy ? 'Reviewing…' : 'Build review draft'}
          </button>
          <button type="button" className="secondary" onClick={clear}>
            Clear
          </button>
        </div>
      </form>

      {error ? (
        <div className="launch-assignment-intake__alert" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="launch-assignment-intake__notice" role="status">
          {notice}
        </div>
      ) : null}

      {session ? (
        <section className="launch-assignment-intake__review" aria-labelledby="assignment-review-title">
          <header>
            <div>
              <p>Draft only · {Math.round(session.draft.confidence * 100)}% extractor confidence</p>
              <h3 id="assignment-review-title">Unit {session.draft.unit || 'unknown'}</h3>
            </div>
            <span data-blocked={hardBlocked || undefined}>
              {hardBlocked ? 'Correction required' : 'Needs Los review'}
            </span>
          </header>

          <dl>
            <div>
              <dt>Sections</dt>
              <dd>{session.draft.sections.join(', ') || 'Not resolved'}</dd>
            </div>
            <div>
              <dt>Paint</dt>
              <dd>{session.draft.paintScope.description || session.draft.paintScope.state}</dd>
            </div>
            <div>
              <dt>Clean</dt>
              <dd>{session.draft.cleanScope.description || session.draft.cleanScope.state}</dd>
            </div>
          </dl>

          <blockquote>{session.draft.originalExcerpt || 'No excerpt available.'}</blockquote>
          <p>{session.draft.suggestedInterpretation}</p>

          {session.draft.uncertainties.length ? (
            <div className="launch-assignment-intake__uncertainties">
              <strong>Uncertainties to review</strong>
              <ul>
                {session.draft.uncertainties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {session.draft.validationConflicts.length ? (
            <div className="launch-assignment-intake__conflicts" role="alert">
              <strong>Correct before confirmation</strong>
              <ul>
                {session.draft.validationConflicts.map((item) => (
                  <li key={item.id}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {session.draft.sourceWarnings.length ? (
            <label className="launch-assignment-intake__acknowledgement">
              <input
                type="checkbox"
                checked={acknowledgeWarnings}
                onChange={(event) => setAcknowledgeWarnings(event.target.checked)}
              />
              I reviewed the untrusted-source and authority warnings.
            </label>
          ) : null}
          {session.draft.duplicateWarnings.length ? (
            <label className="launch-assignment-intake__acknowledgement">
              <input
                type="checkbox"
                checked={acknowledgeDuplicates}
                onChange={(event) => setAcknowledgeDuplicates(event.target.checked)}
              />
              I reviewed the duplicate draft warning.
            </label>
          ) : null}
          {session.draft.uncertainties.length ? (
            <label className="launch-assignment-intake__acknowledgement">
              <input
                type="checkbox"
                checked={acknowledgeUncertainties}
                onChange={(event) => setAcknowledgeUncertainties(event.target.checked)}
              />
              I reviewed the uncertainties and will not treat them as confirmed facts.
            </label>
          ) : null}
          {session.draft.occupancyAccessConflicts.length ? (
            <label className="launch-assignment-intake__acknowledgement">
              <input
                type="checkbox"
                checked={acknowledgeAccess}
                onChange={(event) => setAcknowledgeAccess(event.target.checked)}
              />
              I reviewed the occupancy/access restriction. This does not authorize entry.
            </label>
          ) : null}

          <div className="launch-assignment-intake__actions">
            <button type="button" onClick={confirm} disabled={hardBlocked}>
              Confirm personal proposal
            </button>
            <button type="button" className="secondary" onClick={resetReview}>
              Correct source
            </button>
          </div>
          <small>
            Confirmation creates a typed proposal only. It does not update AppData, authorize work, mark paper, or
            contact anyone.
          </small>
        </section>
      ) : null}
    </section>
  );
}
