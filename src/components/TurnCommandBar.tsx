import { Mic, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  findExactTurnCommandUnitMatches,
  findTurnCommandUnitMatches,
  type TurnCommandUnitOption,
} from '../lib/turnCommand';

export type TurnCommandEntry = 'plus' | 'microphone';

interface TurnCommandBarProps {
  acceptedCommandRequestId?: number;
  captureOpen?: boolean;
  contextUnitId?: string;
  microphoneRef?: React.RefObject<HTMLButtonElement | null>;
  onOpenCapture: (entry: TurnCommandEntry, trigger: HTMLElement) => void;
  onOpenUnit: (unitId: string) => void;
  onSubmitCommand: (sourceText: string, trigger: HTMLElement) => number;
  units: TurnCommandUnitOption[];
}

interface PendingCommandSubmission {
  id: number;
  sourceText: string;
}

export function TurnCommandBar({
  acceptedCommandRequestId,
  captureOpen = false,
  contextUnitId,
  microphoneRef,
  onOpenCapture,
  onOpenUnit,
  onSubmitCommand,
  units,
}: TurnCommandBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSubmissionRef = useRef<PendingCommandSubmission | null>(null);
  const listboxId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [contextDismissed, setContextDismissed] = useState(false);
  const [status, setStatus] = useState('');
  const matches = useMemo(() => findTurnCommandUnitMatches(units, query), [query, units]);
  const exactMatches = useMemo(
    () => findExactTurnCommandUnitMatches(units, query),
    [query, units],
  );
  const contextUnit = units.find((unit) => unit.unitId === contextUnitId);
  const showContext = Boolean(contextUnit && !contextDismissed);
  const suggestionsOpen = inputFocused && query.trim().length > 0 && matches.length > 0;

  useEffect(() => {
    setContextDismissed(false);
  }, [contextUnitId]);

  useEffect(() => {
    const pending = pendingSubmissionRef.current;
    if (!pending || acceptedCommandRequestId !== pending.id) {
      return;
    }

    setQuery((current) => current === pending.sourceText ? '' : current);
    setStatus('Wording moved into Capture.');
    setActiveMatchIndex(-1);
    pendingSubmissionRef.current = null;
  }, [acceptedCommandRequestId]);

  useEffect(() => {
    if (activeMatchIndex < matches.length) {
      return;
    }
    setActiveMatchIndex(matches.length > 0 ? matches.length - 1 : -1);
  }, [activeMatchIndex, matches.length]);

  const openUnit = (unit: TurnCommandUnitOption) => {
    setQuery('');
    setStatus(`Opened Unit ${unit.unitNumber}. No status changed.`);
    setActiveMatchIndex(-1);
    onOpenUnit(unit.unitId);
  };

  const submitCommand = () => {
    const sourceText = query.trim();
    if (!sourceText) {
      return;
    }

    if (exactMatches.length === 1) {
      openUnit(exactMatches[0]);
      return;
    }

    if (exactMatches.length > 1) {
      setStatus('More than one Unit has that number. Choose the correct Unit match.');
      setActiveMatchIndex(0);
      return;
    }

    const requestId = onSubmitCommand(sourceText, inputRef.current ?? document.body);
    pendingSubmissionRef.current = { id: requestId, sourceText };
    setStatus('Opening Capture with your exact wording.');
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && suggestionsOpen) {
      event.preventDefault();
      setInputFocused(false);
      setActiveMatchIndex(-1);
      setStatus('Unit matches closed.');
      return;
    }

    if (event.key === 'ArrowDown' && suggestionsOpen) {
      event.preventDefault();
      setActiveMatchIndex((current) => (current + 1) % matches.length);
      return;
    }

    if (event.key === 'ArrowUp' && suggestionsOpen) {
      event.preventDefault();
      setActiveMatchIndex((current) => (current <= 0 ? matches.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestionsOpen && activeMatchIndex >= 0) {
        openUnit(matches[activeMatchIndex]);
        return;
      }
      submitCommand();
    }
  };

  return (
    <section className="turn-command-bar" aria-label="Turn OS command bar">
      <button
        className="turn-command-bar__action"
        type="button"
        onClick={(event) => onOpenCapture('plus', event.currentTarget)}
        aria-label="Open Capture attachments"
        aria-expanded={captureOpen}
        aria-haspopup="dialog"
      >
        <Plus size={22} aria-hidden="true" />
      </button>

      <div className="turn-command-bar__input-wrap">
        {showContext ? (
          <span className="turn-command-bar__context">
            Context: Unit {contextUnit?.unitNumber}
            <button
              type="button"
              onClick={() => setContextDismissed(true)}
              aria-label={`Remove Unit ${contextUnit?.unitNumber} context`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <div className="turn-command-bar__input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setInputFocused(true);
              setActiveMatchIndex(-1);
              setStatus('');
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => window.setTimeout(() => setInputFocused(false), 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask or update Turn OS…"
            aria-label="Ask, update, or search Turn OS"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-describedby={statusId}
            aria-expanded={suggestionsOpen}
            aria-activedescendant={
              suggestionsOpen && activeMatchIndex >= 0
                ? `${listboxId}-option-${activeMatchIndex}`
                : undefined
            }
          />
        </div>

        {suggestionsOpen ? (
          <div className="turn-command-bar__matches" id={listboxId} role="listbox" aria-label="Current Turn Unit matches">
            {matches.map((unit, index) => (
              <button
                id={`${listboxId}-option-${index}`}
                key={unit.unitId}
                type="button"
                role="option"
                aria-selected={activeMatchIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openUnit(unit)}
              >
                <span>
                  <strong>Unit {unit.unitNumber}</strong>
                  <small>{[unit.buildingName, unit.floorName].filter(Boolean).join(' · ') || 'Current Turn'}</small>
                </span>
                <span>Open</span>
              </button>
            ))}
          </div>
        ) : null}

        <span className="visually-hidden" id={statusId} role="status" aria-live="polite">
          {status}
        </span>
      </div>

      <button
        ref={microphoneRef}
        className="turn-command-bar__action turn-command-bar__microphone"
        type="button"
        onClick={(event) => onOpenCapture('microphone', event.currentTarget)}
        aria-label="Open Capture"
        aria-expanded={captureOpen}
        aria-haspopup="dialog"
      >
        <Mic size={22} aria-hidden="true" />
      </button>
    </section>
  );
}
