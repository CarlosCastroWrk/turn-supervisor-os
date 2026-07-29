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
      aria-label={`${kind === 'profile' ? 'Profile' : 'Privacy'} detail content`}
      className="w2a21a-profile-privacy-scroll"
      data-detail-scroll-owner={kind}
      data-turn-scroll-region="primary"
      role="region"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
