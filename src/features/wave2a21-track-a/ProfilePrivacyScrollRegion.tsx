import type { ReactNode } from 'react';
import './trackA.css';

export interface ProfilePrivacyScrollRegionProps {
  readonly children: ReactNode;
  readonly kind: 'profile' | 'privacy';
}

export function ProfilePrivacyScrollRegion({
  children,
  kind,
}: ProfilePrivacyScrollRegionProps) {
  return (
    <div
      className="w2a21a-profile-privacy-scroll"
      data-detail-scroll-owner={kind}
      data-turn-scroll-region="primary"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
