import {
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CloudOff,
  FileCheck2,
  Footprints,
  KeyRound,
  RotateCcw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { FieldBottomSheet } from './FieldBottomSheet';
import { groupNeedsMeItems } from '../projection';
import type { NeedsMeCategory, NeedsMeItem } from '../types';

interface NeedsMeSheetProps {
  items: NeedsMeItem[];
  open: boolean;
  onDismiss: () => void;
  onSelect: (item: NeedsMeItem) => void;
}

const categoryIcons: Record<NeedsMeCategory, React.ElementType> = {
  'needs-confirmation': CircleHelp,
  'needs-my-inspection': ClipboardCheck,
  callbacks: RotateCcw,
  'property-walks': Footprints,
  'assignment-conflicts': ShieldAlert,
  'access-blockers': KeyRound,
  'maintenance-blockers': Wrench,
  'save-or-sync-problems': CloudOff,
  'paper-reconciliation': FileCheck2,
};

export function NeedsMeSheet({ items, open, onDismiss, onSelect }: NeedsMeSheetProps) {
  const groups = groupNeedsMeItems(items);

  return (
    <FieldBottomSheet
      description="Personal prompts only. Paper remains authoritative; no official status changes here."
      open={open}
      title="Needs Me"
      onDismiss={onDismiss}
    >
      <div className="j28-needs-groups">
        {groups.map((group) => {
          const CategoryIcon = categoryIcons[group.category];
          return (
            <section key={group.category} aria-labelledby={`j28-needs-${group.category}`}>
              <h3 id={`j28-needs-${group.category}`}>
                <CategoryIcon size={18} aria-hidden="true" />
                {group.label}
              </h3>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className="j28-needs-item"
                  data-j28-touch="true"
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-label={`Unit ${item.unitNumber}${item.section ? `, Section ${item.section}` : ''}${item.trade ? `, ${item.trade}` : ''}. Why Los is needed: ${item.whyLosIsNeeded}${item.responsibleParty ? ` Responsible: ${item.responsibleParty}.` : ''} Next: ${item.nextAction} Opens: ${item.destination.label}.`}
                >
                  <span className="j28-needs-item__icon">
                    <CategoryIcon size={21} aria-hidden="true" />
                  </span>
                  <span className="j28-needs-item__content">
                    <span className="j28-needs-item__meta">
                      <strong>Unit {item.unitNumber}</strong>
                      {item.section ? <small>Section {item.section}</small> : null}
                      {item.trade ? <small>{item.trade}</small> : null}
                    </span>
                    <span><b>Why Los is needed</b>{item.whyLosIsNeeded}</span>
                    {item.responsibleParty ? <span><b>Owner / crew</b>{item.responsibleParty}</span> : null}
                    <span><b>Next</b>{item.nextAction}</span>
                    <span className="j28-needs-item__destination"><b>Opens</b>{item.destination.label}</span>
                  </span>
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </FieldBottomSheet>
  );
}
