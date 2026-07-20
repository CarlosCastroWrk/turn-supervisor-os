import { CircleHelp, ClipboardPenLine, NotebookPen } from 'lucide-react';
import type { CaptureIntent } from '../lib/captureSession';

interface CaptureIntentPickerProps {
  onSelect: (intent: CaptureIntent) => void;
}

const intents: Array<{
  intent: CaptureIntent;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    intent: 'update',
    label: 'UPDATE',
    description: 'Draft a production-related change for your review.',
    icon: ClipboardPenLine,
  },
  {
    intent: 'note',
    label: 'NOTE',
    description: 'Save an observation or follow-up without changing status.',
    icon: NotebookPen,
  },
  {
    intent: 'ask',
    label: 'ASK',
    description: 'Query information already recorded in your private app.',
    icon: CircleHelp,
  },
];

export function CaptureIntentPicker({ onSelect }: CaptureIntentPickerProps) {
  return (
    <fieldset className="capture-intent-picker">
      <legend>What do you want to capture?</legend>
      <p>Choose first so the app never guesses whether your words should change a record.</p>
      <div className="capture-intent-picker__options">
        {intents.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.intent} type="button" onClick={() => onSelect(item.intent)}>
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      <small className="capture-safety-copy">Personal field companion. Paper remains authoritative.</small>
    </fieldset>
  );
}
