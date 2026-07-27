export interface LaunchSetupMotionPolicy {
  animateBrandMark: boolean;
  questionTransition: 'none' | 'short';
  transitionDurationMs: number;
}

export const resolveLaunchSetupMotionPolicy = (
  prefersReducedMotion: boolean,
): LaunchSetupMotionPolicy =>
  prefersReducedMotion
    ? {
        animateBrandMark: false,
        questionTransition: 'none',
        transitionDurationMs: 0,
      }
    : {
        animateBrandMark: true,
        questionTransition: 'short',
        transitionDurationMs: 160,
      };
