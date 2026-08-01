import { useState } from 'react';
import { useAiAuth } from '../lib/ai/useAiAuth';

// Compact sign-in for AI import. Renders inside the intake sections so a user
// can sign in right where they import — without leaving setup and without the
// field app ever showing a login wall. When signed in it shows who, with a way
// to sign out. Only that one allowed account can spend the owner's AI keys.
export function AiSignInPanel({ purpose = 'photo import' }: { purpose?: string }) {
  const auth = useAiAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Signed in: stay invisible — the flow should feel native, and who's signed
  // in lives in More → Storage (account section), not inside Start Day.
  if (!auth.available || !auth.ready || auth.signedIn) return null;

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/u.test(email.trim()) || !password) return;
    void auth.signIn(email, password).then((ok) => {
      if (ok) setPassword('');
    });
  };

  return (
    <div className="ai-signin">
      <p className="ai-signin__lead">Sign in to use {purpose}. Only your account can use it.</p>
      <label className="ai-signin__field">
        <span>Email</span>
        <input
          autoComplete="username"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>
      <label className="ai-signin__field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          type="password"
          value={password}
        />
      </label>
      <button className="ai-signin__go" disabled={auth.busy} onClick={submit} type="button">
        {auth.busy ? 'Signing in…' : 'Sign in'}
      </button>
      {auth.error ? (
        <p className="ai-signin__error" role="alert">{auth.error}</p>
      ) : null}
    </div>
  );
}
