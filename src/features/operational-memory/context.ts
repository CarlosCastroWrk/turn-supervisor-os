import {
  OperationalGroundingError,
  type AIMessageRecord,
  type OperationalMemoryRepositories,
  type OperationalScope,
  type OperationalSourceReference,
} from './contracts';
import type { ApprovedReadTools } from './readTools';

export interface GroundedContextFact {
  readonly id: string;
  readonly kind: 'property' | 'unit' | 'unit-history' | 'approved-knowledge';
  readonly text: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface OperationalContextBundle {
  readonly scope: OperationalScope;
  readonly question: string;
  readonly operationalFacts: readonly GroundedContextFact[];
  readonly conversationMessages: readonly (AIMessageRecord & { readonly operationalTruth: false })[];
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AssembleOperationalContextInput {
  readonly scope: OperationalScope;
  readonly question: string;
  readonly unitId?: string;
  readonly threadId?: string;
  readonly tools: ApprovedReadTools;
  readonly repositories: OperationalMemoryRepositories;
}

const assertGrounded = (fact: GroundedContextFact) => {
  if (fact.sourceRefs.length === 0) {
    throw new OperationalGroundingError(`Context fact ${fact.id} has no supporting source reference.`);
  }
};

const uniqueReferences = (facts: readonly GroundedContextFact[]) => {
  const references = new Map<string, OperationalSourceReference>();
  for (const fact of facts) {
    for (const source of fact.sourceRefs) references.set(`${source.kind}:${source.id}`, source);
  }
  return [...references.values()];
};

const assertResolvableSources = (
  scope: OperationalScope,
  facts: readonly GroundedContextFact[],
  repositories: OperationalMemoryRepositories,
) => {
  for (const source of uniqueReferences(facts)) {
    if (source.kind === 'source-document' && !repositories.sources.get(scope, source.id)) {
      throw new OperationalGroundingError(`Source document ${source.id} is missing from the scoped repository.`);
    }
    if (source.kind === 'operational-event' && !repositories.events.get(scope, source.id)) {
      throw new OperationalGroundingError(`Operational event ${source.id} is missing from the scoped repository.`);
    }
    if (source.kind === 'approved-knowledge' && !repositories.knowledge.get(scope, source.id)) {
      throw new OperationalGroundingError(`Approved knowledge ${source.id} is missing from the scoped repository.`);
    }
  }
};

export const assembleOperationalContext = (
  input: AssembleOperationalContextInput,
): OperationalContextBundle => {
  const property = input.tools.get_property_summary({ scope: input.scope, input: {} });
  const facts: GroundedContextFact[] = [{
    id: `property:${property.projectId}`,
    kind: 'property',
    text: `${property.propertyName}; ${property.unitCount} personal Unit records; ${property.openIssueCount} open personal issues.`,
    sourceRefs: property.sourceRefs,
  }];

  if (input.unitId) {
    const unit = input.tools.get_unit({ scope: input.scope, input: { unitId: input.unitId } });
    if (unit) {
      facts.push({
        id: `unit:${unit.id}`,
        kind: 'unit',
        text: `Unit ${unit.unitNumber}; ${unit.buildingLabel}; ${unit.floorLabel}. Legacy whole-Unit statuses are personal summaries, not section truth.`,
        sourceRefs: unit.sourceRefs,
      });
      for (const event of input.tools.get_unit_history({
        scope: input.scope,
        input: { unitId: unit.id },
      })) {
        facts.push({
          id: `history:${event.id}`,
          kind: 'unit-history',
          text: `${event.title}: ${event.wording}`,
          sourceRefs: event.sourceRefs,
        });
      }
    }
  }

  for (const knowledge of input.tools.get_approved_knowledge({
    scope: input.scope,
    input: { query: input.question },
  })) {
    facts.push({
      id: `knowledge:${knowledge.id}`,
      kind: 'approved-knowledge',
      text: knowledge.statement,
      sourceRefs: knowledge.sourceRefs,
    });
  }

  facts.forEach(assertGrounded);
  assertResolvableSources(input.scope, facts, input.repositories);
  const conversationMessages = input.threadId
    ? input.repositories.messages.list(input.scope).filter((message) => message.threadId === input.threadId)
    : [];

  return {
    scope: input.scope,
    question: input.question,
    operationalFacts: facts,
    conversationMessages,
    sourceRefs: uniqueReferences(facts),
  };
};
