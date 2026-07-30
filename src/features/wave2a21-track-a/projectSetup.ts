export const PROJECT_SETUP_STEPS = Object.freeze([
  { id: 'property', label: 'Property' },
  { id: 'contacts-schedule', label: 'Contacts' },
  { id: 'crews-permissions', label: 'Crews' },
  { id: 'property-roster', label: 'Units' },
  { id: 'review-activate', label: 'Review' },
] as const);

export const clampProjectSetupStep = (step: number) => {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(PROJECT_SETUP_STEPS.length - 1, Math.trunc(step)));
};
