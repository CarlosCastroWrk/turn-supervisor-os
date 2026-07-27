import type {
  AssignmentAccessSignal,
  AssignmentExtractionCandidate,
  AssignmentExtractorProvider,
  AssignmentExtractorRequest,
  ExtractedTradeMention,
  ManualAssignmentFields,
} from './types';

const extractFirst = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? '';

const splitList = (value: string) =>
  value
    .split(/[,/&]+|\band\b/i)
    .map((item) => item.trim())
    .filter(Boolean);

const sectionsNamedInScope = (scopeText: string) => {
  const sections: string[] = [];
  if (/\bcommon(?:\s+area)?\b/i.test(scopeText)) sections.push('Common');
  for (const match of scopeText.matchAll(/\b([A-E])\b/gi)) {
    sections.push(match[1].toUpperCase());
  }
  return [...new Set(sections)];
};

const scopeAppliesBroadly = (scopeText: string) =>
  /\b(all|whole|entire|full)\b/i.test(scopeText);

const textFromSource = (request: AssignmentExtractorRequest) =>
  request.source.original.kind === 'text' ? request.source.original.text : '';

const inferSignals = (text: string): AssignmentAccessSignal[] => {
  const signals: AssignmentAccessSignal[] = [];
  if (/\boccupied\b/i.test(text)) signals.push('occupied-claim');
  if (/\brenewal\b/i.test(text)) signals.push('renewal-claim');
  if (/\bdo\s+not\s+enter\b|\bdon't\s+enter\b/i.test(text)) signals.push('do-not-enter-claim');
  if (/\b(access\s+blocked|no\s+access|cannot\s+access|can't\s+access)\b/i.test(text)) {
    signals.push('access-blocked-claim');
  }
  return [...new Set(signals)];
};

const tradeMention = (
  trade: string,
  scopeText: string | undefined,
  overallSections: string[],
): ExtractedTradeMention | undefined => {
  if (!scopeText?.trim()) return undefined;
  const explicitSections = sectionsNamedInScope(scopeText);
  return {
    trade,
    sections:
      explicitSections.length > 0
        ? explicitSections
        : scopeAppliesBroadly(scopeText)
          ? overallSections
          : [],
    scopeText: scopeText.trim(),
  };
};

const fieldsFromText = (text: string): ManualAssignmentFields => {
  const unit = extractFirst(text, /\b(?:unit|apartment|apt)\s*[:#=-]?\s*([a-z0-9._-]+)/i);
  const unitType = extractFirst(text, /\bunit\s*type\s*[:#=-]?\s*([^|\n;]+)/i);
  const sectionText = extractFirst(
    text,
    /\b(?:sections?|rooms?|bedrooms?|areas?)\s*[:#=-]?\s*([^|\n;]+)/i,
  );
  const paintScope = extractFirst(text, /\bpaint(?:ing)?\s*[:#=-]\s*([^|\n;]+)/i);
  const cleanScope = extractFirst(text, /\bclean(?:ing)?\s*[:#=-]\s*([^|\n;]+)/i);
  const genericTrade = extractFirst(text, /\b(?:trade|service)\s*[:#=-]\s*([^|\n;]+)/i);
  const otherTradeMentions =
    genericTrade && !/^(paint(?:ing)?|clean(?:ing)?)$/i.test(genericTrade)
      ? [genericTrade]
      : [];

  return {
    unit,
    ...(unitType ? { unitType } : {}),
    sections: sectionText ? splitList(sectionText) : [],
    ...(paintScope ? { paintScope } : {}),
    ...(cleanScope ? { cleanScope } : {}),
    ...(otherTradeMentions.length ? { otherTradeMentions } : {}),
    accessSignals: inferSignals(text),
  };
};

const candidateFromFields = (
  fields: ManualAssignmentFields,
  request: AssignmentExtractorRequest,
): AssignmentExtractionCandidate => {
  const sourceText = textFromSource(request);
  const sections = fields.sections.map((section) => section.trim()).filter(Boolean);
  const tradeMentions = [
    tradeMention('Paint', fields.paintScope, sections),
    tradeMention('Clean', fields.cleanScope, sections),
    ...(fields.otherTradeMentions ?? []).map((trade) => ({
      trade,
      sections,
      scopeText: trade,
    })),
  ].filter((mention): mention is ExtractedTradeMention => Boolean(mention));
  const scopeUncertainties = tradeMentions
    .filter(
      (mention) =>
        (mention.trade === 'Paint' || mention.trade === 'Clean') &&
        mention.sections.length === 0,
    )
    .map(
      (mention) =>
        `${mention.trade} scope did not name a specific section or clearly apply to the whole Unit.`,
    );
  const exactExcerpt =
    sourceText.trim().slice(0, 1_000) ||
    [
      `Unit ${fields.unit}`,
      fields.unitType ? `Unit type ${fields.unitType}` : '',
      sections.length ? `Sections ${sections.join(', ')}` : '',
      fields.paintScope ? `Paint ${fields.paintScope}` : '',
      fields.cleanScope ? `Clean ${fields.cleanScope}` : '',
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 1_000);

  return {
    unit: fields.unit.trim(),
    ...(fields.unitType?.trim() ? { unitType: fields.unitType.trim() } : {}),
    sectionMentions: sections,
    tradeMentions,
    originalExcerpt: exactExcerpt,
    confidence: request.source.entryPoint === 'enter-manually' ? 1 : 0.7,
    uncertainties: [...new Set([...(fields.uncertainties ?? []), ...scopeUncertainties])],
    accessSignals: [...new Set([...(fields.accessSignals ?? []), ...inferSignals(sourceText)])],
    suggestedInterpretation:
      fields.suggestedInterpretation?.trim() ||
      `Review Unit ${fields.unit || 'unknown'} as a personal Paint/Clean assignment draft.`,
    sensitiveMaterialDetected: [],
  };
};

export class ManualAssignmentExtractorProvider implements AssignmentExtractorProvider {
  readonly id = 'manual-assignment-extractor';
  readonly displayName = 'Manual assignment review';

  async extract(request: AssignmentExtractorRequest): Promise<AssignmentExtractionCandidate> {
    const fields = request.manualFields ?? fieldsFromText(textFromSource(request));
    return candidateFromFields(fields, request);
  }
}

export class MockAssignmentExtractorProvider implements AssignmentExtractorProvider {
  readonly id: string;
  readonly displayName: string;
  calls = 0;
  private readonly result: unknown;

  constructor(
    result: unknown,
    options?: {
      id?: string;
      displayName?: string;
    },
  ) {
    this.result = result;
    this.id = options?.id ?? 'mock-assignment-extractor';
    this.displayName = options?.displayName ?? 'Synthetic extractor';
  }

  async extract(): Promise<unknown> {
    this.calls += 1;
    return this.result;
  }
}
