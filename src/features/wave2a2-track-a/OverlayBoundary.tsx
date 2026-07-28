import type { ReactNode } from 'react';
import type { TurnThemeState } from './theme';

export interface Wave2A2OverlayBoundaryProps {
  children: ReactNode;
  theme: Pick<TurnThemeState, 'reducedMotion' | 'resolvedTheme'>;
}

/**
 * Keeps host-owned overlays inside the same presentation contract as the shell
 * without moving their state or dialog ownership into Track A.
 */
export function Wave2A2OverlayBoundary({
  children,
  theme,
}: Wave2A2OverlayBoundaryProps) {
  return (
    <div
      className="w2a2-overlay-boundary"
      data-reduced-motion={theme.reducedMotion}
      data-theme={theme.resolvedTheme}
      data-wave2a2-overlay-boundary="true"
    >
      {children}
    </div>
  );
}
