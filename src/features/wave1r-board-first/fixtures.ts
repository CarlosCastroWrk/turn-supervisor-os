import type { BoardFirstActivityItem } from './types';

export const WAVE1R_SYNTHETIC_CONTEXT = Object.freeze({
  propertyName: 'Moon Tower · Synthetic',
  dateLabel: 'Sun, Jul 26',
});

export const WAVE1R_SYNTHETIC_ACTIVITY: readonly BoardFirstActivityItem[] = Object.freeze([
  Object.freeze({
    id: 'wave1r-synthetic-note-602',
    kind: 'note',
    recordedAt: '2026-07-22T16:10:00.000Z',
    sourceLabel: 'Synthetic example note · read only',
    synthetic: true,
    title: 'Paint walkthrough note',
    wording: 'Synthetic example: verify Common before the next personal inspection pass.',
    unitId: 'jul28-unit-602',
    unitNumber: '602',
    trade: 'paint',
    section: 'common',
  }),
  Object.freeze({
    id: 'wave1r-synthetic-transcript-604',
    kind: 'transcript',
    recordedAt: '2026-07-22T15:52:00.000Z',
    sourceLabel: 'Synthetic example transcript · read only',
    synthetic: true,
    title: 'Voice transcript draft',
    wording: 'Synthetic transcript draft: clarify the two Paint crew claims for Section C.',
    unitId: 'jul28-unit-604',
    unitNumber: '604',
    trade: 'paint',
    section: 'C',
  }),
]);
