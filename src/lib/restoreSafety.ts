export interface RestoreSyncState {
  authReady: boolean;
  signedIn: boolean;
}

export const restoreBlockReason = ({ authReady, signedIn }: RestoreSyncState) => {
  if (!authReady) {
    return 'Wait for the sync sign-in check to finish before restoring a backup.';
  }

  if (signedIn) {
    return 'Sign out of Supabase sync in the top bar before restoring a backup. This prevents cloud records from immediately merging over the restored local copy.';
  }

  return '';
};
