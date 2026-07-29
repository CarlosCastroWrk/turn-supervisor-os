export interface TrackBOneShotRef {
  current: boolean;
}

export const acquireTrackBOneShot = (guard: TrackBOneShotRef) => {
  if (guard.current) return false;
  guard.current = true;
  return true;
};

export const releaseTrackBOneShot = (guard: TrackBOneShotRef) => {
  guard.current = false;
};
