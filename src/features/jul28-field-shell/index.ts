export { JUL28_SYNTHETIC_FIELD_SHELL } from './fixtures';
export {
  FIELD_NAVIGATION,
  NEEDS_ME_CATEGORY_ORDER,
  NEEDS_ME_LABELS,
  PERSONAL_PLAN_SLOT_ORDER,
  groupNeedsMeItems,
  orderPersonalPlan,
  summarizeNeedsMe,
  validateFieldShellModel,
} from './projection';
// TodayFieldShell is a preview-only harness imported directly by preview.tsx.
export { FieldNavigation } from './components/FieldNavigation';
export { FieldShellHeader } from './components/FieldShellHeader';
export { MoreSheet } from './components/MoreSheet';
export { NeedsMeSheet } from './components/NeedsMeSheet';
export { TodaySurface } from './components/TodaySurface';
export type {
  FieldDestination,
  FieldPersonalPlan,
  FieldRecentActivityItem,
  FieldSection,
  FieldShellModel,
  FieldScheduleItem,
  FieldTask,
  FieldTaskSlot,
  FieldTodayContext,
  FieldTrade,
  FieldWorkItem,
  FieldWorkspaceDestination,
  FieldWorkspaceId,
  MoreDestination,
  NeedsMeCategory,
  NeedsMeItem,
} from './types';
