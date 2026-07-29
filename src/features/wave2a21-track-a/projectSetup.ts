export const PROJECT_SETUP_STEPS = Object.freeze([
  { id: 'project', label: 'Project' },
  { id: 'role-trades', label: 'Role and trades' },
  { id: 'daily-defaults', label: 'Daily defaults' },
  { id: 'contacts', label: 'Property contacts' },
  { id: 'review', label: 'Review and activate' },
] as const);

export const clampProjectSetupStep = (step: number) => {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(PROJECT_SETUP_STEPS.length - 1, Math.trunc(step)));
};
