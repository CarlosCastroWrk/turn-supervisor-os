import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DraftActionCard } from '../components/DraftActionCard';
import { Button } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toast-context';
import { applyDraftAction, rejectDraftAction, updateDraftAction } from '../lib/actions';
import { localISODateFromDateTime, todayISO } from '../lib/constants';
import type { AppNavigate } from '../lib/routing';
import {
  buildReviewProjection,
  draftReviewTargetLabel,
  resolveDraftReviewTarget,
  type ReviewCategory,
  type ReviewProjectionItem,
  type ReviewSyncSnapshot,
  type ReviewTarget,
} from '../lib/reviewProjection';
import type { AppDataSaveStatus } from '../lib/storage';
import type { AppData, DraftAction } from '../types';

interface ReviewViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  saveStatus: AppDataSaveStatus;
  sync: ReviewSyncSnapshot;
  onNavigate: AppNavigate;
  onRetrySave: () => boolean;
}

type ReviewFilter = 'all' | 'drafts' | 'attention' | 'save_sync';

const categoryOrder: ReviewCategory[] = [
  'draft_action',
  'issue',
  'follow_up',
  'local_save',
  'sync',
  'capture_diagnostic',
];

const categoryLabels: Record<ReviewCategory, string> = {
  draft_action: 'Draft Actions',
  issue: 'Issues',
  follow_up: 'Follow-ups',
  local_save: 'Local save',
  sync: 'Sync',
  capture_diagnostic: 'Capture diagnostics',
};

const filterCategories: Record<ReviewFilter, Set<ReviewCategory>> = {
  all: new Set(categoryOrder),
  drafts: new Set(['draft_action']),
  attention: new Set(['issue', 'follow_up', 'capture_diagnostic']),
  save_sync: new Set(['local_save', 'sync']),
};

const filterLabels: Record<ReviewFilter, string> = {
  all: 'All',
  drafts: 'Drafts',
  attention: 'Attention',
  save_sync: 'Save / Sync',
};

const isStalePendingDraft = (draft: DraftAction) =>
  draft.status === 'pending' && localISODateFromDateTime(draft.createdAt) !== todayISO();

const formatTimestamp = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function ReviewView({
  data,
  setData,
  saveStatus,
  sync,
  onNavigate,
  onRetrySave,
}: ReviewViewProps) {
  const { notify } = useToast();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const items = useMemo(
    () => buildReviewProjection(data, saveStatus, sync),
    [data, saveStatus, sync],
  );
  const visibleItems = items.filter((item) => filterCategories[filter].has(item.category));

  const filterCount = (nextFilter: ReviewFilter) =>
    items.filter((item) => filterCategories[nextFilter].has(item.category)).length;

  const openTarget = (target: ReviewTarget | undefined) => {
    if (!target) return;
    if (target.view === 'unitDetail') {
      onNavigate('unitDetail', target.recordId);
      return;
    }
    if (target.view === 'issues' && target.recordId) {
      onNavigate('issues', undefined, { issueId: target.recordId });
      return;
    }
    onNavigate(target.view);
  };

  const afterDraftChange = (draft: DraftAction, status: DraftAction['status']) => {
    if (status === 'applied') {
      notify(`Applied "${draft.title}" to ${draftReviewTargetLabel(data, draft)}.`, { tone: 'success' });
      return;
    }
    if (status === 'rejected') {
      notify(`Rejected "${draft.title}". No personal record changed.`);
      return;
    }
    notify(`"${draft.title}" still needs review.`, { tone: 'error' });
  };

  const applyOneDraft = (draft: DraftAction, confirmConflict = false) => {
    setData((current) => {
      const prepared = confirmConflict
        ? updateDraftAction(current, draft.id, {
            payload: { ...draft.payload, explicitConflictConfirmation: true },
          })
        : current;
      const next = applyDraftAction(prepared, draft.id);
      const updated = next.draftActions.find((item) => item.id === draft.id);
      if (updated) window.queueMicrotask(() => afterDraftChange(draft, updated.status));
      return next;
    });
  };

  const rejectOneDraft = (draft: DraftAction) => {
    setData((current) => {
      const next = rejectDraftAction(current, draft.id);
      const updated = next.draftActions.find((item) => item.id === draft.id);
      if (updated) window.queueMicrotask(() => afterDraftChange(draft, updated.status));
      return next;
    });
  };

  const retryLocalSave = () => {
    const retryStarted = onRetrySave();
    notify(
      retryStarted ? 'Retrying the local save.' : 'There is no queued local save to retry.',
      { tone: retryStarted ? 'success' : 'error' },
    );
  };

  const itemAction = (item: ReviewProjectionItem) => {
    if (item.actionKind === 'retry_save') {
      return (
        <Button onClick={retryLocalSave}>
          <RefreshCw size={16} aria-hidden="true" />
          Retry local save
        </Button>
      );
    }
    if (item.actionKind === 'open_sync') {
      return (
        <Button onClick={() => onNavigate('sync')}>
          <ShieldCheck size={16} aria-hidden="true" />
          Open Sync &amp; diagnostics
        </Button>
      );
    }
    if (item.actionKind === 'open' && item.target) {
      return (
        <Button onClick={() => openTarget(item.target)}>
          Open {categoryLabels[item.category].replace(/s$/, '')}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="page page--review">
      <header className="field-page-header review-header">
        <div>
          <span className="quiet-label">Los&apos;s personal review queue</span>
          <h1>REVIEW</h1>
          <p>Different sources stay separate. Review here never changes the paper TurnBoard by itself.</p>
        </div>
        <Button onClick={() => onNavigate('units')}>Open TurnBoard</Button>
      </header>

      <div className="review-filter-row" role="tablist" aria-label="Review categories">
        {(Object.keys(filterLabels) as ReviewFilter[]).map((item) => (
          <button
            key={item}
            className={filter === item ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
          >
            <span>{filterLabels[item]}</span>
            <strong>{filterCount(item)}</strong>
          </button>
        ))}
      </div>

      <div className="review-sections">
        {categoryOrder.map((category) => {
          const categoryItems = visibleItems.filter((item) => item.category === category);
          if (categoryItems.length === 0) return null;
          return (
            <Section
              key={category}
              className={`review-section review-section--${category}`}
              title={categoryLabels[category]}
              kicker={`${categoryItems.length} ${categoryItems.length === 1 ? 'item' : 'items'}`}
            >
              <div className="review-list">
                {categoryItems.map((item) => {
                  if (item.category === 'draft_action' && item.sourceId) {
                    const draft = data.draftActions.find((candidate) => candidate.id === item.sourceId);
                    if (!draft) return null;
                    const target = resolveDraftReviewTarget(data, draft);
                    return (
                      <DraftActionCard
                        key={item.id}
                        compact
                        draft={draft}
                        isStale={isStalePendingDraft(draft)}
                        targetLabel={draftReviewTargetLabel(data, draft)}
                        onApply={() => applyOneDraft(draft)}
                        onConfirmConflictAndApply={() => applyOneDraft(draft, true)}
                        onOpenTarget={target ? () => openTarget(target) : undefined}
                        onReject={() => rejectOneDraft(draft)}
                        onSavePayload={(payload) =>
                          setData((current) => updateDraftAction(current, draft.id, { payload }))
                        }
                      />
                    );
                  }

                  const action = itemAction(item);
                  return (
                    <article className="review-item" key={item.id}>
                      <div className="review-item__header">
                        <span className="quiet-label">{categoryLabels[item.category]}</span>
                        <StatusBadge value={item.sourceStatus} size="sm" />
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                      {item.timestamp ? (
                        <time dateTime={item.timestamp}>{formatTimestamp(item.timestamp)}</time>
                      ) : null}
                      {action ? <div className="review-item__action">{action}</div> : null}
                    </article>
                  );
                })}
              </div>
            </Section>
          );
        })}
      </div>

      {visibleItems.length === 0 ? (
        <div className="review-empty">
          <ShieldCheck size={24} aria-hidden="true" />
          <p>Nothing needs your review. This does not mean the paper TurnBoard is complete.</p>
        </div>
      ) : null}
    </div>
  );
}
