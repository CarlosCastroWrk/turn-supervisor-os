import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { readStoredAppDataJson } from '../lib/storage';

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  crashed: boolean;
  message: string;
}

// Last line of defense: any render-time exception unmounts the React tree, and
// the in-app recovery/export UI would die with it. This boundary keeps a plain,
// dependency-light screen on-screen so a field crash never becomes a blank page,
// and — critically — offers a raw backup download read straight from
// localStorage (not from the crashed app state).
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { crashed: false, message: '' };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      crashed: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep a breadcrumb for later diagnosis; never rethrow.
    console.error('turn-os-root-crash', error, info.componentStack);
  }

  private downloadBackup = (): void => {
    try {
      const raw = readStoredAppDataJson();
      if (!raw) {
        window.alert('No saved Turn data was found on this device to back up.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/gu, '-');
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `turn-os-recovery-backup-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('The backup could not be created. Your data is still saved on this device.');
    }
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <div role="alert" style={styles.screen}>
        <div style={styles.card}>
          <h1 style={styles.title}>Turn OS hit a snag</h1>
          <p style={styles.body}>
            Your Turn data is still saved on this device — nothing was lost. Download a backup now,
            then reload to keep working.
          </p>
          <div style={styles.actions}>
            <button onClick={this.downloadBackup} style={styles.primary} type="button">
              Download backup
            </button>
            <button onClick={this.reload} style={styles.secondary} type="button">
              Reload Turn OS
            </button>
          </div>
          <p style={styles.detail}>{this.state.message}</p>
        </div>
      </div>
    );
  }
}

const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'max(24px, env(safe-area-inset-top)) 20px',
    background: '#0f141b',
    color: '#f4f6f9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    boxSizing: 'border-box',
  },
  card: { maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' },
  title: { fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' },
  body: { fontSize: '16px', lineHeight: 1.55, color: '#c4cedb', margin: 0 },
  actions: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' },
  primary: {
    minHeight: '52px', borderRadius: '14px', border: 'none', background: '#2f8bff',
    color: '#04101f', fontSize: '17px', fontWeight: 700, cursor: 'pointer',
  },
  secondary: {
    minHeight: '52px', borderRadius: '14px', border: '1px solid #33404f',
    background: 'transparent', color: '#f4f6f9', fontSize: '17px', fontWeight: 600, cursor: 'pointer',
  },
  detail: { fontSize: '12px', color: '#7b8798', margin: '8px 0 0', wordBreak: 'break-word' },
};
