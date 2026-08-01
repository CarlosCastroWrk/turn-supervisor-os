import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ToastProvider';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import './styles.css';

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
  navigator.serviceWorker.register('/service-worker.js').catch((error) => {
    console.warn('Service worker registration failed', error);
  });
}
