export const FIELD_DESTINATIONS = ['today', 'turnboard', 'more'] as const;
export type FieldDestination = (typeof FIELD_DESTINATIONS)[number];

export const FIELD_SECTIONS = ['Common', 'A', 'B', 'C', 'D', 'E'] as const;
export type FieldSection = (typeof FIELD_SECTIONS)[number];

export type FieldTrade = 'Paint' | 'Clean';
export type FieldTaskSlot = 'current' | 'next' | 'backup';

export interface FieldTask {
  id: string;
  slot: FieldTaskSlot;
  unitNumber: string;
  label: string;
  scope: FieldSection[];
  trade?: FieldTrade;
  warning?: string;
}

export type NeedsMeCategory =
  | 'ready-for-my-walk'
  | 'missing-follow-up-owner'
  | 'needs-paper-review'
  | 'saved-on-this-device';

export interface NeedsMeItem {
  id: string;
  category: NeedsMeCategory;
  title: string;
  detail: string;
  actionLabel: string;
  unitNumber?: string;
  trade?: FieldTrade;
}

export interface MoreDestination {
  id: 'crews' | 'reports' | 'setup' | 'backup' | 'sync';
  label: string;
  detail: string;
}

export interface FieldShellModel {
  tasks: FieldTask[];
  needsMe: NeedsMeItem[];
  moreDestinations: MoreDestination[];
}
