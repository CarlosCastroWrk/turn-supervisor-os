import type {
  OperationalFactProvenance,
  ScopeFactProvenance,
  TradeScopeSnapshot,
  TurnActivityEvent,
  TurnContextSnapshot,
  TurnSection,
  TurnTrade,
  TurnUnitSnapshot,
} from './contracts.js';
import { TURN_CONTEXT_SNAPSHOT_VERSION } from './contracts.js';
import { createMemoryCandidate } from './memory.js';

const AS_OF = '2026-07-28T18:00:00.000Z';

export const syntheticPropertyScope = {
  id: 'synthetic-property-jul28',
  label: 'Synthetic July 28 property',
  redactedRef: 'property-synthetic-01',
  dataClass: 'synthetic' as const,
};

const syntheticProvenance = (label: string, evidenceRef: string): OperationalFactProvenance => ({
  sourceKind: 'synthetic-fixture',
  confidence: 'fixture-only',
  label,
  recordedAt: AS_OF,
  evidenceRef,
});

const syntheticScopeProvenance = (
  unitRef: string,
  section: TurnSection,
  trade: TurnTrade,
): ScopeFactProvenance => {
  const scopeRef = `${unitRef}-${section}-${trade}`.toLowerCase();
  return {
    authorization: syntheticProvenance('Synthetic authorization fixture', `fixture://${scopeRef}/authorization`),
    access: syntheticProvenance('Synthetic access fixture', `fixture://${scopeRef}/access`),
    'crew-execution': syntheticProvenance('Synthetic crew fixture', `fixture://${scopeRef}/crew-execution`),
    'los-inspection': syntheticProvenance('Synthetic inspection fixture', `fixture://${scopeRef}/los-inspection`),
    'property-walk': syntheticProvenance('Synthetic property-walk fixture', `fixture://${scopeRef}/property-walk`),
    'paper-reconciliation': syntheticProvenance(
      'Synthetic paper-reconciliation fixture',
      `fixture://${scopeRef}/paper-reconciliation`,
    ),
  };
};

const scope = (
  unitRef: string,
  section: TurnSection,
  trade: TurnTrade,
  patch: Partial<TradeScopeSnapshot> = {},
): TradeScopeSnapshot => ({
  scopeId: `${unitRef}-${section}-${trade}`.toLowerCase(),
  unitRef,
  section,
  trade,
  authorization: 'released',
  access: 'accessible',
  crewExecution: 'assigned',
  losInspection: 'inspection-pending',
  propertyWalk: 'walk-not-ready',
  paperReconciliation: 'needs-paper-review',
  provenance: syntheticScopeProvenance(unitRef, section, trade),
  activeCrewClaimCount: 1,
  assignmentEpisodeRefs: [`assignment-${unitRef}-${section}-${trade}`.toLowerCase()],
  lastChangedAt: AS_OF,
  ...patch,
});

const unit = (unitRef: string, applicableSections: TurnSection[], scopes: TradeScopeSnapshot[]): TurnUnitSnapshot => ({
  unitRef,
  applicableSections,
  scopes,
});

const activity = (
  id: string,
  eventType: TurnActivityEvent['eventType'],
  unitRef: string,
  section: TurnSection,
  trade: TurnTrade,
  occurredAt: string,
): TurnActivityEvent => ({
  id,
  propertyScopeRef: syntheticPropertyScope.redactedRef,
  eventType,
  unitRef,
  section,
  trade,
  occurredAt,
  source: 'synthetic-fixture',
});

export const syntheticTurnContextSnapshot: TurnContextSnapshot = {
  version: TURN_CONTEXT_SNAPSHOT_VERSION,
  snapshotId: 'snapshot-jul28-synthetic',
  propertyScope: syntheticPropertyScope,
  asOf: AS_OF,
  paperAuthority: 'official-paper-turnboard',
  payrollAvailability: 'unavailable-not-inferred',
  coverage: {
    scope: 'property-wide',
    status: 'complete',
    includedUnitRefs: ['602', '603', '604', '706', '1305'],
    provenance: syntheticProvenance('Complete synthetic fixture coverage', 'fixture://snapshot-jul28-synthetic/coverage'),
  },
  units: [
    unit('602', ['A'], [
      scope('602', 'A', 'Paint', {
        assignmentEpisodeRefs: ['assignment-602-a-paint-original', 'assignment-602-a-paint-added-scope'],
      }),
      scope('602', 'A', 'Clean', {
        crewExecution: 'crew-reported-complete',
        losInspection: 'callback-required',
      }),
    ]),
    unit('603', ['C'], [
      scope('603', 'C', 'Paint', {
        access: 'occupied-or-restricted',
        crewExecution: 'crew-reported-complete',
        losInspection: 'inspection-pending',
      }),
    ]),
    unit('604', ['C'], [
      scope('604', 'C', 'Paint', {
        authorization: 'assignment-conflict',
        access: 'occupied-or-restricted',
      }),
    ]),
    unit('706', ['A'], [
      scope('706', 'A', 'Paint', {
        authorization: 'assignment-conflict',
        activeCrewClaimCount: 2,
        assignmentEpisodeRefs: ['assignment-706-a-claim-1', 'assignment-706-a-claim-2'],
      }),
    ]),
    unit('1305', ['Common', 'B'], [
      scope('1305', 'B', 'Paint', {
        crewExecution: 'crew-reported-complete',
        losInspection: 'los-passed',
        propertyWalk: 'walk-pending',
      }),
      scope('1305', 'B', 'Clean', {
        crewExecution: 'crew-reported-complete',
        losInspection: 'passed-after-callback',
        propertyWalk: 'walk-pending',
      }),
      scope('1305', 'Common', 'Clean', {
        crewExecution: 'working',
        losInspection: 'inspection-pending',
        propertyWalk: 'walk-not-ready',
      }),
    ]),
  ],
  activityEvents: [
    activity('event-602-release', 'assignment-released', '602', 'A', 'Paint', '2026-07-28T13:00:00.000Z'),
    activity('event-602-added', 'assignment-scope-added', '602', 'A', 'Paint', '2026-07-28T14:00:00.000Z'),
    activity('event-603-complete', 'crew-reported-complete', '603', 'C', 'Paint', '2026-07-28T14:30:00.000Z'),
    activity('event-603-access', 'access-restriction-recorded', '603', 'C', 'Paint', '2026-07-28T14:35:00.000Z'),
    activity('event-604-release', 'assignment-released', '604', 'C', 'Paint', '2026-07-28T15:00:00.000Z'),
    activity('event-604-conflict', 'assignment-conflict-recorded', '604', 'C', 'Paint', '2026-07-28T15:05:00.000Z'),
    activity('event-604-access', 'access-restriction-recorded', '604', 'C', 'Paint', '2026-07-28T15:06:00.000Z'),
    activity('event-1305-paint-pass', 'los-inspection-passed', '1305', 'B', 'Paint', '2026-07-28T16:00:00.000Z'),
    activity('event-1305-walk', 'property-walk-pending', '1305', 'B', 'Paint', '2026-07-28T16:05:00.000Z'),
  ],
  memoryCandidates: [
    createMemoryCandidate({
      id: 'memory-candidate-synthetic-1',
      propertyScope: syntheticPropertyScope,
      statement: 'A property-walk result must be recorded manually.',
      source: {
        kind: 'synthetic-fixture',
        label: 'July 28 deterministic test fixture',
        sourceDate: '2026-07-28',
      },
      confidence: 1,
      capturedAt: AS_OF,
    }),
  ],
};
