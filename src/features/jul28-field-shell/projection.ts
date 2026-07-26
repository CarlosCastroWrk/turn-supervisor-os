import {
  FIELD_DESTINATIONS,
  FIELD_SECTIONS,
  type FieldDestination,
  type FieldShellModel,
  type FieldTask,
  type FieldTaskSlot,
  type NeedsMeCategory,
  type NeedsMeItem,
} from './types';

export const FIELD_NAVIGATION: ReadonlyArray<{ id: FieldDestination; label: string }> =
  FIELD_DESTINATIONS.map((id) => ({
    id,
    label: id === 'today' ? 'Today' : id === 'turnboard' ? 'TurnBoard' : 'More',
  }));

export const NEEDS_ME_LABELS: Record<NeedsMeCategory, string> = {
  'ready-for-my-walk': 'Ready for my walk',
  'missing-follow-up-owner': 'Missing follow-up owner',
  'needs-paper-review': 'Needs paper review',
  'saved-on-this-device': 'Saved on this device',
};

const taskSlotOrder: FieldTaskSlot[] = ['current', 'next', 'backup'];
const needsMeCategoryOrder: NeedsMeCategory[] = [
  'ready-for-my-walk',
  'missing-follow-up-owner',
  'needs-paper-review',
  'saved-on-this-device',
];

export interface NeedsMeGroup {
  category: NeedsMeCategory;
  label: string;
  items: NeedsMeItem[];
}

export const orderFieldTasks = (tasks: FieldTask[]) =>
  taskSlotOrder.flatMap((slot) => tasks.filter((task) => task.slot === slot));

export const groupNeedsMeItems = (items: NeedsMeItem[]): NeedsMeGroup[] =>
  needsMeCategoryOrder.flatMap((category) => {
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

export const validateFieldShellModel = (model: FieldShellModel) => {
  const errors: string[] = [];
  const sectionSet = new Set<string>(FIELD_SECTIONS);

  for (const slot of taskSlotOrder) {
    const matches = model.tasks.filter((task) => task.slot === slot);
    if (matches.length !== 1) {
      errors.push(`Expected one ${slot} task; received ${matches.length}.`);
    }
  }

  for (const task of model.tasks) {
    if (task.trade && task.trade !== 'Paint' && task.trade !== 'Clean') {
      errors.push(`Unsupported trade on task ${task.id}.`);
    }
    if (task.scope.some((section) => !sectionSet.has(section))) {
      errors.push(`Unsupported Unit section on task ${task.id}.`);
    }
  }

  for (const item of model.needsMe) {
    if (item.trade && item.trade !== 'Paint' && item.trade !== 'Clean') {
      errors.push(`Unsupported trade on Needs Me item ${item.id}.`);
    }
  }

  return errors;
};
