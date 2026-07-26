import { projectActivityEvents } from './activity.js';
import type { ModelApiCostReceipt, TurnContextSnapshot, UsageLedgerEvent } from './contracts.js';
import { summarizeModelApiCosts, summarizeUsageLedger } from './metrics.js';

export interface PersonalActivitySummary {
  version: 'jul28-personal-activity-v1';
  generatedAt: string;
  propertyScopeRef: string;
  paperAuthority: 'official-paper-turnboard';
  scopeCounts: {
    total: number;
    crewReportedComplete: number;
    needsLosInspection: number;
    callbacks: number;
    propertyWalkPending: number;
    propertyAccepted: number;
    needsPaperReview: number;
  };
  activityCounts: ReturnType<typeof projectActivityEvents>['countsByLayer'];
  memoryCandidateCounts: { pending: number; approved: number; rejected: number };
  usage: ReturnType<typeof summarizeUsageLedger>;
  modelApiCost: ReturnType<typeof summarizeModelApiCosts>;
  payroll: {
    availability: 'unavailable-not-inferred';
    note: string;
  };
}

export const buildPersonalActivitySummary = (
  snapshot: TurnContextSnapshot,
  usageEvents: UsageLedgerEvent[] = [],
  modelCostReceipts: ModelApiCostReceipt[] = [],
): PersonalActivitySummary => {
  const scopes = snapshot.units.flatMap((unit) => unit.scopes);
  const propertyScopeRef = snapshot.propertyScope.redactedRef;
  const activity = projectActivityEvents(
    snapshot.activityEvents.filter((event) => event.propertyScopeRef === propertyScopeRef),
  );
  const memoryCandidateCounts = { pending: 0, approved: 0, rejected: 0 };
  snapshot.memoryCandidates
    .filter((candidate) => candidate.propertyScope.redactedRef === propertyScopeRef)
    .forEach((candidate) => {
      memoryCandidateCounts[candidate.approvalStatus] += 1;
    });

  return {
    version: 'jul28-personal-activity-v1',
    generatedAt: snapshot.asOf,
    propertyScopeRef,
    paperAuthority: snapshot.paperAuthority,
    scopeCounts: {
      total: scopes.length,
      crewReportedComplete: scopes.filter((scope) => scope.crewExecution === 'crew-reported-complete').length,
      needsLosInspection: scopes.filter(
        (scope) =>
          scope.crewExecution === 'crew-reported-complete' && scope.losInspection === 'inspection-pending',
      ).length,
      callbacks: scopes.filter((scope) => ['callback-required', 'reinspection-pending'].includes(scope.losInspection))
        .length,
      propertyWalkPending: scopes.filter((scope) => scope.propertyWalk === 'walk-pending').length,
      propertyAccepted: scopes.filter((scope) => scope.propertyWalk === 'property-accepted').length,
      needsPaperReview: scopes.filter((scope) => scope.paperReconciliation === 'needs-paper-review').length,
    },
    activityCounts: activity.countsByLayer,
    memoryCandidateCounts,
    usage: summarizeUsageLedger(usageEvents.filter((event) => event.propertyScopeRef === propertyScopeRef)),
    modelApiCost: summarizeModelApiCosts(
      modelCostReceipts.filter((receipt) => receipt.propertyScopeRef === propertyScopeRef),
    ),
    payroll: {
      availability: 'unavailable-not-inferred',
      note: 'Turn OS does not calculate or infer payroll from personal activity.',
    },
  };
};

export const exportPersonalActivitySummary = (summary: PersonalActivitySummary) =>
  `${JSON.stringify(summary, null, 2)}\n`;
