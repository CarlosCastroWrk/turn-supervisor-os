import { useRef, useState } from 'react';
import {
  interpretFieldWords,
  type InterpretResult,
  type TurnIntent,
} from '../../lib/intelligenceClient';

// Tell Turn OS — the intelligence layer's front door. Los talks (dictation
// keyboard) or pastes; the interpreter proposes intents; NOTHING happens
// until he confirms, and every applied intent reports its outcome.

export const TellTurnOS = ({
  open,
  onClose,
  rosterUnitNumbers,
  crews,
  onApplyIntent,
  onRouteRelease,
}: {
  open: boolean;
  onClose: () => void;
  rosterUnitNumbers: readonly string[];
  crews: readonly { name: string; trade: 'paint' | 'clean' }[];
  // Returns a short outcome line ("1608 → cut-in on A, B") or throws.
  onApplyIntent: (intent: TurnIntent) => string;
  // Release intents go through the proven Quick add review instead.
  onRouteRelease: (text: string) => void;
}) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<InterpretResult>();
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const [outcomes, setOutcomes] = useState<readonly string[]>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!open) return null;

  const reset = () => {
    setResult(undefined);
    setOutcomes(undefined);
    setChecked(new Set());
    setError(undefined);
  };

  const interpret = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    setOutcomes(undefined);
    try {
      const next = await interpretFieldWords({
        crews,
        rosterUnitNumbers,
        text: text.trim(),
      });
      setResult(next);
      setChecked(new Set(next.intents.map((_, index) => index)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    const lines: string[] = [];
    const releaseTexts: string[] = [];
    result.intents.forEach((intent, index) => {
      if (!checked.has(index)) return;
      if (intent.kind === 'release') {
        releaseTexts.push(intent.summary);
        return;
      }
      try {
        lines.push(onApplyIntent(intent));
      } catch (caught) {
        lines.push(`${intent.unitNumber}: ${caught instanceof Error ? caught.message : 'failed'}`);
      }
    });
    if (releaseTexts.length > 0) {
      onRouteRelease(text.trim());
      lines.push(`${releaseTexts.length} new release${releaseTexts.length === 1 ? '' : 's'} → opened in Quick add for your confirm.`);
    }
    setOutcomes(lines);
  };

  return (
    <div className="lcc-tellos" role="dialog" aria-label="Tell Turn OS">
      <button aria-label="Close" className="lcc-tellos__backdrop" onClick={onClose} type="button" />
      <div className="lcc-tellos__sheet">
        <h2>Tell Turn OS</h2>
        <p className="lcc-tellos__hint">
          Talk like the field talks — use the mic on your keyboard. “1608 drop C
          and D”, “505 A and B are cut-ins, give it to Rocky”, “block 1106 clean,
          resident still in there”.
        </p>
        <textarea
          onChange={(event) => {
            setText(event.target.value);
            if (result) reset();
          }}
          placeholder="Tell me what happened…"
          ref={textareaRef}
          rows={3}
          value={text}
        />
        {error ? <p className="lcc-tellos__error">{error}</p> : null}
        {!result ? (
          <div className="lcc-tellos__actions">
            <button disabled={busy || !text.trim()} onClick={() => void interpret()} type="button">
              {busy ? 'Reading…' : 'Read it'}
            </button>
            <button className="is-ghost" onClick={onClose} type="button">Close</button>
          </div>
        ) : null}
        {result && !outcomes ? (
          <>
            <ul className="lcc-tellos__intents">
              {result.intents.map((intent, index) => (
                <li key={index}>
                  <label>
                    <input
                      checked={checked.has(index)}
                      onChange={() => {
                        setChecked((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        });
                      }}
                      type="checkbox"
                    />
                    <span>
                      {intent.summary}
                      {intent.confidence === 'low' ? <em> — double-check me</em> : null}
                    </span>
                  </label>
                </li>
              ))}
              {result.intents.length === 0 ? <li>Nothing actionable heard — say it another way.</li> : null}
            </ul>
            {result.uncertainties.length > 0 ? (
              <p className="lcc-tellos__uncertain">{result.uncertainties.join(' · ')}</p>
            ) : null}
            <div className="lcc-tellos__actions">
              <button
                disabled={checked.size === 0}
                onClick={apply}
                type="button"
              >
                Do {checked.size} thing{checked.size === 1 ? '' : 's'}
              </button>
              <button className="is-ghost" onClick={reset} type="button">Re-read</button>
              <button className="is-ghost" onClick={onClose} type="button">Close</button>
            </div>
          </>
        ) : null}
        {outcomes ? (
          <>
            <ul className="lcc-tellos__outcomes">
              {outcomes.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
            <div className="lcc-tellos__actions">
              <button
                onClick={() => {
                  setText('');
                  reset();
                  textareaRef.current?.focus();
                }}
                type="button"
              >
                Tell me more
              </button>
              <button className="is-ghost" onClick={onClose} type="button">Done</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
