import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLaunchAuthController,
  createSupabaseAuthAdapter,
  resolvePostAuthOfflineContinuity,
} from '../src/features/launch-setup/auth.ts';

const session = {
  user: { id: 'synthetic-user-1', email: 'los@example.test' },
  expires_at: 1_800_000_000,
};

const createAuthPort = () => {
  const calls = [];
  let listener = () => undefined;
  let unsubscribed = false;
  return {
    calls,
    emit(event, nextSession) {
      listener(event, nextSession);
    },
    get unsubscribed() {
      return unsubscribed;
    },
    port: {
      async getSession() {
        calls.push(['getSession']);
        return { data: { session }, error: null };
      },
      async signInWithPassword(credentials) {
        calls.push(['signInWithPassword', credentials]);
        return { data: { session }, error: null };
      },
      async resetPasswordForEmail(email, options) {
        calls.push(['resetPasswordForEmail', email, options]);
        return { data: {}, error: null };
      },
      async signOut() {
        calls.push(['signOut']);
        return { data: {}, error: null };
      },
      onAuthStateChange(nextListener) {
        calls.push(['onAuthStateChange']);
        listener = nextListener;
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribed = true;
              },
            },
          },
        };
      },
    },
  };
};

test('Supabase adapter exposes only the injected Auth contract', async () => {
  const mock = createAuthPort();
  const adapter = createSupabaseAuthAdapter(mock.port);
  assert.equal(adapter.configured, true);

  const restored = await adapter.getSession();
  assert.deepEqual(restored, {
    ok: true,
    value: {
      userId: 'synthetic-user-1',
      email: 'los@example.test',
      expiresAt: 1_800_000_000,
    },
  });

  const signedIn = await adapter.signInWithPassword('los@example.test', 'synthetic-password');
  assert.equal(signedIn.ok, true);
  const reset = await adapter.requestPasswordReset('los@example.test', 'https://example.test/reset');
  assert.equal(reset.ok, true);

  let observedUserId = '';
  const unsubscribe = adapter.subscribe((nextSession) => {
    observedUserId = nextSession?.userId ?? '';
  });
  mock.emit('SIGNED_IN', session);
  assert.equal(observedUserId, 'synthetic-user-1');
  unsubscribe();
  assert.equal(mock.unsubscribed, true);
  assert.deepEqual(mock.calls.find((call) => call[0] === 'resetPasswordForEmail'), [
    'resetPasswordForEmail',
    'los@example.test',
    { redirectTo: 'https://example.test/reset' },
  ]);
});

test('offline continuity permits only matching account-owned local data', () => {
  const allowed = resolvePostAuthOfflineContinuity({
    hasLocalOperationalData: true,
    cachedOwnerUserId: 'synthetic-user-1',
    lastAuthenticatedUserId: 'synthetic-user-1',
  });
  assert.equal(allowed.reason, 'continue-local');
  assert.equal(allowed.allowLocalApp, true);
  assert.equal(allowed.cloudAccess, 'paused');

  const mismatch = resolvePostAuthOfflineContinuity({
    hasLocalOperationalData: true,
    cachedOwnerUserId: 'synthetic-user-2',
    sessionUserId: 'synthetic-user-1',
  });
  assert.equal(mismatch.reason, 'account-mismatch');
  assert.equal(mismatch.allowLocalApp, false);

  const unowned = resolvePostAuthOfflineContinuity({
    hasLocalOperationalData: true,
    lastAuthenticatedUserId: 'synthetic-user-1',
  });
  assert.equal(unowned.reason, 'ownership-unverified');
  assert.equal(unowned.allowLocalApp, false);
});

test('auth controller restores session and keeps post-auth local work available offline', async () => {
  const mock = createAuthPort();
  const adapter = createSupabaseAuthAdapter(mock.port);
  const controller = createLaunchAuthController({
    adapter,
    initialOnline: true,
    getOfflineContinuityInput: (currentSession) => ({
      hasLocalOperationalData: true,
      cachedOwnerUserId: 'synthetic-user-1',
      lastAuthenticatedUserId: 'synthetic-user-1',
      sessionUserId: currentSession?.userId,
    }),
  });

  await controller.start();
  assert.equal(controller.getState().phase, 'signed-in');
  assert.equal(controller.getState().cloudAccess, 'available');

  controller.stop();
  assert.equal(mock.unsubscribed, true);
  await controller.start();
  assert.equal(controller.getState().phase, 'signed-in');

  controller.setConnectivity(false);
  assert.equal(controller.getState().phase, 'signed-in-offline');
  assert.equal(controller.getState().canUseLocalApp, true);
  assert.equal(controller.getState().cloudAccess, 'paused');

  const reset = await controller.requestPasswordReset('los@example.test');
  assert.equal(reset.ok, false);
  assert.match(controller.getState().lastError, /Reconnect before requesting a password reset/u);
  assert.equal(controller.getState().canUseLocalApp, true);

  controller.setConnectivity(true);
  const signOut = await controller.signOut();
  assert.equal(signOut.ok, true);
  assert.equal(controller.getState().phase, 'signed-out');
  controller.dispose();
  assert.equal(mock.unsubscribed, true);
});

test('auth controller makes account mismatch loud instead of opening local data', async () => {
  const mock = createAuthPort();
  const controller = createLaunchAuthController({
    adapter: createSupabaseAuthAdapter(mock.port),
    initialOnline: false,
    getOfflineContinuityInput: (currentSession) => ({
      hasLocalOperationalData: true,
      cachedOwnerUserId: 'synthetic-user-2',
      sessionUserId: currentSession?.userId,
    }),
  });
  await controller.start();
  assert.equal(controller.getState().phase, 'signed-in-offline');
  assert.equal(controller.getState().canUseLocalApp, false);
  assert.match(controller.getState().message, /different account/u);
  controller.dispose();
});

test('online authentication does not imply access to another account local cache', async () => {
  const mock = createAuthPort();
  const controller = createLaunchAuthController({
    adapter: createSupabaseAuthAdapter(mock.port),
    initialOnline: true,
    getOfflineContinuityInput: (currentSession) => ({
      hasLocalOperationalData: true,
      cachedOwnerUserId: 'synthetic-user-2',
      sessionUserId: currentSession?.userId,
    }),
  });
  await controller.start();
  assert.equal(controller.getState().phase, 'signed-in');
  assert.equal(controller.getState().canUseLocalApp, false);
  assert.match(controller.getState().message, /different account/u);
  controller.dispose();
});
