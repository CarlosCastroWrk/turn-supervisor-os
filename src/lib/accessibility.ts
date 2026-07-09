export const scrollBehaviorForMotionPreference = (prefersReducedMotion: boolean): ScrollBehavior =>
  prefersReducedMotion ? 'auto' : 'smooth';

export const motionSafeScrollBehavior = () =>
  scrollBehaviorForMotionPreference(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
