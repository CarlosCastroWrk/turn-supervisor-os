import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ToastProvider';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import './styles.css';
import './styles/turnPolish.css';

// Every unique Vercel deployment URL is a SEPARATE browser storage world — a
// field supervisor opening one by accident sees an empty app and thinks the
// Turn is gone. Hard-redirect deployment-hash URLs to the one official origin
// so the real project (and sign-in) are always found. Named preview aliases
// (e.g. ...-logo-preview) are intentional and stay.
const OFFICIAL_HOST = 'turn-supervisor-os.vercel.app';
if (
  typeof window !== 'undefined'
  && /^turn-supervisor-[a-z0-9]{6,}-carloscastrowrk\.vercel\.app$/u.test(window.location.hostname)
) {
  window.location.replace(
    `https://${OFFICIAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/service-worker.js')
    .then((registration) => {
      // Field phones must pick up fixes on the next foreground, not two
      // launches later: check for a new build every time the app comes back,
      // and when one is installed, activate + reload once (data is untouched
      // — deploys ship code only).
      // The worker itself skipWaiting()s on install and claims clients, so a
      // fresh check is all that's needed for the new build to take over.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void registration.update().catch(() => undefined);
        }
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    })
    .catch((error) => {
      console.warn('Service worker registration failed', error);
    });
}
