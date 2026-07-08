import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { canonicalIntegerDraft, integerValueFromDraft, sanitizeIntegerDraft } from '../lib/numberInput';

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return <button className={`button button--${variant} ${className}`.trim()} type="button" {...props} />;
}

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode' | 'pattern'> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function NumberInput({ value, onValueChange, min = 0, max, onBlur, onFocus, ...props }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [focused, value]);

  const commitDraft = () => {
    const nextDraft = canonicalIntegerDraft(draft, { min, max });
    const nextValue = integerValueFromDraft(nextDraft, { min, max });
    setDraft(nextDraft);
    onValueChange(nextValue);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    if (value === 0) {
      setDraft('');
    } else {
      event.currentTarget.select();
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    commitDraft();
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      inputMode="numeric"
      min={min}
      max={max}
      pattern="[0-9]*"
      type="text"
      value={draft}
      onBlur={handleBlur}
      onChange={(event) => {
        const nextDraft = sanitizeIntegerDraft(event.target.value);
        setDraft(nextDraft);
        if (nextDraft) {
          onValueChange(integerValueFromDraft(nextDraft, { min, max }));
        }
      }}
      onFocus={handleFocus}
    />
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
