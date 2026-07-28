import { ArrowLeft } from 'lucide-react';
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { resolveNativePageTransitionPolicy } from './model';
import './trackA.css';

interface NativePageHeaderProps {
  onBack: () => void;
  title: string;
}

export function NativePageHeader({ onBack, title }: NativePageHeaderProps) {
  return (
    <header className="w2a1-a-page-header">
      <button
        aria-label={`Back from ${title}`}
        className="w2a1-a-icon-button"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={22} />
      </button>
      <h1>{title}</h1>
      <span aria-hidden="true" />
    </header>
  );
}

interface NativePageTransitionProps {
  children: ReactNode;
  direction?: 'back' | 'forward';
  reducedMotion?: boolean;
}

const readSystemReducedMotion = () => (
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
);

export function NativePageTransition({
  children,
  direction = 'forward',
  reducedMotion,
}: NativePageTransitionProps) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(readSystemReducedMotion);

  useEffect(() => {
    if (reducedMotion !== undefined || typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [reducedMotion]);

  const policy = resolveNativePageTransitionPolicy(reducedMotion ?? systemReducedMotion);
  const style = {
    '--w2a1-a-transition-duration': `${policy.durationMs}ms`,
    '--w2a1-a-transition-easing': policy.easing,
    '--w2a1-a-transition-offset': `${direction === 'back' ? -policy.translatePx : policy.translatePx}px`,
  } as CSSProperties;

  return (
    <div
      className={`w2a1-a-page-transition ${policy.durationMs === 0 ? 'is-reduced' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
