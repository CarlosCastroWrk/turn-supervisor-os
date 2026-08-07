import { AlertTriangle, Camera, ClipboardCheck, Clock3, FileText } from 'lucide-react';
import { useState } from 'react';
import type { AppNavigate } from '../lib/routing';
import type { UnitTimelineItem, UnitTimelineSource } from '../lib/unitTimeline';
import type { PhotoNote } from '../types';
import { Button } from './FormControls';
import { PhotoThumbnail } from './PhotoThumbnail';
import { Section } from './Section';
import { StatusBadge } from './StatusBadge';

interface UnitTimelineProps {
  items: UnitTimelineItem[];
  photos: PhotoNote[];
  saveFailed: boolean;
  onNavigate: AppNavigate;
}

type TimelineFilter = 'all' | 'notes' | 'photos' | 'issues' | 'drafts';

const filterLabels: Record<TimelineFilter, string> = {
  all: 'All',
  notes: 'Notes',
  photos: 'Photos',
  issues: 'Issues',
  drafts: 'Drafts',
};

const filterSources: Record<TimelineFilter, Set<UnitTimelineSource>> = {
  all: new Set(['unit_activity', 'unit_notes', 'photo', 'issue', 'draft_action']),
  notes: new Set(['unit_activity', 'unit_notes']),
  photos: new Set(['photo']),
  issues: new Set(['issue']),
  drafts: new Set(['draft_action']),
};

const sourceLabels: Record<UnitTimelineSource, string> = {
  unit_activity: 'Unit activity',
  unit_notes: 'Unit notes',
  photo: 'Photo',
  issue: 'Issue',
  draft_action: 'Draft Action',
};

const sourceIcons: Record<UnitTimelineSource, React.ElementType> = {
  unit_activity: Clock3,
  unit_notes: FileText,
  photo: Camera,
  issue: AlertTriangle,
  draft_action: ClipboardCheck,
};

const validTimestamp = (value: string) => Number.isFinite(Date.parse(value));

const formatTimestamp = (value: string) => {
  if (!validTimestamp(value)) return 'Time unavailable';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
  });
};

export function UnitTimeline({ items, photos, saveFailed, onNavigate }: UnitTimelineProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [expandedPhotoId, setExpandedPhotoId] = useState('');
  const visibleItems = items.filter((item) => filterSources[filter].has(item.source));

  const filterCount = (nextFilter: TimelineFilter) =>
    items.filter((item) => filterSources[nextFilter].has(item.source)).length;

  return (
    <Section
      title="Unit history"
      kicker="Partial history from current app records"
      className="unit-timeline-section"
    >
      {saveFailed ? (
        <div className="unit-timeline-save-warning" role="alert">
          <AlertTriangle size={19} aria-hidden="true" />
          <p>Current changes may still be in memory. Retry the local save before relying on this history.</p>
        </div>
      ) : null}

      <div className="unit-timeline-filters" role="tablist" aria-label="Unit history sources">
        {(Object.keys(filterLabels) as TimelineFilter[]).map((item) => (
          <button
            key={item}
            className={filter === item ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
          >
            {filterLabels[item]} <strong>{filterCount(item)}</strong>
          </button>
        ))}
      </div>

      <div className="unit-timeline">
        {visibleItems.map((item) => {
          const Icon = sourceIcons[item.source];
          const action = item.action;
          const photo = action.kind === 'photo'
            ? photos.find((candidate) => candidate.id === action.photoId)
            : undefined;
          return (
            <article className={`unit-timeline-item unit-timeline-item--${item.source}`} key={item.id}>
              <div className="unit-timeline-item__marker"><Icon size={17} aria-hidden="true" /></div>
              <div className="unit-timeline-item__body">
                <div className="unit-timeline-item__meta">
                  <span className="quiet-label">{sourceLabels[item.source]}</span>
                  {item.sourceStatus && item.source !== 'unit_notes' ? <StatusBadge value={item.sourceStatus} size="sm" /> : null}
                </div>
                <h3>{item.label}</h3>
                {item.source === 'unit_notes' && item.sourceStatus ? (
                  <p className="unit-timeline-limitation">{item.sourceStatus}</p>
                ) : null}
                <p>{item.wording}</p>
                <div className="unit-timeline-item__context">
                  {validTimestamp(item.timestamp) ? (
                    <time dateTime={item.timestamp}>{formatTimestamp(item.timestamp)}</time>
                  ) : (
                    <span>Time unavailable</span>
                  )}
                  {item.saveLabel ? <span>{item.saveLabel}</span> : null}
                  {item.currentStateUpdatedAt ? (
                    <span>Current state updated {formatTimestamp(item.currentStateUpdatedAt)}</span>
                  ) : null}
                </div>

                {action.kind === 'open_issue' ? (
                  <Button onClick={() => onNavigate('issues', undefined, { issueId: action.issueId })}>
                    Open Issue: {item.label}
                  </Button>
                ) : null}
                {action.kind === 'open_review' ? (
                  <Button onClick={() => onNavigate('review')}>
                    Open Draft Action in Review
                  </Button>
                ) : null}
                {action.kind === 'photo' && photo ? (
                  <div className="unit-timeline-photo">
                    <Button
                      aria-expanded={expandedPhotoId === photo.id}
                      onClick={() => setExpandedPhotoId((current) => current === photo.id ? '' : photo.id)}
                    >
                      {expandedPhotoId === photo.id ? 'Hide' : 'View'} photo: {item.wording}
                    </Button>
                    {expandedPhotoId === photo.id ? <PhotoThumbnail photo={photo} /> : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}

        {visibleItems.length === 0 ? (
          <p className="unit-timeline-empty">No personal activity is linked to this Unit yet.</p>
        ) : null}
      </div>
    </Section>
  );
}
