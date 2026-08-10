import { useEffect, useMemo, useRef, useState } from 'react';
import {
  interpretFieldWords,
  type InterpretResult,
  type TurnIntent,
} from '../../lib/intelligenceClient';
import {
  answerTurnChat,
  type TurnChatAnswer,
  type TurnChatNav,
} from './turnChatAnswer';
import type { TrackCState } from '../wave2a2-track-c/model';

// Turn Chat — the Plus button's new front door. One thread, two brains:
// the instant local brain answers questions from the board (free, offline,
// tappable cards that navigate), and the AI interpreter reads command
// sentences into confirmable intents right in the thread (Tell-OS absorbed).
// Nothing writes without a tap on "Do it".

interface IntentBlock {
  readonly result: InterpretResult;
  readonly checked: ReadonlySet<number>;
  readonly outcomes?: readonly string[];
  readonly sourceText: string;
}

interface ChatMessage {
  readonly id: number;
  readonly role: 'los' | 'os';
  readonly text?: string;
  readonly answer?: TurnChatAnswer;
  readonly intents?: IntentBlock;
  readonly offerAi?: string; // the text to send to the interpreter on tap
  readonly busy?: boolean;
}

export interface TurnChatProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: TrackCState;
  readonly onApplyIntent: (intent: TurnIntent) => string;
  readonly onResetIntentBatch: () => void;
  readonly onRouteRelease: (text: string) => void;
  readonly onNavigate: (nav: TurnChatNav) => void;
  readonly onQuickPasteMemo: () => void;
  readonly onQuickNote: () => void;
  readonly onQuickBlocker: () => void;
  readonly onQuickMore: () => void;
}

const THREAD_KEY = 'turn-os:chat-thread';
const THREAD_CAP = 40;

// Only text + answers survive backgrounding — a pending intents block is
// tied to live state and must be re-read, never replayed stale.
type StoredMessage = Pick<ChatMessage, 'id' | 'role' | 'text' | 'answer'> & {
  readonly outcomes?: readonly string[];
};

const restoreThread = (): ChatMessage[] => {
  try {
    const raw = window.localStorage.getItem(THREAD_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredMessage[];
    return stored.map((message) => ({
      answer: message.outcomes
        ? { cards: [], note: `✓ Done — ${message.outcomes.join(' · ')}` }
        : message.answer,
      id: message.id,
      role: message.role,
      text: message.text,
    }));
  } catch {
    return [];
  }
};

const persistThread = (messages: readonly ChatMessage[]) => {
  try {
    const stored: StoredMessage[] = messages
      .filter((message) => !message.busy)
      .slice(-THREAD_CAP)
      .map((message) => ({
        answer: message.answer,
        id: message.id,
        outcomes: message.intents?.outcomes,
        role: message.role,
        text: message.text,
      }));
    window.localStorage.setItem(THREAD_KEY, JSON.stringify(stored));
  } catch { /* thread is a convenience, never worth an error */ }
};

// Command sentences carry a roster unit + an action/task word, or name a
// crew — those go straight to the interpreter without an extra tap. A bare
// trade word ("608 clean") stays a QUESTION: the unit card answers it.
const COMMAND_WORD_RE =
  /assign|give|drop|delete|remove|block|unblock|note|release|heavy|callback|call back|fix|done|pass|cut|touch|full/i;
const looksLikeCommand = (
  text: string,
  state: TrackCState,
): boolean => {
  const numbers = text.match(/\d{3,4}/g) ?? [];
  const hasUnit = numbers.some((candidate) =>
    state.units.some((unit) => unit.unitNumber === candidate));
  if (!hasUnit) return false;
  const crewNamed = state.crews.some((crew) => {
    const first = crew.name.trim().toLowerCase().split(/\s+/)[0];
    return first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(text);
  });
  return COMMAND_WORD_RE.test(text) || crewNamed;
};

export function TurnChat({
  open,
  onClose,
  state,
  onApplyIntent,
  onResetIntentBatch,
  onRouteRelease,
  onNavigate,
  onQuickPasteMemo,
  onQuickNote,
  onQuickBlocker,
  onQuickMore,
}: TurnChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(restoreThread);
  const [draft, setDraft] = useState('');
  const nextId = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { persistThread(messages); }, [messages]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, open]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const push = (message: Omit<ChatMessage, 'id'>): number => {
    const id = (nextId.current += 1);
    setMessages((current) => [...current.slice(-THREAD_CAP), { ...message, id }]);
    return id;
  };
  const patch = (id: number, update: Partial<ChatMessage>) => {
    setMessages((current) => current.map((message) =>
      message.id === id ? { ...message, ...update } : message));
  };

  const runInterpreter = async (text: string, placeholderId?: number) => {
    const id = placeholderId
      ?? push({ busy: true, role: 'os', text: 'Reading what you said…' });
    try {
      const result = await interpretFieldWords({
        crews: stateRef.current.crews.map((crew) => ({ name: crew.name, trade: crew.trade })),
        rosterUnitNumbers: stateRef.current.units.map((unit) => unit.unitNumber),
        text,
      });
      if (result.intents.length === 0) {
        patch(id, {
          busy: false,
          text: 'Nothing actionable heard — say it another way, or open Quick add.',
        });
        return;
      }
      patch(id, {
        busy: false,
        intents: {
          checked: new Set(result.intents.map((_, index) => index)),
          result,
          sourceText: text,
        },
        text: undefined,
      });
    } catch (caught) {
      patch(id, {
        busy: false,
        offerAi: text,
        text: caught instanceof Error ? caught.message : 'Could not read that.',
      });
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    push({ role: 'los', text });
    // Commands beat lookups: "1608 drop C, give A B to Sandra" wants the
    // interpreter, not the 1608 card. Plain "1608" gets the card instantly.
    if (looksLikeCommand(text, stateRef.current)) {
      void runInterpreter(text);
      return;
    }
    const answer = answerTurnChat(stateRef.current, text);
    if (answer && (answer.cards.length > 0 || answer.note)) {
      push({ answer, role: 'os' });
      return;
    }
    push({
      offerAi: text,
      role: 'os',
      text: 'I couldn’t answer that from the board. Try a unit number, a crew name, “callbacks”, “ready to walk”, or “where are we” — or let the AI read it.',
    });
  };

  const applyIntents = (messageId: number, block: IntentBlock) => {
    onResetIntentBatch();
    const lines: string[] = [];
    let fallbackToQuickAdd = false;
    block.result.intents.forEach((intent, index) => {
      if (!block.checked.has(index)) return;
      try {
        lines.push(onApplyIntent(intent));
      } catch (caught) {
        if (intent.kind === 'release') {
          fallbackToQuickAdd = true;
          lines.push(`${intent.unitNumber}: opening in Quick add to finish the release.`);
        } else {
          lines.push(`${intent.unitNumber}: ${caught instanceof Error ? caught.message : 'failed'}`);
        }
      }
    });
    patch(messageId, { intents: { ...block, outcomes: lines } });
    if (fallbackToQuickAdd) onRouteRelease(block.sourceText);
  };

  const suggestions = useMemo(() => [
    'Where are we',
    'Ready to walk',
    'Callbacks',
  ], []);

  if (!open) return null;

  return (
    <div aria-label="Turn Chat" className="lcc-chat" role="dialog">
      <div className="lcc-chat__panel">
        <header className="lcc-chat__header">
          <div>
            <h2>Turn Chat</h2>
            <p>Ask the board or tell it what happened — it’s all here.</p>
          </div>
          <button aria-label="Close chat" onClick={onClose} type="button">✕</button>
        </header>

        <div className="lcc-chat__quick" role="group" aria-label="Quick actions">
          <button onClick={onQuickPasteMemo} type="button">📋 Paste memo</button>
          <button onClick={onQuickNote} type="button">✎ Note</button>
          <button onClick={onQuickBlocker} type="button">⛔ Blocker</button>
          <button onClick={onQuickMore} type="button">⋯ More</button>
        </div>

        <div className="lcc-chat__scroll" data-turn-scroll-region="chat" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="lcc-chat__empty">
              <p>
                Try a unit number (“608”), a crew (“Rocky today”), or tell me
                what happened (“1608 drop C, give A and B to Sandra”). Use the
                🎤 on your keyboard to talk.
              </p>
              <div className="lcc-chat__suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setDraft(suggestion);
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message) => (
            <div
              className={`lcc-chat__msg is-${message.role}${message.busy ? ' is-busy' : ''}`}
              key={message.id}
            >
              {message.text ? <p className="lcc-chat__bubble">{message.text}</p> : null}
              {message.offerAi ? (
                <div className="lcc-chat__chips">
                  <button
                    onClick={() => void runInterpreter(message.offerAi ?? '')}
                    type="button"
                  >
                    Read it with AI
                  </button>
                </div>
              ) : null}
              {message.answer ? (
                <div className="lcc-chat__cards">
                  {message.answer.note ? (
                    <p className="lcc-chat__bubble">{message.answer.note}</p>
                  ) : null}
                  {message.answer.cards.map((card, cardIndex) => (
                    <div className="lcc-chat__card" key={cardIndex}>
                      <button
                        className="lcc-chat__card-head"
                        disabled={!card.nav}
                        onClick={() => card.nav && onNavigate(card.nav)}
                        type="button"
                      >
                        <strong>{card.title}</strong>
                        {card.subtitle ? <span>{card.subtitle}</span> : null}
                        {card.nav ? <em>Open ›</em> : null}
                      </button>
                      {card.lines.map((line, lineIndex) => (
                        line.nav ? (
                          <button
                            className="lcc-chat__card-line is-nav"
                            key={lineIndex}
                            onClick={() => onNavigate(line.nav as TurnChatNav)}
                            type="button"
                          >
                            {line.text}
                          </button>
                        ) : (
                          <p className="lcc-chat__card-line" key={lineIndex}>{line.text}</p>
                        )
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
              {message.intents ? (
                message.intents.outcomes ? (
                  <div className="lcc-chat__card">
                    <p className="lcc-chat__done">✓ Done — {message.intents.outcomes.length} handled</p>
                    {message.intents.outcomes.map((line, index) => (
                      <p className="lcc-chat__card-line" key={index}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className="lcc-chat__card">
                    <p className="lcc-chat__card-line">Here’s what I heard — untick anything wrong:</p>
                    {message.intents.result.intents.map((intent, index) => (
                      <label className="lcc-chat__intent" key={index}>
                        <input
                          checked={message.intents?.checked.has(index) ?? false}
                          onChange={() => {
                            const block = message.intents;
                            if (!block) return;
                            const next = new Set(block.checked);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            patch(message.id, { intents: { ...block, checked: next } });
                          }}
                          type="checkbox"
                        />
                        <span>
                          {intent.summary}
                          {intent.confidence === 'low' ? <em> — double-check me</em> : null}
                        </span>
                      </label>
                    ))}
                    {message.intents.result.uncertainties.length > 0 ? (
                      <p className="lcc-chat__card-line is-uncertain">
                        {message.intents.result.uncertainties.join(' · ')}
                      </p>
                    ) : null}
                    <div className="lcc-chat__chips">
                      <button
                        className="is-primary"
                        disabled={message.intents.checked.size === 0}
                        onClick={() => {
                          const block = message.intents;
                          if (block) applyIntents(message.id, block);
                        }}
                        type="button"
                      >
                        Do {message.intents.checked.size} thing{message.intents.checked.size === 1 ? '' : 's'}
                      </button>
                      <button
                        onClick={() => patch(message.id, {
                          intents: undefined,
                          text: 'Okay — nothing done.',
                        })}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>

        <div className="lcc-chat__composer">
          <textarea
            aria-label="Ask or tell Turn OS"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask or tell — “608”, “Rocky today”, “1608 drop C”…"
            ref={inputRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label="Send"
            className="lcc-chat__send"
            disabled={!draft.trim()}
            onClick={send}
            type="button"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
