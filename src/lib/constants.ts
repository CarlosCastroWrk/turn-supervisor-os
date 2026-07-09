import type {
  AssignmentStatus,
  CrewTrade,
  IssueCategory,
  IssuePriority,
  IssueStatus,
  PhotoCategory,
  TrainingQuestionStatus,
  UnitWorkflowStatus,
  WorkStatus,
} from '../types';

export const UNIT_WORKFLOW_STATUSES: UnitWorkflowStatus[] = [
  'Not Started',
  'Access Blocked',
  'Trash Out Needed',
  'Trash Out Complete',
  'Paint Ready',
  'Painting',
  'Paint Complete',
  'Cleaning Ready',
  'Cleaning',
  'Cleaning Complete',
  'Maintenance Needed',
  'Maintenance In Progress',
  'Maintenance Complete',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
  'Hold / Blocked',
];

export const WORK_STATUSES: WorkStatus[] = [
  'Not Started',
  'Needed',
  'Ready',
  'In Progress',
  'Complete',
  'Blocked',
  'Rework Needed',
  'Not Applicable',
];

export const CREW_TRADES: CrewTrade[] = [
  'Painter',
  'Cleaner',
  'Labor',
  'Maintenance',
  'Flooring',
  'Supervisor',
  'Property staff',
  'Other',
];

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'Planned',
  'Confirmed',
  'Checked In',
  'In Progress',
  'Complete',
  'Delayed',
  'No Show',
  'Reassigned',
  'Cancelled',
];

export const ISSUE_CATEGORIES: IssueCategory[] = [
  'Paint',
  'Cleaning',
  'Maintenance',
  'Flooring',
  'Access',
  'Keys',
  'Materials',
  'Crew',
  'Safety',
  'Property manager',
  'Other',
];

export const ISSUE_PRIORITIES: IssuePriority[] = ['Low', 'Medium', 'High', 'Critical'];
export const ISSUE_STATUSES: IssueStatus[] = ['Open', 'In Progress', 'Waiting', 'Resolved', 'Closed'];
export const PHOTO_CATEGORIES: PhotoCategory[] = ['Before', 'During', 'After', 'Problem', 'Completed work', 'Other'];
export const TRAINING_STATUSES: TrainingQuestionStatus[] = ['Not Asked', 'Asked', 'Answered', 'Needs Follow-Up'];

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISODate(new Date());
export const localISODateFromDateTime = (dateTime: string) => {
  const parsed = new Date(dateTime);
  return Number.isNaN(parsed.getTime()) ? dateTime.slice(0, 10) : toISODate(parsed);
};
export const tomorrowISO = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toISODate(date);
};
export const nowISO = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

export const formatDate = (date: string) => {
  if (!date) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
};

export const formatTime = (dateTime: string) => {
  if (!dateTime) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(dateTime),
  );
};
