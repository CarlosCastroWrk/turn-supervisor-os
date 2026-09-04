import type { TrackCState } from '../wave2a2-track-c/model';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
import { paintWorkTypeNote, trackCSectionLabel } from '../wave2a2-track-c/model';
import { projectTrackCUnitWork } from '../wave2a2-track-c/projections';
import { ROOM_STAGE_LABEL, roomStageOf, roomStageTone } from '../wave2a2-track-c/roomStatus';

// iOS-style peek: hold a unit or a chip on Home and a preview springs up —
// the rooms and their tasks for a unit, or the units behind a chip. Read-only;
// tap through to open, tap the scrim to dismiss. Animation lives in CSS and is
// reduced-motion-safe.

export type PeekTarget =
  | { kind: 'unit'; unitId: string }
  | { kind: 'queue'; label: string; unitIds: readonly string[] };

// Stage + label + tone all come from the ONE room-status module.

export const TurnPeek = ({
  target,
  state,
  onClose,
  onOpenUnit,
}: {
  target: PeekTarget | null;
  state: TrackCState;
  onClose: () => void;
  onOpenUnit: (unitId: string, trade?: 'paint' | 'clean') => void;
}) => {
  if (!target) return null;

  const unitBody = (unitId: string) => {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit) return null;
    const work = projectTrackCUnitWork(state, unitId)
      .filter((item) => item.release === 'released');
    const byTrade = (['paint', 'clean'] as const)
      .map((trade) => ({
        rooms: work
          .filter((item) => item.trade === trade)
          .sort((left, right) =>
            (left.section === 'common' ? '' : left.section)
              .localeCompare(right.section === 'common' ? '' : right.section)),
        trade,
      }))
      .filter((group) => group.rooms.length > 0);
    return (
      <>
        <h2>Unit {unit.unitNumber}</h2>
        {byTrade.length === 0 ? (
          <p className="lcc-peek__empty">Nothing released here yet.</p>
        ) : byTrade.map((group) => (
          <div className="lcc-peek__trade" key={group.trade}>
            <button
              className="lcc-peek__tradehead"
              onClick={() => onOpenUnit(unitId, group.trade)}
              type="button"
            >
              {group.trade === 'paint' ? 'Paint' : 'Clean'} →
            </button>
            {group.rooms.map((room) => {
              const stage = roomStageOf(room);
              const status = ROOM_STAGE_LABEL[stage];
              const note = group.trade === 'paint' ? paintWorkTypeNote(room.workType) : '';
              return (
                <div className="lcc-peek__room" key={`${room.trade}:${room.section}`}>
                  <strong>{trackCSectionLabel(room.section)}</strong>
                  <span className="lcc-peek__task">
                    {group.trade === 'clean' ? 'clean' : note || 'full paint'}
                  </span>
                  <span className={`lcc-peek__pill is-${roomStageTone(stage)}`}>{status}</span>
                </div>
              );
            })}
          </div>
        ))}
      </>
    );
  };

  const queueBody = (label: string, unitIds: readonly string[]) => {
    const rows = [...new Set(unitIds)]
      .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
      .sort((left, right) =>
        compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
    return (
      <>
        <h2>{label} · {rows.length}</h2>
        {rows.length === 0 ? (
          <p className="lcc-peek__empty">Nothing here right now.</p>
        ) : (
          <div className="lcc-peek__list">
            {rows.map((unit) => (
              <button
                className="lcc-peek__listrow"
                key={unit.id}
                onClick={() => onOpenUnit(unit.id)}
                type="button"
              >
                <strong>{unit.unitNumber}</strong>
                <span>{unit.unitType}</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="lcc-peek" role="dialog" aria-label="Preview">
      <button aria-label="Close preview" className="lcc-peek__scrim" onClick={onClose} type="button" />
      <div className="lcc-peek__card">
        {target.kind === 'unit'
          ? unitBody(target.unitId)
          : queueBody(target.label, target.unitIds)}
      </div>
    </div>
  );
};
