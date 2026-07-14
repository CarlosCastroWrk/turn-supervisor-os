import type { AppView } from '../types';

export interface FieldPlaybookStep {
  title: string;
  detail: string;
}

export interface FieldPlaybook {
  id: string;
  title: string;
  when: string;
  outcome: string;
  safetyNote: string;
  steps: FieldPlaybookStep[];
  action: {
    label: string;
    view: AppView;
  };
}

export const fieldPlaybooks: FieldPlaybook[] = [
  {
    id: 'capture-confirm',
    title: 'Capture and confirm',
    when: 'When a field update happens',
    outcome: 'Turn one clear observation into reviewed records without silent changes.',
    safetyNote: 'Nothing reaches the board until Los approves the proposed Draft Actions.',
    steps: [
      {
        title: 'Name the fact',
        detail: 'Include the exact Unit or area, what changed, and what still needs attention.',
      },
      {
        title: 'Review the proposals',
        detail: 'Correct or reject anything uncertain before it becomes an operational record.',
      },
      {
        title: 'Verify the board',
        detail: 'Apply only accurate drafts, then open the target and confirm the result.',
      },
    ],
    action: { label: 'Open Capture', view: 'copilot' },
  },
  {
    id: 'handle-blocker',
    title: 'Handle a blocker',
    when: 'When work cannot move safely',
    outcome: 'Leave one visible issue with enough ownership and context for a real follow-up.',
    safetyNote: 'An Issue changes a Unit only when Los explicitly marks it as blocking.',
    steps: [
      {
        title: 'Confirm the scope',
        detail: 'Identify the Unit or shared area and record the observed blocker plainly.',
      },
      {
        title: 'Record the handoff',
        detail: 'Capture the current owner, present status, and the next follow-up you actually know.',
      },
      {
        title: 'Keep statuses explicit',
        detail: 'Resolve the Issue when the problem is handled; update the Unit separately when its field state changes.',
      },
    ],
    action: { label: 'Review Issues', view: 'issues' },
  },
  {
    id: 'close-day',
    title: 'Close the day',
    when: 'Before the details get fuzzy',
    outcome: 'Leave a reviewed daily record of movement, blockers, lessons, and tomorrow’s priorities.',
    safetyNote: 'Auto-draft fills only grounded empty sections; Los reviews and saves the Daily Log.',
    steps: [
      {
        title: 'Review today’s movement',
        detail: 'Check Home for recorded updates, open issues, and the Units still needing attention.',
      },
      {
        title: 'Draft from evidence',
        detail: 'Open Daily Log and use the grounded auto-draft only for sections that are still empty.',
      },
      {
        title: 'Edit, save, then report',
        detail: 'Correct the draft, save it, and open Reports only when the daily record is accurate.',
      },
    ],
    action: { label: 'Open Daily Log', view: 'daily' },
  },
];
