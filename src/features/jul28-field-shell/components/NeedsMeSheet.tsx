import { ChevronRight, FileCheck2, HardDrive, PaintRoller, Sparkles, UserRound } from 'lucide-react';
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
  'ready-for-my-walk': PaintRoller,
  'missing-follow-up-owner': UserRound,
  'needs-paper-review': FileCheck2,
  'saved-on-this-device': HardDrive,
};

export function NeedsMeSheet({ items, open, onDismiss, onSelect }: NeedsMeSheetProps) {
  const groups = groupNeedsMeItems(items);

  return (
    <FieldBottomSheet
      description="Personal reminders only. No official status changes here."
      open={open}
      title="Needs Me"
      onDismiss={onDismiss}
    >
      <div className="j28-needs-groups">
        {groups.map((group) => {
          const CategoryIcon = categoryIcons[group.category];
          return (
            <section key={group.category} aria-labelledby={`j28-needs-${group.category}`}>
              <h3 id={`j28-needs-${group.category}`}><CategoryIcon size={18} aria-hidden="true" />{group.label}</h3>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  data-j28-touch="true"
                  type="button"
                  onClick={() => onSelect(item)}
                >
                  <span className={`j28-trade-icon ${item.trade === 'Clean' ? 'is-clean' : ''}`}>
                    {item.trade === 'Clean'
                      ? <Sparkles size={21} aria-hidden="true" />
                      : <PaintRoller size={21} aria-hidden="true" />}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    {item.trade ? <small>{item.trade}</small> : null}
                    <p>{item.detail}</p>
                  </span>
                  <span className="j28-item-action">{item.actionLabel}<ChevronRight size={18} aria-hidden="true" /></span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </FieldBottomSheet>
  );
}
