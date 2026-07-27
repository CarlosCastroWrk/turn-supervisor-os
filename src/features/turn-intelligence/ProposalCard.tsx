import { Check, FileText, Pencil, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ProposalReviewAction } from './proposals';
import type { TurnProposal } from './contracts';

interface ProposalCardProps {
  proposal: TurnProposal;
  onReview(action: ProposalReviewAction): void;
}

const statusLabel: Record<TurnProposal['status'], string> = {
  pending: 'Needs your review',
  approved: 'Approved proposal — not applied',
  rejected: 'Rejected',
  'saved-note': 'Save-note review state — not persisted',
};

export function ProposalCard({ proposal, onReview }: ProposalCardProps) {
  const [draft, setDraft] = useState(proposal.editableDraft);
  useEffect(() => setDraft(proposal.editableDraft), [proposal.editableDraft]);
  const locked = proposal.status === 'rejected';

  return (
    <article className={`ti-proposal ti-proposal--${proposal.status}`} aria-label={proposal.title}>
      <header>
        <span><ShieldCheck size={16} aria-hidden="true" /> Proposal only</span>
        <strong>{statusLabel[proposal.status]}</strong>
      </header>
      <h3>{proposal.title}</h3>
      <label>
        Editable draft
        <textarea
          aria-label={`Edit ${proposal.title}`}
          disabled={locked}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== proposal.editableDraft && draft.trim()) onReview({ type: 'edit', text: draft });
          }}
          value={draft}
        />
      </label>
      <details>
        <summary>Exact source wording</summary>
        <p>{proposal.exactSourceText}</p>
      </details>
      <p className="ti-proposal__safety">Nothing here changes paper, a Unit, approval, payroll, or an external message.</p>
      {!locked ? (
        <div className="ti-proposal__actions">
          <button type="button" onClick={() => onReview({ type: 'approve' })}>
            <Check size={16} aria-hidden="true" /> Approve proposal
          </button>
          <button type="button" onClick={() => onReview({ type: 'edit', text: draft })}>
            <Pencil size={16} aria-hidden="true" /> Keep edit
          </button>
          <button type="button" onClick={() => onReview({ type: 'save-note' })}>
            <FileText size={16} aria-hidden="true" /> Mark save-note
          </button>
          <button className="is-danger" type="button" onClick={() => onReview({ type: 'reject' })}>
            <X size={16} aria-hidden="true" /> Reject
          </button>
        </div>
      ) : null}
    </article>
  );
}
