import {
  FIELD_DESTINATIONS,
  FIELD_SECTIONS,
  type FieldDestination,
  type FieldPersonalPlan,
  type FieldShellModel,
  type FieldTask,
  type FieldTaskSlot,
  type FieldTrade,
  type NeedsMeCategory,
  type NeedsMeItem,
} from './types';

export const FIELD_NAVIGATION: ReadonlyArray<{ id: FieldDestination; label: string }> =
  FIELD_DESTINATIONS.map((id) => ({
    id,
    label: id === 'today' ? 'Today' : id === 'turnboard' ? 'TurnBoard' : 'More',
  }));

export const NEEDS_ME_LABELS: Record<NeedsMeCategory, string> = {
  'needs-confirmation': 'Needs Confirmation',
  'needs-my-inspection': 'Needs My Inspection',
  callbacks: 'Callbacks',
  'property-walks': 'Property Walks',
  'assignment-conflicts': 'Assignment Conflicts',
  'access-blockers': 'Access Blockers',
  'maintenance-blockers': 'Maintenance Blockers',
  'save-or-sync-problems': 'Save or Sync Problems',
  'paper-reconciliation': 'Paper Reconciliation',
};

export const PERSONAL_PLAN_SLOT_ORDER: FieldTaskSlot[] = ['now', 'next', 'backup'];
export const NEEDS_ME_CATEGORY_ORDER: NeedsMeCategory[] = [
  'needs-confirmation',
  'needs-my-inspection',
  'callbacks',
  'property-walks',
  'assignment-conflicts',
  'access-blockers',
  'maintenance-blockers',
  'save-or-sync-problems',
  'paper-reconciliation',
];

export interface PersonalPlanEntry {
  slot: FieldTaskSlot;
  task?: FieldTask;
}

export interface NeedsMeGroup {
  category: NeedsMeCategory;
  label: string;
  items: NeedsMeItem[];
}

export const orderPersonalPlan = (plan: FieldPersonalPlan): PersonalPlanEntry[] =>
  PERSONAL_PLAN_SLOT_ORDER.map((slot) => ({ slot, task: plan[slot] }));

export const groupNeedsMeItems = (items: NeedsMeItem[]): NeedsMeGroup[] =>
  NEEDS_ME_CATEGORY_ORDER.flatMap((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    return categoryItems.length > 0
      ? [{ category, label: NEEDS_ME_LABELS[category], items: categoryItems }]
      : [];
  });

export const summarizeNeedsMe = (items: NeedsMeItem[]) =>
  groupNeedsMeItems(items).map((group) => ({
    category: group.category,
    label: group.label,
    count: group.items.length,
  }));

const validateTradeAndScope = (
  errors: string[],
  recordId: string,
  trade: FieldTrade | undefined,
  scope: string[],
) => {
  const sectionSet = new Set<string>(FIELD_SECTIONS);
  if (trade && trade !== 'Paint' && trade !== 'Clean') {
    errors.push(`Unsupported trade on ${recordId}.`);
  }
  if (scope.some((section) => !sectionSet.has(section))) {
    errors.push(`Unsupported Unit section on ${recordId}.`);
  }
};

export const validateFieldShellModel = (model: FieldShellModel) => {
  const errors: string[] = [];

  if (!model.context.propertyName.trim()) {
    errors.push('Current property is required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(model.context.dateISO) || !model.context.dateLabel.trim()) {
    errors.push('An explicit Today date is required.');
  }

  for (const { task } of orderPersonalPlan(model.personalPlan)) {
    if (task) {
      validateTradeAndScope(errors, `personal plan task ${task.id}`, task.trade, task.scope);
    }
  }

  for (const item of [...model.assignedWork, ...model.progressingWork]) {
    validateTradeAndScope(errors, `work item ${item.id}`, item.trade, item.scope);
  }

  for (const item of model.needsMe) {
    validateTradeAndScope(
      errors,
      `Needs Me item ${item.id}`,
      item.trade,
      item.section ? [item.section] : [],
    );
    if (!item.unitNumber.trim() || !item.whyLosIsNeeded.trim() || !item.nextAction.trim()) {
      errors.push(`Needs Me item ${item.id} is missing required context.`);
    }
    if (!item.destination.workspace || !item.destination.label.trim()) {
      errors.push(`Needs Me item ${item.id} is missing an exact destination workspace.`);
    }
  }

  return errors;
};
