export const PROJECT_SETUP_STEPS = Object.freeze([
  { id: 'property', label: 'Property' },
  { id: 'contacts-schedule', label: 'Contacts and schedule' },
  { id: 'property-roster', label: 'Property roster' },
  { id: 'crews-permissions', label: 'Crews and permissions' },
  { id: 'review-activate', label: 'Review and activate' },
] as const);

export const clampProjectSetupStep = (step: number) => {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(PROJECT_SETUP_STEPS.length - 1, Math.trunc(step)));
};
