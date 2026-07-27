import {
  proposalToolNameSchema,
  turnProposalSchema,
  type ProposalToolName,
  type TurnChatContext,
  type TurnProposal,
} from './contracts';

export interface CreateProposalInput {
  id?: string;
  toolName: ProposalToolName;
  title: string;
  exactSourceText: string;
  editableDraft: string;
  context: TurnChatContext;
  evidenceSourceIds?: string[];
  createdAt?: string;
}

const proposalId = () => `proposal-${crypto.randomUUID()}`;

export const createPendingProposal = (input: CreateProposalInput): TurnProposal =>
  turnProposalSchema.parse({
    id: input.id ?? proposalId(),
    toolName: proposalToolNameSchema.parse(input.toolName),
    title: input.title,
    exactSourceText: input.exactSourceText,
    editableDraft: input.editableDraft,
    status: 'pending',
    applied: false,
    createdAt: input.createdAt ?? new Date().toISOString(),
    context: input.context,
    evidenceSourceIds: input.evidenceSourceIds ?? [],
  });

export type ProposalReviewAction =
  | { type: 'edit'; text: string }
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'save-note' };

export const reviewProposal = (
  proposal: TurnProposal,
  action: ProposalReviewAction,
): TurnProposal => {
  if (proposal.status === 'rejected') return proposal;
  if (action.type === 'edit') {
    return turnProposalSchema.parse({ ...proposal, editableDraft: action.text, status: 'pending' });
  }
  if (action.type === 'approve') {
    return turnProposalSchema.parse({ ...proposal, status: 'approved', applied: false });
  }
  if (action.type === 'save-note') {
    return turnProposalSchema.parse({ ...proposal, status: 'saved-note', applied: false });
  }
  return turnProposalSchema.parse({ ...proposal, status: 'rejected', applied: false });
};
