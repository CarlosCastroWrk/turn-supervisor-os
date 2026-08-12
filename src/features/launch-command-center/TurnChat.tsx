import { useEffect, useRef, useState } from 'react';
import {
  chatWithTurnOS,
  type ChatTurnMessage,
  type InterpretResult,
  type TurnIntent,
} from '../../lib/intelligenceClient';
import {
  answerTurnChat,
  buildTurnChatDigest,
  buildTurnChatHistoryDigest,
  type TurnChatAnswer,
  type TurnChatNav,
} from './turnChatAnswer';
import type { TrackCState } from '../wave2a2-track-c/model';

// Turn Chat — the Plus button's front door. One thread, three brains:
// 1) the instant local brain answers board questions as tappable cards
//    (free, offline); 2) command sentences go to the interpreter and come
//    back as confirmable intents (nothing writes without a tap); 3) anything
//    else gets a real model turn grounded in a compact board digest.
// Chats are multi-thread with archive, stored device-local like the rest of
// Turn OS (cross-device sync rides the future cloud-sync epic).

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
  readonly offerAi?: string; // reruns the interpreter with this text on tap
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

// Only TEXT survives storage. Cards are rebuilt from live data on demand and
// pending intents must be re-read — and fat persisted cards once ate the
// browser-storage quota the operational ledger lives in. Never again.
type StoredMessage = Pick<ChatMessage, 'id' | 'role' | 'text'> & {
  readonly answer?: TurnChatAnswer;
  readonly outcomes?: readonly string[];
};

interface ChatThread {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean;
  readonly messages: readonly StoredMessage[];
}

interface ThreadStore {
  readonly activeId: string;
  readonly threads: readonly ChatThread[];
}

const STORE_KEY = 'turn-os:chat-threads-v1';
const LEGACY_KEY = 'turn-os:chat-thread';
const THREAD_CAP = 40; // messages per thread
const STORE_CAP = 12; // threads kept overall — storage is shared with the ledger

const newThread = (): ChatThread => ({
  createdAt: Date.now(),
  id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  messages: [],
  title: 'New chat',
  updatedAt: Date.now(),
});

const loadStore = (): ThreadStore => {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThreadStore;
      if (parsed.threads?.length > 0) return parsed;
    }
    // First run after the single-thread version: carry that chat over.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const messages = JSON.parse(legacy) as StoredMessage[];
      window.localStorage.removeItem(LEGACY_KEY);
      const thread: ChatThread = {
        ...newThread(),
        messages,
        title: messages.find((message) => message.role === 'los')?.text?.slice(0, 40) ?? 'Earlier chat',
      };
      return { activeId: thread.id, threads: [thread] };
    }
  } catch { /* fall through to a fresh store */ }
  const thread = newThread();
  return { activeId: thread.id, threads: [thread] };
};

const persistStore = (store: ThreadStore) => {
  try {
    const kept = [...store.threads]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, STORE_CAP);
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      activeId: store.activeId,
      threads: kept,
    }));
  } catch { /* the thread list is a convenience, never worth an error */ }
};

const rehydrate = (stored: readonly StoredMessage[]): ChatMessage[] =>
  stored.map((message) => ({
    answer: message.outcomes
      ? { cards: [], note: `✓ Done — ${message.outcomes.join(' · ')}` }
      : message.answer,
    id: message.id,
    role: message.role,
    text: message.text,
  }));

const dehydrate = (messages: readonly ChatMessage[]): StoredMessage[] =>
  messages
    .filter((message) => !message.busy)
    .slice(-THREAD_CAP)
    .map((message) => ({
      id: message.id,
      outcomes: message.intents?.outcomes,
      role: message.role,
      // Cards collapse to their title line — live data answers fresh anyway.
      text: message.text
        ?? message.answer?.note
        ?? (message.answer?.cards.length
          ? message.answer.cards.map((card) => `▸ ${card.title}`).join('\n')
          : undefined),
    }));

const threadDay = (stamp: number) =>
  new Date(stamp).toLocaleDateString([], { day: 'numeric', month: 'short' });

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
  const [store, setStore] = useState<ThreadStore>(loadStore);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = loadStore();
    const thread = active.threads.find((candidate) => candidate.id === active.activeId);
    return thread ? rehydrate(thread.messages) : [];
  });
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const nextId = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = store.threads.find((thread) => thread.id === store.activeId);

  // Write the live messages back into the active thread + persist. The title
  // is the first thing Los said, like every chat app he knows.
  useEffect(() => {
    setStore((current) => {
      const next: ThreadStore = {
        activeId: current.activeId,
        threads: current.threads.map((thread) => {
          if (thread.id !== current.activeId) return thread;
          const firstLos = messages.find((message) => message.role === 'los')?.text;
          return {
            ...thread,
            messages: dehydrate(messages),
            title: firstLos ? firstLos.slice(0, 40) : thread.title,
            updatedAt: messages.length > 0 ? Date.now() : thread.updatedAt,
          };
        }),
      };
      persistStore(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Scroll behavior: new messages scroll to the bottom, but coming BACK from
  // a unit he opened off a card restores the exact spot in the list — so he
  // can work a long card top to bottom without re-scrolling every time.
  const savedScrollRef = useRef<number | null>(null);
  const messageCountRef = useRef(messages.length);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !open) return;
    if (savedScrollRef.current !== null) {
      scroller.scrollTop = savedScrollRef.current;
      savedScrollRef.current = null;
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, [open]);
  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
    messageCountRef.current = messages.length;
  }, [messages]);

  const navigateFromCard = (nav: TurnChatNav) => {
    savedScrollRef.current = scrollRef.current?.scrollTop ?? null;
    onNavigate(nav);
  };

  const [copiedCard, setCopiedCard] = useState<string | null>(null);

  // Markdown-lite for model replies: ## headings, - bullets, **bold** — the
  // clean-report look without any HTML risk (we only build React nodes).
  const renderInline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={index}>{part.slice(2, -2)}</strong>
        : part);
  const renderRich = (text: string) => text.split('\n').map((line, index) => {
    if (/^#{1,3}\s+/.test(line)) {
      return <span className="lcc-chat__rich-h" key={index}>{renderInline(line.replace(/^#{1,3}\s+/, ''))}</span>;
    }
    if (/^[-•]\s+/.test(line)) {
      return <span className="lcc-chat__rich-li" key={index}>{renderInline(line.replace(/^[-•]\s+/, ''))}</span>;
    }
    if (!line.trim()) return <span className="lcc-chat__rich-gap" key={index} />;
    return <span className="lcc-chat__rich-p" key={index}>{renderInline(line)}</span>;
  });

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

  const switchThread = (threadId: string) => {
    const thread = store.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;
    const next = { activeId: threadId, threads: store.threads };
    setStore(next);
    persistStore(next);
    setMessages(rehydrate(thread.messages));
    setMenuOpen(false);
  };

  const startNewChat = () => {
    const thread = newThread();
    const next: ThreadStore = {
      activeId: thread.id,
      threads: [thread, ...store.threads],
    };
    setStore(next);
    persistStore(next);
    setMessages([]);
    setMenuOpen(false);
  };

  const setArchived = (threadId: string, archived: boolean) => {
    setStore((current) => {
      const threads = current.threads.map((thread) =>
        thread.id === threadId ? { ...thread, archived } : thread);
      // Archiving the open chat drops you on the newest live one (or a fresh one).
      let activeId = current.activeId;
      if (archived && activeId === threadId) {
        const fallback = threads.find((thread) => !thread.archived) ?? newThread();
        if (!threads.includes(fallback)) threads.unshift(fallback);
        activeId = fallback.id;
        setMessages(rehydrate(fallback.messages));
      }
      const next = { activeId, threads };
      persistStore(next);
      return next;
    });
  };

  const deleteThread = (threadId: string) => {
    setStore((current) => {
      const threads = current.threads.filter((thread) => thread.id !== threadId);
      let activeId = current.activeId;
      if (activeId === threadId) {
        const fallback = threads.find((thread) => !thread.archived) ?? newThread();
        if (!threads.includes(fallback)) threads.unshift(fallback);
        activeId = fallback.id;
        setMessages(rehydrate(fallback.messages));
      }
      const next = { activeId, threads };
      persistStore(next);
      return next;
    });
  };

  // One line of context per prior turn so follow-ups ("just the note",
  // "same for 1204") land — proposals and outcomes ride along as text.
  const contextText = (message: ChatMessage): string | undefined => {
    if (message.intents) {
      const summaries = message.intents.result.intents
        .map((intent) => intent.summary).join('; ');
      return message.intents.outcomes
        ? `Done after his confirm: ${message.intents.outcomes.join('; ')}`
        : `I proposed (awaiting his confirm): ${summaries}`;
    }
    if (message.text) return message.text;
    return message.answer?.note;
  };

  // The unified turn — the model answers AND proposes actions in one call,
  // grounded in the board digest. Writes still land only after his confirm.
  const runUnified = async (history: readonly ChatMessage[], text: string) => {
    const id = push({ busy: true, role: 'os', text: 'Thinking…' });
    const turns: ChatMessage[] = [...history, { id: 0, role: 'los', text }];
    const tail: ChatTurnMessage[] = turns
      .map((message) => ({
        role: message.role === 'los' ? 'user' as const : 'assistant' as const,
        text: contextText(message) ?? '',
      }))
      .filter((message) => Boolean(message.text))
      .slice(-8);
    try {
      // Board now + pay-week history ride along so counts questions get his
      // real numbers. Hard-capped to stay inside the request schema.
      const digest = [
        buildTurnChatDigest(stateRef.current),
        buildTurnChatHistoryDigest(stateRef.current, new Date()),
      ].filter(Boolean).join('\n\n').slice(0, 15_500);
      const result = await chatWithTurnOS({
        crews: stateRef.current.crews.map((crew) => ({ name: crew.name, trade: crew.trade })),
        digest,
        messages: tail,
        rosterUnitNumbers: stateRef.current.units.map((unit) => unit.unitNumber),
      });
      patch(id, {
        busy: false,
        intents: result.intents.length > 0
          ? {
            checked: new Set(result.intents.map((_, index) => index)),
            result: { intents: result.intents, uncertainties: result.uncertainties },
            sourceText: text,
          }
          : undefined,
        text: result.reply || (result.intents.length > 0 ? undefined : '…'),
      });
    } catch (caught) {
      patch(id, {
        busy: false,
        offerAi: text,
        text: caught instanceof Error
          ? caught.message
          : 'Could not answer right now — try again.',
      });
    }
  };

  // Plain words count as the tap: a short yes applies the pending proposal,
  // a short no dismisses it. Anything longer goes to the model WITH the
  // proposal in context, so "just the note" can narrow it.
  const YES_RE = /^(y|yes|yeah|yep|yup|ok|okay|sure|confirm|go|do it|do both|both|do all|dale|s[ií]|hazlo|send it)[.!\s]*$/i;
  const NO_RE = /^(no|nope|nah|cancel|never ?mind|stop|don'?t)[.!\s]*$/i;

  const pendingProposal = (): ChatMessage | undefined =>
    [...messages].reverse().find((message) =>
      message.role === 'os' && message.intents && !message.intents.outcomes);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const history = messages;
    push({ role: 'los', text });

    const pending = pendingProposal();
    if (pending?.intents) {
      if (YES_RE.test(text)) {
        applyIntents(pending.id, pending.intents);
        return;
      }
      if (NO_RE.test(text)) {
        patch(pending.id, { intents: undefined, text: 'Okay — nothing done.' });
        return;
      }
    }

    // The free instant brain answers pure lookups; anything that smells like
    // field talk goes to the unified model turn (it can also just answer).
    if (!looksLikeCommand(text, stateRef.current)) {
      const answer = answerTurnChat(stateRef.current, text);
      if (answer && (answer.cards.length > 0 || answer.note)) {
        push({ answer, role: 'os' });
        return;
      }
    }
    void runUnified(history, text);
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

  if (!open) return null;

  const liveThreads = store.threads.filter((thread) => !thread.archived);
  const archivedThreads = store.threads.filter((thread) => thread.archived);

  return (
    <div aria-label="Turn Chat" className="lcc-chat" role="dialog">
      <div className="lcc-chat__panel">
        <header className="lcc-chat__header">
          <button
            aria-label="Your chats"
            className="lcc-chat__iconbtn"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            ☰
          </button>
          <div className="lcc-chat__title">
            <h2>Turn Chat</h2>
            <p>{activeThread && activeThread.title !== 'New chat' ? activeThread.title : 'Ask the board or tell it what happened'}</p>
          </div>
          <button
            aria-label="New chat"
            className="lcc-chat__iconbtn"
            onClick={startNewChat}
            type="button"
          >
            ＋
          </button>
          <button
            aria-label="Close chat"
            className="lcc-chat__iconbtn"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
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
              <p className="lcc-chat__hello">What’s the move, Los?</p>
              <p>
                A unit number (“608”), a crew (“Rocky today”), a command
                (“1608 drop C, give A and B to Sandra”) — or just ask.
                🎤 on your keyboard to talk.
              </p>
              <div className="lcc-chat__suggestions">
                {['Where are we', 'Ready to walk', 'Callbacks'].map((suggestion) => (
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
              {message.text ? (
                <p className="lcc-chat__bubble">
                  {message.role === 'os' && !message.busy ? renderRich(message.text) : message.text}
                </p>
              ) : null}
              {message.offerAi ? (
                <div className="lcc-chat__chips">
                  <button
                    onClick={() => {
                      const retry = message.offerAi ?? '';
                      patch(message.id, { offerAi: undefined });
                      void runUnified(
                        messages.filter((candidate) => candidate.text !== retry || candidate.role !== 'los'),
                        retry,
                      );
                    }}
                    type="button"
                  >
                    Try again
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
                        onClick={() => card.nav && navigateFromCard(card.nav)}
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
                            onClick={() => navigateFromCard(line.nav as TurnChatNav)}
                            type="button"
                          >
                            {line.text}
                          </button>
                        ) : (
                          <p className="lcc-chat__card-line" key={lineIndex}>{line.text}</p>
                        )
                      ))}
                      {card.copy ? (
                        <div className="lcc-chat__chips">
                          <button
                            className="is-primary"
                            onClick={() => {
                              const key = `${message.id}:${cardIndex}`;
                              void navigator.clipboard?.writeText(card.copy?.text ?? '')
                                .then(() => setCopiedCard(key))
                                .catch(() => setCopiedCard(null));
                            }}
                            type="button"
                          >
                            {copiedCard === `${message.id}:${cardIndex}` ? '✓ Copied' : card.copy.label}
                          </button>
                        </div>
                      ) : null}
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

      {menuOpen ? (
        <div className="lcc-chat__drawer" role="dialog" aria-label="Your chats">
          <button
            aria-label="Close chat list"
            className="lcc-chat__drawer-backdrop"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <div className="lcc-chat__drawer-panel">
            <button className="lcc-chat__drawer-new" onClick={startNewChat} type="button">
              ＋ New chat
            </button>
            <div className="lcc-chat__drawer-list">
              {liveThreads.map((thread) => (
                <div
                  className={`lcc-chat__drawer-row${thread.id === store.activeId ? ' is-active' : ''}`}
                  key={thread.id}
                >
                  <button
                    className="lcc-chat__drawer-open"
                    onClick={() => switchThread(thread.id)}
                    type="button"
                  >
                    <strong>{thread.title}</strong>
                    <span>{threadDay(thread.updatedAt)}</span>
                  </button>
                  <button
                    aria-label={`Archive ${thread.title}`}
                    className="lcc-chat__drawer-action"
                    onClick={() => setArchived(thread.id, true)}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              ))}
            </div>
            {archivedThreads.length > 0 ? (
              <details className="lcc-chat__drawer-archived">
                <summary>Archived · {archivedThreads.length}</summary>
                {archivedThreads.map((thread) => (
                  <div className="lcc-chat__drawer-row" key={thread.id}>
                    <button
                      className="lcc-chat__drawer-open"
                      onClick={() => switchThread(thread.id)}
                      type="button"
                    >
                      <strong>{thread.title}</strong>
                      <span>{threadDay(thread.updatedAt)}</span>
                    </button>
                    <button
                      className="lcc-chat__drawer-action"
                      onClick={() => setArchived(thread.id, false)}
                      type="button"
                    >
                      Restore
                    </button>
                    <button
                      className="lcc-chat__drawer-action is-delete"
                      onClick={() => deleteThread(thread.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </details>
            ) : null}
            <p className="lcc-chat__drawer-note">
              Chats live on this phone. Cloud sync comes with the sync build.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
