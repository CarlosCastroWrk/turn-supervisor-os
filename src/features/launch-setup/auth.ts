import type { Session, SupabaseClient } from '@supabase/supabase-js';

export interface AuthSessionSnapshot {
  userId: string;
  email?: string;
  expiresAt?: number;
}

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type AuthFailure = { ok: false; error: string };

export interface LaunchAuthAdapter {
  readonly configured: boolean;
  getSession(): Promise<AuthResult<AuthSessionSnapshot | null>>;
  signInWithPassword(email: string, password: string): Promise<AuthResult<AuthSessionSnapshot>>;
  requestPasswordReset(email: string, redirectTo?: string): Promise<AuthResult<void>>;
  signOut(): Promise<AuthResult<void>>;
  subscribe(listener: (session: AuthSessionSnapshot | null, event: string) => void): () => void;
}

export type SupabaseAuthPort = Pick<
  SupabaseClient['auth'],
  | 'getSession'
  | 'signInWithPassword'
  | 'resetPasswordForEmail'
  | 'signOut'
  | 'onAuthStateChange'
>;

const authSuccess = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const authFailure = <T>(error: string): AuthResult<T> => ({ ok: false, error });

const sessionSnapshot = (session: Session): AuthSessionSnapshot => ({
  userId: session.user.id,
  ...(session.user.email ? { email: session.user.email } : {}),
  ...(session.expires_at ? { expiresAt: session.expires_at } : {}),
});

const safeAuthError = (error: unknown) =>
  error instanceof Error && error.message.trim()
    ? error.message
    : 'Authentication could not be completed.';

export const createSupabaseAuthAdapter = (
  port: SupabaseAuthPort | null,
): LaunchAuthAdapter => ({
  configured: port !== null,
  async getSession() {
    if (!port) return authFailure('Supabase Auth is not configured.');
    try {
      const response = await port.getSession();
      if (response.error) return authFailure(response.error.message);
      return authSuccess(response.data.session ? sessionSnapshot(response.data.session) : null);
    } catch (error) {
      return authFailure(safeAuthError(error));
    }
  },
  async signInWithPassword(email, password) {
    if (!port) return authFailure('Supabase Auth is not configured.');
    try {
      const response = await port.signInWithPassword({ email, password });
      if (response.error) return authFailure(response.error.message);
      if (!response.data.session) return authFailure('Sign-in succeeded without a usable session.');
      return authSuccess(sessionSnapshot(response.data.session));
    } catch (error) {
      return authFailure(safeAuthError(error));
    }
  },
  async requestPasswordReset(email, redirectTo) {
    if (!port) return authFailure('Supabase Auth is not configured.');
    try {
      const response = await port.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      return response.error ? authFailure(response.error.message) : authSuccess(undefined);
    } catch (error) {
      return authFailure(safeAuthError(error));
    }
  },
  async signOut() {
    if (!port) return authFailure('Supabase Auth is not configured.');
    try {
      const response = await port.signOut();
      return response.error ? authFailure(response.error.message) : authSuccess(undefined);
    } catch (error) {
      return authFailure(safeAuthError(error));
    }
  },
  subscribe(listener) {
    if (!port) return () => undefined;
    const { data } = port.onAuthStateChange((event, session) => {
      listener(session ? sessionSnapshot(session) : null, event);
    });
    return () => data.subscription.unsubscribe();
  },
});

export interface OfflineContinuityInput {
  hasLocalOperationalData: boolean;
  cachedOwnerUserId?: string;
  sessionUserId?: string;
  lastAuthenticatedUserId?: string;
}

export type OfflineContinuityReason =
  | 'continue-local'
  | 'no-local-data'
  | 'ownership-unverified'
  | 'online-auth-required'
  | 'account-mismatch';

export interface OfflineContinuityDecision {
  allowLocalApp: boolean;
  cloudAccess: 'paused';
  reason: OfflineContinuityReason;
  message: string;
}

export const resolvePostAuthOfflineContinuity = (
  input: OfflineContinuityInput,
): OfflineContinuityDecision => {
  if (!input.hasLocalOperationalData) {
    return {
      allowLocalApp: false,
      cloudAccess: 'paused',
      reason: 'no-local-data',
      message: 'Offline and no saved field data is available on this device.',
    };
  }

  if (!input.cachedOwnerUserId) {
    return {
      allowLocalApp: false,
      cloudAccess: 'paused',
      reason: 'ownership-unverified',
      message: 'Saved field data has no verified account owner. Reconnect before continuing.',
    };
  }

  const expectedUserId = input.sessionUserId ?? input.lastAuthenticatedUserId;
  if (!expectedUserId) {
    return {
      allowLocalApp: false,
      cloudAccess: 'paused',
      reason: 'online-auth-required',
      message: 'Reconnect and sign in once before using saved field data offline.',
    };
  }

  if (expectedUserId !== input.cachedOwnerUserId) {
    return {
      allowLocalApp: false,
      cloudAccess: 'paused',
      reason: 'account-mismatch',
      message: 'Saved field data belongs to a different account. Reconnect before continuing.',
    };
  }

  return {
    allowLocalApp: true,
    cloudAccess: 'paused',
    reason: 'continue-local',
    message: 'Offline. Continue with saved field data; cloud sync stays paused until reconnect.',
  };
};

export type AuthPhase =
  | 'unconfigured'
  | 'checking'
  | 'signed-out'
  | 'signed-out-offline'
  | 'signed-in'
  | 'signed-in-offline';

export type AuthOperation =
  | 'idle'
  | 'signing-in'
  | 'requesting-password-reset'
  | 'signing-out';

export interface LaunchAuthState {
  phase: AuthPhase;
  operation: AuthOperation;
  connectivity: 'online' | 'offline';
  session: AuthSessionSnapshot | null;
  canUseLocalApp: boolean;
  cloudAccess: 'available' | 'unavailable' | 'paused';
  message: string;
  lastError?: string;
  passwordResetRequested: boolean;
}

export interface LaunchAuthController {
  getState(): LaunchAuthState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  setConnectivity(online: boolean): void;
  signIn(email: string, password: string): Promise<AuthResult<AuthSessionSnapshot>>;
  requestPasswordReset(email: string, redirectTo?: string): Promise<AuthResult<void>>;
  signOut(): Promise<AuthResult<void>>;
  stop(): void;
  dispose(): void;
}

export interface LaunchAuthControllerDependencies {
  adapter: LaunchAuthAdapter;
  initialOnline: boolean;
  getOfflineContinuityInput: (
    session: AuthSessionSnapshot | null,
  ) => OfflineContinuityInput;
}

const validEmail = (email: string) => /^\S+@\S+\.\S+$/u.test(email.trim());

export const createLaunchAuthController = ({
  adapter,
  initialOnline,
  getOfflineContinuityInput,
}: LaunchAuthControllerDependencies): LaunchAuthController => {
  let state: LaunchAuthState = {
    phase: adapter.configured ? 'checking' : 'unconfigured',
    operation: 'idle',
    connectivity: initialOnline ? 'online' : 'offline',
    session: null,
    canUseLocalApp: false,
    cloudAccess: 'unavailable',
    message: adapter.configured
      ? 'Checking saved session…'
      : 'Cloud sign-in is not configured. Local setup remains separate.',
    passwordResetRequested: false,
  };
  const listeners = new Set<() => void>();
  let unsubscribeAuth: (() => void) | undefined;
  let disposed = false;

  const update = (patch: Partial<LaunchAuthState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const applySession = (session: AuthSessionSnapshot | null, message?: string) => {
    if (state.connectivity === 'online') {
      const continuityInput = session ? getOfflineContinuityInput(session) : undefined;
      const localAccess = continuityInput?.hasLocalOperationalData
        ? resolvePostAuthOfflineContinuity(continuityInput)
        : undefined;
      const canUseLocalApp = Boolean(session) && (localAccess?.allowLocalApp ?? true);
      update({
        phase: session ? 'signed-in' : 'signed-out',
        operation: 'idle',
        session,
        canUseLocalApp,
        cloudAccess: session ? 'available' : 'unavailable',
        message:
          session && localAccess && !localAccess.allowLocalApp
            ? `Signed in, but ${localAccess.message}`
            : message ?? (session ? 'Signed in. Cloud access is available.' : 'Sign in to enable cloud access.'),
        lastError: undefined,
      });
      return;
    }

    const continuity = resolvePostAuthOfflineContinuity(getOfflineContinuityInput(session));
    update({
      phase: session ? 'signed-in-offline' : 'signed-out-offline',
      operation: 'idle',
      session,
      canUseLocalApp: continuity.allowLocalApp,
      cloudAccess: continuity.cloudAccess,
      message: message ?? continuity.message,
      lastError: undefined,
    });
  };

  const failOperation = (error: string) => {
    update({ operation: 'idle', lastError: error, message: error });
  };

  const requireOnline = (action: string): AuthFailure | null => {
    if (state.connectivity === 'online') return null;
    const error = `Reconnect before ${action}. Saved field data is not deleted.`;
    failOperation(error);
    return { ok: false, error };
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (!adapter.configured || disposed) return;
      unsubscribeAuth?.();
      unsubscribeAuth = adapter.subscribe((session, event) => {
        applySession(session, session ? `Session updated: ${event}.` : 'Session ended. Sign in to enable cloud access.');
      });
      update({ phase: 'checking', operation: 'idle', message: 'Checking saved session…', lastError: undefined });
      const result = await adapter.getSession();
      if (disposed) return;
      if (!result.ok) {
        applySession(null, result.error);
        update({ lastError: result.error });
        return;
      }
      applySession(result.value);
    },
    setConnectivity(online) {
      const connectivity = online ? 'online' : 'offline';
      update({ connectivity });
      applySession(
        state.session,
        online
          ? state.session
            ? 'Connection restored. The host must verify the session before syncing.'
            : 'Connection restored. Sign in to enable cloud access.'
          : undefined,
      );
    },
    async signIn(email, password) {
      const offlineResult = requireOnline('signing in');
      if (offlineResult) return authFailure(offlineResult.error);
      if (!validEmail(email) || !password) {
        const error = 'Enter a valid email and password.';
        failOperation(error);
        return authFailure(error);
      }
      update({ operation: 'signing-in', message: 'Signing in…', lastError: undefined });
      const result = await adapter.signInWithPassword(email.trim(), password);
      if (!result.ok) {
        failOperation(result.error);
        return result;
      }
      applySession(result.value, 'Signed in. The host may begin its checked sync flow.');
      return result;
    },
    async requestPasswordReset(email, redirectTo) {
      const offlineResult = requireOnline('requesting a password reset');
      if (offlineResult) return offlineResult;
      if (!validEmail(email)) {
        const error = 'Enter a valid email before requesting a password reset.';
        failOperation(error);
        return authFailure(error);
      }
      update({
        operation: 'requesting-password-reset',
        passwordResetRequested: false,
        message: 'Requesting password reset…',
        lastError: undefined,
      });
      const result = await adapter.requestPasswordReset(email.trim(), redirectTo);
      if (!result.ok) {
        failOperation(result.error);
        return result;
      }
      update({
        operation: 'idle',
        passwordResetRequested: true,
        message: 'Password-reset request sent. Check the email address you entered.',
      });
      return result;
    },
    async signOut() {
      const offlineResult = requireOnline('signing out safely');
      if (offlineResult) return offlineResult;
      update({ operation: 'signing-out', message: 'Signing out…', lastError: undefined });
      const result = await adapter.signOut();
      if (!result.ok) {
        failOperation(result.error);
        return result;
      }
      applySession(null, 'Signed out. Existing local data remains subject to account ownership checks.');
      return result;
    },
    stop() {
      unsubscribeAuth?.();
      unsubscribeAuth = undefined;
    },
    dispose() {
      disposed = true;
      unsubscribeAuth?.();
      unsubscribeAuth = undefined;
      listeners.clear();
    },
  };
};
