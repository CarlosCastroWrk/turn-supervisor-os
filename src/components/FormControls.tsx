import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createFieldDraftStore } from '../lib/fieldDraft';
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

type SessionDraftStore = ReturnType<typeof createFieldDraftStore>;
let cachedSessionDraftStore: SessionDraftStore | undefined;
let sessionDraftStoreChecked = false;

const getSessionDraftStore = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (sessionDraftStoreChecked) {
    return cachedSessionDraftStore;
  }
  sessionDraftStoreChecked = true;
  try {
    cachedSessionDraftStore = createFieldDraftStore(window.sessionStorage);
  } catch {
    cachedSessionDraftStore = undefined;
  }
  return cachedSessionDraftStore;
};

const readSessionDraft = (draftKey: string, value: string) => {
  return getSessionDraftStore()?.read(draftKey, value) ?? value;
};

const useCommittedTextDraft = (draftKey: string, value: string, onCommit: (value: string) => void) => {
  const [draft, setDraft] = useState(() => readSessionDraft(draftKey, value));
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const baseValueRef = useRef(value);
  const draftKeyRef = useRef(draftKey);
  const focusedRef = useRef(false);

  useEffect(() => {
    const keyChanged = draftKeyRef.current !== draftKey;
    draftKeyRef.current = draftKey;
    valueRef.current = value;

    if (keyChanged || !focusedRef.current) {
      const nextDraft = readSessionDraft(draftKey, value);
      baseValueRef.current = value;
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
  }, [draftKey, value]);

  const updateDraft = (nextDraft: string) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);

    const store = getSessionDraftStore();
    if (!store) return;
    if (nextDraft === valueRef.current) {
      store.clear(draftKeyRef.current);
      return;
    }
    store.write(draftKeyRef.current, baseValueRef.current, nextDraft);
  };

  const focus = () => {
    focusedRef.current = true;
    baseValueRef.current = valueRef.current;
  };

  const commit = () => {
    focusedRef.current = false;
    getSessionDraftStore()?.clear(draftKeyRef.current);

    const nextValue = draftRef.current;
    if (nextValue !== valueRef.current) {
      onCommit(nextValue);
    }
    baseValueRef.current = nextValue;
  };

  return { commit, draft, focus, updateDraft };
};

interface CommittedInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onChange' | 'value'> {
  draftKey: string;
  value: string;
  onCommit: (value: string) => void;
}

export function CommittedInput({
  draftKey,
  value,
  onCommit,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}: CommittedInputProps) {
  const committed = useCommittedTextDraft(draftKey, value, onCommit);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  return (
    <input
      {...props}
      value={committed.draft}
      onBlur={(event) => {
        committed.commit();
        onBlur?.(event);
      }}
      onChange={(event) => committed.updateDraft(event.target.value)}
      onFocus={(event) => {
        committed.focus();
        onFocus?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

interface CommittedTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'defaultValue' | 'onChange' | 'value'> {
  draftKey: string;
  value: string;
  onCommit: (value: string) => void;
}

export function CommittedTextarea({
  draftKey,
  value,
  onCommit,
  onBlur,
  onFocus,
  ...props
}: CommittedTextareaProps) {
  const committed = useCommittedTextDraft(draftKey, value, onCommit);

  return (
    <textarea
      {...props}
      value={committed.draft}
      onBlur={(event) => {
        committed.commit();
        onBlur?.(event);
      }}
      onChange={(event) => committed.updateDraft(event.target.value)}
      onFocus={(event) => {
        committed.focus();
        onFocus?.(event);
      }}
    />
  );
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
