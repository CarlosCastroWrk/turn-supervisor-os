import type { AssignmentStatus, IssuePriority, IssueStatus, UnitWorkflowStatus, WorkStatus } from '../types';

type BadgeValue = AssignmentStatus | IssuePriority | IssueStatus | UnitWorkflowStatus | WorkStatus | string;

const getTone = (value: BadgeValue) => {
  if (['Ready', 'Complete', 'Resolved', 'Closed', 'Answered'].includes(value)) {
    return 'success';
  }

  if (['Critical', 'High', 'Access Blocked', 'Hold / Blocked', 'Blocked', 'No Show'].includes(value)) {
    return 'danger';
  }

  if (['Medium', 'Waiting', 'Delayed', 'Rework Needed', 'Punch List', 'Needs Follow-Up'].includes(value)) {
    return 'warning';
  }

  if (['In Progress', 'Painting', 'Cleaning', 'Maintenance In Progress', 'Checked In', 'Confirmed', 'Asked'].includes(value)) {
    return 'info';
  }

  return 'neutral';
};

interface StatusBadgeProps {
  value: BadgeValue;
  size?: 'sm' | 'md';
}

export function StatusBadge({ value, size = 'md' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${getTone(value)} status-badge--${size}`}>{value}</span>;
}

