import { useState } from 'react';
import {
  GroupedInsetRow,
  GroupedInsetSection,
  NativeDetailShell,
} from '../wave2a1-native/track-b';
import type { ClosedTurnSummary } from '../wave2a2-core/closedTurn';

// Home after Close Turn: the saved-turn card. Everything is browsable, nothing
// is editable — the host write gate enforces that; this screen just makes the
// sealed state obvious and gives the two doors (board, crews) plus Reopen.

const friendlyDay = (isoDay: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' })
    .format(new Date(year, month - 1, day));
};

export interface ClosedTurnHomeProps {
  summary: ClosedTurnSummary;
  onOpenBoard: () => void;
  onOpenCrews: () => void;
  onReopen: () => void;
  onStartNewTurn: () => void;
  onEnterDemo: () => void;
}

export function ClosedTurnHome({
  onEnterDemo,
  onOpenBoard,
  onOpenCrews,
  onReopen,
  onStartNewTurn,
  summary,
}: ClosedTurnHomeProps) {
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const dates = summary.startDate && summary.endDate
    ? `${friendlyDay(summary.startDate)} – ${friendlyDay(summary.endDate)}`
    : 'Dates not recorded';
  return (
    <NativeDetailShell
      description="Sealed read-only. Every board, unit, crew, and pay week is still here to look at — nothing can change by accident."
      eyebrow="Saved turn"
      statusLabel="🔒 Read only"
      title={summary.name}
    >
      <GroupedInsetSection label="The turn">
        <GroupedInsetRow label="Dates" value={dates} detail={`${summary.dayCount} working day${summary.dayCount === 1 ? '' : 's'}`} />
        <GroupedInsetRow label="Units worked" value={String(summary.unitCount)} />
        <GroupedInsetRow
          label="Rooms released"
          value={`Paint ${summary.paintRoomsReleased} · Clean ${summary.cleanRoomsReleased}`}
        />
        <GroupedInsetRow
          label="Rooms reported done"
          value={`Paint ${summary.paintRoomsDone} · Clean ${summary.cleanRoomsDone}`}
          detail="Pay basis — first confirmed report per crew, room, and round"
        />
        {summary.paintTypeLine ? (
          <GroupedInsetRow label="Paint tasks" value={summary.paintTypeLine} />
        ) : null}
        {summary.paintCrews.length > 0 ? (
          <GroupedInsetRow label="Paint crews" value={summary.paintCrews.join(', ')} />
        ) : null}
        {summary.cleanCrews.length > 0 ? (
          <GroupedInsetRow label="Clean crews" value={summary.cleanCrews.join(', ')} />
        ) : null}
      </GroupedInsetSection>
      <GroupedInsetSection
        label="Look around"
        footer="Browsing is open — taps that would change the record show a reminder instead."
      >
        <GroupedInsetRow
          detail="Every unit exactly as the turn ended"
          label="Open the TurnBoard"
          onActivate={onOpenBoard}
        />
        <GroupedInsetRow
          detail="Crew boards, pay weeks, and packets"
          label="Crews and pay"
          onActivate={onOpenCrews}
        />
      </GroupedInsetSection>
      <GroupedInsetSection
        label="What's next"
        footer="This saved turn stays sealed either way."
      >
        <GroupedInsetRow
          detail="Set up the next property from scratch"
          label="Start a new turn"
          onActivate={onStartNewTurn}
        />
        <GroupedInsetRow
          detail="Practice or show the app on a fake tower"
          label="Enter the Demo Turn"
          onActivate={onEnterDemo}
        />
      </GroupedInsetSection>
      <GroupedInsetSection
        label="Need to work again?"
        footer="Reopening makes the turn fully live — releases, crews, and payroll can change again. You can re-seal anytime."
      >
        {confirmingReopen ? (
          <GroupedInsetRow
            danger
            detail="This makes the record editable again"
            label={`Yes — reopen ${summary.name}`}
            onActivate={() => {
              setConfirmingReopen(false);
              onReopen();
            }}
          />
        ) : (
          <GroupedInsetRow
            detail="More work came in? Open it back up"
            label="Reopen this turn…"
            onActivate={() => setConfirmingReopen(true)}
          />
        )}
        {confirmingReopen ? (
          <GroupedInsetRow label="Never mind" onActivate={() => setConfirmingReopen(false)} />
        ) : null}
      </GroupedInsetSection>
    </NativeDetailShell>
  );
}
