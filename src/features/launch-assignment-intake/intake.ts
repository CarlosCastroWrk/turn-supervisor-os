import { ZodError } from 'zod';
import {
  AssignmentExtractionCandidateSchema,
  AssignmentIntakeDraftSchema,
  AssignmentPersonalRecordProposalSchema,
} from './schemas';
import type {
  AssignmentAccessSignal,
  AssignmentConfirmationRequest,
  AssignmentConfirmationResult,
  AssignmentExtractorProvider,
  AssignmentIntakeDraft,
  AssignmentIntakeEntryPoint,
  AssignmentIntakeReviewSession,
  AssignmentIntakeReviewResult,
  AssignmentOccupancyAccessConflict,
  AssignmentSection,
  AssignmentSourceArtifact,
  AssignmentSourceMetadata,
  AssignmentSourceWarning,
  AssignmentTrade,
  AssignmentTradeScopeDraft,
  AssignmentValidationConflict,
  AssignmentValidationContext,
  ExtractedTradeMention,
  ManualAssignmentFields,
  RejectedAssignmentSource,
  SensitiveMaterialCode,
} from './types';

export const ASSIGNMENT_INTAKE_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');

const hashText = (value: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
};

const sourceMetadata = (source: AssignmentSourceArtifact): AssignmentSourceMetadata => ({
  id: source.id,
  entryPoint: source.entryPoint,
  label: source.label,
  mediaType: source.mediaType,
  sizeBytes: source.sizeBytes,
  capturedAt: source.capturedAt,
  untrusted: true,
  retention: 'transient-local-review-only',
});

const createSourceId = (label: string, capturedAt: string, sizeBytes: number) =>
  `assignment-source-${hashText(`${label}:${capturedAt}:${sizeBytes}`)}`;

const assertSourceSize = (sizeBytes: number) => {
  if (sizeBytes <= 0) throw new Error('Assignment source is empty.');
  if (sizeBytes > ASSIGNMENT_INTAKE_MAX_SOURCE_BYTES) {
    throw new Error('Assignment source must be 8 MB or smaller.');
  }
};

export const createTextAssignmentSource = (input: {
  entryPoint: Extract<AssignmentIntakeEntryPoint, 'paste-text' | 'enter-manually'>;
  text: string;
  label?: string;
  capturedAt?: string;
  id?: string;
}): AssignmentSourceArtifact => {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const label =
    input.label?.trim() ||
    (input.entryPoint === 'paste-text' ? 'Pasted assignment source' : 'Manual assignment entry');
  const bytes = new TextEncoder().encode(input.text);
  assertSourceSize(bytes.byteLength);

  return {
    id: input.id ?? createSourceId(label, capturedAt, bytes.byteLength),
    entryPoint: input.entryPoint,
    label,
    mediaType: 'text/plain',
    sizeBytes: bytes.byteLength,
    capturedAt,
    untrusted: true,
    retention: 'transient-local-review-only',
    original: {
      kind: 'text',
      text: input.text,
    },
  };
};

export const createBinaryAssignmentSource = (input: {
  entryPoint: Extract<
    AssignmentIntakeEntryPoint,
    'take-photo' | 'choose-image' | 'choose-file'
  >;
  bytes: Uint8Array | ArrayBuffer;
  label: string;
  mediaType?: string;
  capturedAt?: string;
  id?: string;
}): AssignmentSourceArtifact => {
  const originalBytes =
    input.bytes instanceof Uint8Array
      ? new Uint8Array(input.bytes)
      : new Uint8Array(input.bytes.slice(0));
  assertSourceSize(originalBytes.byteLength);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const label = input.label.trim() || 'Assignment source';

  return {
    id: input.id ?? createSourceId(label, capturedAt, originalBytes.byteLength),
    entryPoint: input.entryPoint,
    label,
    mediaType: input.mediaType?.trim() || 'application/octet-stream',
    sizeBytes: originalBytes.byteLength,
    capturedAt,
    untrusted: true,
    retention: 'transient-local-review-only',
    original: {
      kind: 'binary',
      bytes: originalBytes,
    },
  };
};

const textualSourceForScreening = (source: AssignmentSourceArtifact) => {
  if (source.original.kind === 'text') return `${source.label}\n${source.original.text}`;
  return source.label;
};

const sensitivePatterns: Array<{
  code: SensitiveMaterialCode;
  pattern: RegExp;
  message: string;
}> = [
  {
    code: 'signature',
    pattern: /\b(signature|signed\s+by|e-?signature)\b/i,
    message: 'Signatures and signed documents are not accepted.',
  },
  {
    code: 'w9-or-tax-form',
    pattern: /\b(w[\s-]?9|taxpayer\s+(?:id|identification)|tin\b)\b/i,
    message: 'W-9 and taxpayer records are not accepted.',
  },
  {
    code: 'paycard-or-payroll',
    pattern: /\b(pay\s*card|payroll|direct\s+deposit|routing\s+number)\b/i,
    message: 'Paycard, payroll, and payment records are not accepted.',
  },
  {
    code: 'access-credential',
    pattern: /\b(access|door|gate|alarm|key)\s*(?:code|pin|password|credential)\b/i,
    message: 'Access credentials and codes are not accepted.',
  },
  {
    code: 'tenant-sensitive',
    pattern:
      /\b(tenant|resident)\s+(?:name|email|phone|contact|lease)|\bssn\b|\bsocial\s+security\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}-\d{2}-\d{4}\b/i,
    message: 'Tenant-identifying or tenant-sensitive material is not accepted.',
  },
];

const screenSensitiveMaterial = (source: AssignmentSourceArtifact) => {
  const text = textualSourceForScreening(source);
  const matches = sensitivePatterns.filter(({ pattern }) => pattern.test(text));
  return {
    codes: [...new Set(matches.map(({ code }) => code))],
    messages: [...new Set(matches.map(({ message }) => message))],
  };
};

const rejectedSource = (
  source: AssignmentSourceArtifact,
  reasonCodes: SensitiveMaterialCode[],
  messages: string[],
  extractorInvoked: boolean,
): RejectedAssignmentSource => ({
  source: sourceMetadata(source),
  reasonCodes: [...new Set(reasonCodes)],
  messages: [...new Set(messages)],
  originalRetained: false,
  extractorInvoked,
  discardRequired: true,
});

const sourceText = (source: AssignmentSourceArtifact) =>
  source.original.kind === 'text' ? source.original.text : '';

const sourceWarnings = (source: AssignmentSourceArtifact): AssignmentSourceWarning[] => {
  const text = sourceText(source);
  const warnings: AssignmentSourceWarning[] = [];

  if (
    /\b(ignore|disregard|override|bypass)\b.{0,80}\b(system|instructions?|rules?|confirmation|safety)\b/is.test(
      text,
    )
  ) {
    warnings.push({
      id: `${source.id}:prompt-injection-language`,
      code: 'prompt-injection-language',
      message:
        'The source contains instruction-like text. It is treated only as untrusted assignment content.',
      acknowledgementRequired: true,
    });
  }

  if (
    /\b(pds|property|client|manager|supervisor)?\s*(approve(?:d)?|authoriz(?:e|ed)|released|payroll[-\s]?eligible)\b/i.test(
      text,
    )
  ) {
    warnings.push({
      id: `${source.id}:unverified-authority-claim`,
      code: 'unverified-authority-claim',
      message:
        'The source claims approval, release, or authorization. Turn OS cannot verify or apply that claim.',
      acknowledgementRequired: true,
    });
  }

  if (source.original.kind === 'binary') {
    warnings.push({
      id: `${source.id}:binary-source-manually-transcribed`,
      code: 'binary-source-manually-transcribed',
      message:
        'This binary source was preserved, but the Launch Candidate uses manual transcription instead of OCR.',
      acknowledgementRequired: true,
    });
  }

  return warnings;
};

const normalizeSection = (value: string): AssignmentSection | undefined => {
  const section = normalize(value).replace(/\s+/g, ' ');
  if (section === 'common' || section === 'common area' || section === 'comm') return 'Common';
  if (/^[a-e]$/.test(section)) return section.toUpperCase() as AssignmentSection;
  return undefined;
};

const normalizeTrade = (value: string): AssignmentTrade | undefined => {
  const trade = normalize(value);
  if (trade === 'paint' || trade === 'painting') return 'Paint';
  if (trade === 'clean' || trade === 'cleaning') return 'Clean';
  return undefined;
};

const unique = <T,>(values: T[]) => [...new Set(values)];

const conflict = (
  draftId: string,
  code: AssignmentValidationConflict['code'],
  message: string,
  value?: string,
): AssignmentValidationConflict => ({
  id: `${draftId}:${code}:${hashText(value ?? message)}`,
  code,
  message,
  severity: 'blocking',
  ...(value ? { value } : {}),
});

const scopeForTrade = (
  trade: AssignmentTrade,
  mentions: ExtractedTradeMention[],
  recognizedSections: ReturnType<typeof normalizeSection>[],
): { scope: AssignmentTradeScopeDraft; uncertainty?: string } => {
  const matching = mentions.filter((mention) => normalizeTrade(mention.trade) === trade);
  if (!matching.length) {
    return {
      scope: {
        state: 'not-mentioned',
        sections: [],
        description: '',
      },
    };
  }

  const explicitScopeSections = unique(
    matching
      .flatMap(({ scopeText }) => {
        const values: string[] = [];
        if (/\bcommon(?:\s+area)?\b/i.test(scopeText)) values.push('Common');
        for (const match of scopeText.matchAll(/\b([A-E])\b/gi)) {
          values.push(match[1]);
        }
        return values;
      })
      .map(normalizeSection)
      .filter((section): section is NonNullable<typeof section> => Boolean(section)),
  );
  const providerSections = unique(
    matching
      .flatMap((mention) => mention.sections)
      .map(normalizeSection)
      .filter((section): section is NonNullable<typeof section> => Boolean(section)),
  );
  const broadScope = matching.some(({ scopeText }) =>
    /\b(all|whole|entire|full)\b/i.test(scopeText),
  );
  const sections = explicitScopeSections.length
    ? explicitScopeSections
    : providerSections.length
      ? providerSections
      : broadScope
        ? unique(
        recognizedSections.filter(
          (section): section is NonNullable<typeof section> => Boolean(section),
        ),
          )
        : [];
  const scopeIsUncertain =
    matching.some((mention) => /\b(unclear|unknown|verify|maybe)\b/i.test(mention.scopeText)) ||
    sections.length === 0;

  return {
    scope: {
      state: scopeIsUncertain ? 'uncertain' : 'included',
      sections,
      description: matching.map((mention) => mention.scopeText).filter(Boolean).join(' · '),
    },
    ...(sections.length === 0
      ? {
          uncertainty: `${trade} scope did not name a specific section or clearly apply to the whole Unit.`,
        }
      : {}),
  };
};

const accessMessage = (signal: AssignmentAccessSignal) => {
  switch (signal) {
    case 'occupied-claim':
      return 'The source indicates an occupied room or Unit. This does not authorize entry.';
    case 'renewal-claim':
      return 'The source indicates a renewal. This does not authorize entry or work.';
    case 'do-not-enter-claim':
      return 'The source says do not enter. Keep the restriction visible and verify the assignment.';
    case 'access-blocked-claim':
      return 'The source indicates blocked access. Verify ownership and the next action.';
  }
};

const inferAccessSignalsFromText = (text: string): AssignmentAccessSignal[] => {
  const signals: AssignmentAccessSignal[] = [];
  if (/\boccupied\b/i.test(text)) signals.push('occupied-claim');
  if (/\brenewal\b/i.test(text)) signals.push('renewal-claim');
  if (/\bdo\s+not\s+enter\b|\bdon't\s+enter\b/i.test(text)) signals.push('do-not-enter-claim');
  if (/\b(access\s+blocked|no\s+access|cannot\s+access|can't\s+access)\b/i.test(text)) {
    signals.push('access-blocked-claim');
  }
  return unique(signals);
};

const buildDraft = (
  source: AssignmentSourceArtifact,
  candidate: ReturnType<typeof AssignmentExtractionCandidateSchema.parse>,
  context: AssignmentValidationContext,
): AssignmentIntakeDraft => {
  const draftId = `assignment-draft-${hashText(`${source.id}:${candidate.unit}:${candidate.originalExcerpt}`)}`;
  const validationConflicts: AssignmentValidationConflict[] = [];
  const knownUnit = context.knownUnits.find(
    (unit) => normalize(unit.unit) === normalize(candidate.unit),
  );

  if (!candidate.unit.trim()) {
    validationConflicts.push(conflict(draftId, 'missing-unit', 'A Unit is required.'));
  } else if (!knownUnit) {
    validationConflicts.push(
      conflict(draftId, 'unknown-unit', `Unit ${candidate.unit} is not in the reviewed Unit list.`, candidate.unit),
    );
  }

  if (
    knownUnit?.unitType &&
    candidate.unitType &&
    normalize(knownUnit.unitType) !== normalize(candidate.unitType)
  ) {
    validationConflicts.push(
      conflict(
        draftId,
        'unit-type-mismatch',
        `Unit type “${candidate.unitType}” conflicts with the reviewed type “${knownUnit.unitType}”.`,
        candidate.unitType,
      ),
    );
  }

  const rawSectionMentions = unique([
    ...candidate.sectionMentions,
    ...candidate.tradeMentions.flatMap((mention) => mention.sections),
  ]);
  const normalizedSections = rawSectionMentions.map(normalizeSection);
  const recognizedSections = unique(
    normalizedSections.filter(
      (section): section is NonNullable<typeof section> => Boolean(section),
    ),
  );

  if (!rawSectionMentions.length) {
    validationConflicts.push(
      conflict(draftId, 'missing-section', 'At least one Unit section is required.'),
    );
  }

  rawSectionMentions.forEach((section, index) => {
    const normalizedSection = normalizedSections[index];
    if (!normalizedSection) {
      validationConflicts.push(
        conflict(
          draftId,
          'unknown-section',
          `Section “${section}” is not a supported Common/A–E section.`,
          section,
        ),
      );
      return;
    }
    if (knownUnit && !knownUnit.sections.includes(normalizedSection)) {
      validationConflicts.push(
        conflict(
          draftId,
          'unknown-section',
          `Section ${normalizedSection} is not applicable to Unit ${knownUnit.unit}.`,
          normalizedSection,
        ),
      );
    }
  });

  const allowedTrades = context.allowedTrades ?? ['Paint', 'Clean'];
  candidate.tradeMentions.forEach((mention) => {
    const trade = normalizeTrade(mention.trade);
    if (!trade || !allowedTrades.includes(trade)) {
      validationConflicts.push(
        conflict(
          draftId,
          'unknown-trade',
          `Trade “${mention.trade}” is outside this Paint/Clean intake.`,
          mention.trade,
        ),
      );
    }
  });

  if (
    source.original.kind === 'text' &&
    candidate.originalExcerpt &&
    !source.original.text.includes(candidate.originalExcerpt)
  ) {
    validationConflicts.push(
      conflict(
        draftId,
        'source-excerpt-mismatch',
        'The extracted excerpt does not occur in the preserved source.',
      ),
    );
  }

  const duplicateWarnings = (context.existingDraftUnits ?? [])
    .filter((unit) => normalize(unit) === normalize(candidate.unit))
    .map(() => `Unit ${candidate.unit} already has an assignment intake draft. Review both sources.`);

  const accessSignals = unique([
    ...candidate.accessSignals,
    ...inferAccessSignalsFromText(sourceText(source)),
  ]);
  const occupancyAccessConflicts: AssignmentOccupancyAccessConflict[] = accessSignals.map(
    (signal) => ({
      id: `${draftId}:access:${signal}`,
      signal,
      message: accessMessage(signal),
      acknowledgementRequired: true,
    }),
  );
  const paintScope = scopeForTrade('Paint', candidate.tradeMentions, normalizedSections);
  const cleanScope = scopeForTrade('Clean', candidate.tradeMentions, normalizedSections);

  return AssignmentIntakeDraftSchema.parse({
    id: draftId,
    sourceId: source.id,
    unit: candidate.unit,
    ...(candidate.unitType ? { unitType: candidate.unitType } : {}),
    sections: recognizedSections,
    paintScope: paintScope.scope,
    cleanScope: cleanScope.scope,
    originalExcerpt: candidate.originalExcerpt,
    confidence: candidate.confidence,
    uncertainties: unique(
      [
        ...candidate.uncertainties,
        paintScope.uncertainty,
        cleanScope.uncertainty,
      ].filter((item): item is string => Boolean(item)),
    ),
    duplicateWarnings,
    occupancyAccessConflicts,
    sourceWarnings: sourceWarnings(source),
    validationConflicts,
    suggestedInterpretation: candidate.suggestedInterpretation,
    authority: 'none',
    writesOperationalState: false,
    explicitConfirmationRequired: true,
  });
};

const zodIssues = (error: ZodError) =>
  error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });

export const createAssignmentIntakeReview = async (input: {
  source: AssignmentSourceArtifact;
  extractor: AssignmentExtractorProvider;
  context: AssignmentValidationContext;
  manualFields?: ManualAssignmentFields;
}): Promise<AssignmentIntakeReviewResult> => {
  const preflight = screenSensitiveMaterial(input.source);
  if (preflight.codes.length) {
    return {
      status: 'rejected',
      rejection: rejectedSource(
        input.source,
        preflight.codes,
        preflight.messages,
        false,
      ),
    };
  }

  const rawCandidate = await input.extractor.extract({
    source: input.source,
    ...(input.manualFields ? { manualFields: input.manualFields } : {}),
    trust: 'untrusted-source',
    task: 'extract-assignment-draft-only',
    permissions: {
      mayAuthorizeWork: false,
      mayWriteOperationalState: false,
      maySubmitForms: false,
    },
  });
  const parsedCandidate = AssignmentExtractionCandidateSchema.safeParse(rawCandidate);
  if (!parsedCandidate.success) {
    return {
      status: 'invalid-extraction',
      invalid: {
        kind: 'invalid-extraction',
        source: input.source,
        extractor: {
          providerId: input.extractor.id,
          providerName: input.extractor.displayName,
        },
        schemaIssues: zodIssues(parsedCandidate.error),
        writesOperationalState: false,
      },
    };
  }

  if (parsedCandidate.data.sensitiveMaterialDetected.length) {
    return {
      status: 'rejected',
      rejection: rejectedSource(
        input.source,
        [
          ...parsedCandidate.data.sensitiveMaterialDetected,
          'provider-detected-sensitive-material',
        ],
        ['The extractor detected prohibited sensitive material. Discard this source.'],
        true,
      ),
    };
  }

  return {
    status: 'review',
    session: {
      kind: 'assignment-intake-review',
      source: input.source,
      extractor: {
        providerId: input.extractor.id,
        providerName: input.extractor.displayName,
      },
      draft: buildDraft(input.source, parsedCandidate.data, input.context),
      paperRemainsAuthoritative: true,
    },
  };
};

const missingIds = (required: string[], acknowledged: string[]) => {
  const acknowledgedSet = new Set(acknowledged);
  return required.filter((id) => !acknowledgedSet.has(id));
};

export const createAssignmentConfirmationProposal = (
  session: AssignmentIntakeReviewSession,
  request: AssignmentConfirmationRequest,
): AssignmentConfirmationResult => {
  const errors: string[] = [];
  const draft = session.draft;

  if (!request.confirmedByLos) {
    errors.push('Los must explicitly confirm this personal-record proposal.');
  }
  if (draft.validationConflicts.length) {
    errors.push('Correct every unknown Unit, section, trade, or excerpt conflict before confirmation.');
  }

  const sourceWarningsMissing = missingIds(
    draft.sourceWarnings.map(({ id }) => id),
    request.acknowledgeSourceWarningIds ?? [],
  );
  if (sourceWarningsMissing.length) {
    errors.push('Review and acknowledge every untrusted-source warning.');
  }

  if (draft.duplicateWarnings.length && !request.acknowledgeDuplicateWarnings) {
    errors.push('Review and acknowledge the duplicate warning.');
  }

  if (draft.uncertainties.length && !request.acknowledgeUncertainties) {
    errors.push('Review and acknowledge every uncertainty.');
  }

  const occupancyMissing = missingIds(
    draft.occupancyAccessConflicts.map(({ id }) => id),
    request.acknowledgeOccupancyConflictIds ?? [],
  );
  if (occupancyMissing.length) {
    errors.push('Review and acknowledge every occupancy or access conflict.');
  }

  if (errors.length) return { ok: false, errors };

  const confirmedAt = request.confirmedAt ?? new Date().toISOString();
  const proposal = AssignmentPersonalRecordProposalSchema.parse({
    kind: 'assignment-personal-record-proposal',
    id: `${draft.id}:proposal-${hashText(confirmedAt)}`,
    draftId: draft.id,
    sourceId: session.source.id,
    confirmedAt,
    confirmedBy: 'Los',
    unit: draft.unit,
    ...(draft.unitType ? { unitType: draft.unitType } : {}),
    sections: draft.sections,
    paintScope: draft.paintScope,
    cleanScope: draft.cleanScope,
    originalExcerpt: draft.originalExcerpt,
    confidence: draft.confidence,
    uncertainties: draft.uncertainties,
    duplicateWarnings: draft.duplicateWarnings,
    occupancyAccessConflicts: draft.occupancyAccessConflicts,
    suggestedInterpretation: draft.suggestedInterpretation,
    scope: 'personal-record-proposal-only',
    authority: 'none',
    paperRemainsAuthoritative: true,
    requiresDeterministicApplication: true,
    writesOperationalState: false,
  });

  return { ok: true, proposal };
};

export const inspectAssignmentDraft = (value: unknown): AssignmentIntakeDraft =>
  AssignmentIntakeDraftSchema.parse(value);
