import {
  CalendarDays,
  ChevronRight,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  filterTrackDActivity,
  TRACK_D_ACTIVITY_FILTERS,
  type TrackDActivityFilter,
  type TrackDActivityRecord,
} from './model';
import { TrackDPage } from './TrackDPrimitives';

export interface ActivitySurfaceProps {
  onBack?: () => void;
  onOpenRecord: (recordId: string) => void;
  records: readonly TrackDActivityRecord[];
  timeZone?: string;
}

const boundaryLabel: Record<
  TrackDActivityRecord['boundary'],
  string
> = {
  'personal-record': 'Personal record',
  'official-reference': 'Official reference only',
};

export function ActivitySurface({
  onBack,
  onOpenRecord,
  records,
  timeZone,
}: ActivitySurfaceProps) {
  const [filter, setFilter] = useState<TrackDActivityFilter>('all');
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => filterTrackDActivity(records, filter, query),
    [filter, query, records],
  );

  return (
    <TrackDPage
      description="Recorded personal history with explicit source and authority boundaries."
      onBack={onBack}
      statusLabel={`${visible.length} recorded item${visible.length === 1 ? '' : 's'}`}
      title="Activity"
    >
      <label className="w2a2d-search-field">
        <Search aria-hidden="true" size={20} />
        <span className="w2a2d-sr-only">Search Activity</span>
        <input
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search Unit, actor, action, or source"
          type="search"
          value={query}
        />
      </label>

      <div aria-label="Activity filters" className="w2a2d-filter-grid">
        {TRACK_D_ACTIVITY_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option.id}
            key={option.id}
            onClick={() => setFilter(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <section className="w2a2d-empty-state">
          <CalendarDays aria-hidden="true" size={26} />
          <h2>No recorded Activity matches</h2>
          <p>
            Proposals and unconfirmed model output are intentionally excluded.
          </p>
        </section>
      ) : (
        <ol className="w2a2d-activity-list">
          {visible.map((record) => (
            <li key={record.id}>
              <button
                className="w2a2d-activity-card"
                onClick={() => onOpenRecord(record.id)}
                type="button"
              >
                <span className="w2a2d-activity-card__time">
                  <strong>{formatTime(record.recordedAt, timeZone)}</strong>
                  <small>{formatDate(record.recordedAt, timeZone)}</small>
                </span>
                <span className="w2a2d-activity-card__body">
                  <span className="w2a2d-activity-card__actor">
                    <UserRound aria-hidden="true" size={16} />
                    {record.actor}
                  </span>
                  <strong>{record.summary}</strong>
                  <span className="w2a2d-activity-card__context">
                    {record.unitNumber ? `Unit ${record.unitNumber}` : 'No Unit'}
                    {record.trade ? ` · ${record.trade}` : ''}
                    {record.section ? ` · ${record.section}` : ''}
                  </span>
                  <span className="w2a2d-activity-card__meta">
                    <span>Source: {record.source}</span>
                    <span>
                      <ShieldCheck aria-hidden="true" size={14} />
                      {boundaryLabel[record.boundary]}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="w2a2d-activity-card__chevron"
                  size={20}
                />
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="w2a2d-boundary-note">
        Times show when Turn OS recorded the item. They do not invent when work
        occurred.
      </p>
    </TrackDPage>
  );
}

const formatDate = (value: string, timeZone?: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
};

const formatTime = (value: string, timeZone?: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not recorded';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
};
