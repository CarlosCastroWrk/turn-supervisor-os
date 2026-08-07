import type {
  TrackCState,
  TrackCWalkOutcome,
  TrackCWalkSession,
} from './model';

// Turns a completed walk into a text receipt Los can send the property
// contact straight after walking. Personal record only — the paper
// TurnBoard stays the official approval.

const sectionLabel = (section: string) =>
  section === 'common' ? 'Common' : `Room ${section}`;

const tradeLabel = (trade: string) => (trade === 'paint' ? 'Paint' : 'Clean');

const OUTCOME_WORDING: Record<TrackCWalkOutcome, string> = {
  accepted: 'accepted',
  'correction-requested': 'needs work',
  deferred: 'deferred',
  'not-walked': 'not walked',
};

export function buildWalkReceiptText(
  state: TrackCState,
  walk: TrackCWalkSession,
): string {
  const unitNumberById = new Map(
    state.units.map((unit) => [unit.id, unit.unitNumber]),
  );
  const endedAt = walk.endedAt ? new Date(walk.endedAt) : undefined;
  const when = endedAt
    ? `${endedAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${
        endedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
    : undefined;

  const groups = new Map<string, {
    accepted: string[];
    other: { section: string; wording: string }[];
    trade: string;
    unitNumber: string;
  }>();
  for (const outcome of walk.outcomes ?? []) {
    const key = `${outcome.target.unitId}:${outcome.target.trade}`;
    const group = groups.get(key) ?? {
      accepted: [],
      other: [],
      trade: outcome.target.trade,
      unitNumber: unitNumberById.get(outcome.target.unitId) ?? outcome.target.unitId,
    };
    if (outcome.outcome === 'accepted') {
      group.accepted.push(sectionLabel(outcome.target.section));
    } else {
      group.other.push({
        section: sectionLabel(outcome.target.section),
        wording: OUTCOME_WORDING[outcome.outcome],
      });
    }
    groups.set(key, group);
  }

  const lines = [...groups.values()].map((group) => {
    const total = group.accepted.length + group.other.length;
    const parts: string[] = [];
    if (group.other.length === 0) {
      parts.push(`all ${total} section${total === 1 ? '' : 's'} accepted`);
    } else {
      if (group.accepted.length > 0) {
        parts.push(`${group.accepted.length}/${total} accepted`);
      }
      for (const item of group.other) {
        parts.push(`${item.section} ${item.wording}`);
      }
    }
    return `Unit ${group.unitNumber} · ${tradeLabel(group.trade)}: ${parts.join(' · ')}.`;
  });

  return [
    `${state.propertyName} — walk receipt`,
    `Walked with ${walk.propertyContact}${when ? ` · ${when}` : ''}.`,
    ...lines,
    'Paper TurnBoard remains the official record.',
  ].join('\n');
}
