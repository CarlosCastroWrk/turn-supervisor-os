import {
  AlertTriangle,
  ArrowUp,
  Bot,
  ImagePlus,
  Mic,
  Paperclip,
  Square,
  UserRound,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  type IntelligenceDiagnostics,
  type IntelligenceSource,
  type RouteDecision,
  type TurnChatContext,
  type TurnChatMessage,
  type TurnIntelligenceClient,
  type TurnProposal,
} from './contracts';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ProposalCard } from './ProposalCard';
import { reviewProposal, type ProposalReviewAction } from './proposals';
import './turnIntelligence.css';

export interface TurnChatPanelProps {
  client: TurnIntelligenceClient;
  contexts: readonly TurnChatContext[];
  initialMessages?: readonly TurnChatMessage[];
  providerState: 'mock' | 'disabled' | 'unavailable';
}

const suggestions = [
  'Which synthetic Units need my walk?',
  'Draft a note about Unit 413 Paint A.',
  'Summarize the current synthetic context.',
] as const;

const contextLabel = (context: TurnChatContext) => {
  if (context.kind === 'trade-section') {
    return `Unit ${context.unitNumber} · ${context.trade} ${context.section}`;
  }
  if (context.kind === 'unit') return `Unit ${context.unitNumber}`;
  if (context.kind === 'property') return context.propertyName ?? 'Property';
  return 'General';
};

const newMessage = (role: TurnChatMessage['role'], content: string): TurnChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: new Date().toISOString(),
  sourceIds: [],
});

export function TurnChatPanel({ client, contexts, initialMessages = [], providerState }: TurnChatPanelProps) {
  const [contextIndex, setContextIndex] = useState(0);
  const [messages, setMessages] = useState<TurnChatMessage[]>([...initialMessages]);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteDecision | null>(null);
  const [diagnostics, setDiagnostics] = useState<IntelligenceDiagnostics | null>(null);
  const [sources, setSources] = useState<IntelligenceSource[]>([]);
  const [proposals, setProposals] = useState<TurnProposal[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const context = contexts[contextIndex] ?? contexts[0];

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );

  if (!context) {
    return <section className="ti-chat ti-chat--empty">Turn Chat needs at least one explicit context.</section>;
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const wording = text.trim();
    if (!wording || streaming) return;
    const userMessage = newMessage('user', wording);
    const assistantMessage = newMessage('assistant', '');
    const requestMessages = [...messages, userMessage];
    setMessages([...requestMessages, assistantMessage]);
    setText('');
    setError(null);
    setDiagnostics(null);
    setRoute(null);
    setSources([]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for await (const eventPart of client.stream({
        requestId: crypto.randomUUID(),
        task: 'auto',
        context,
        messages: requestMessages,
        attachments: [],
        sources: [],
      }, controller.signal)) {
        if (eventPart.type === 'text-delta') {
          setMessages((current) => current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${eventPart.text}` }
              : message));
        } else if (eventPart.type === 'route') {
          setRoute(eventPart.decision);
        } else if (eventPart.type === 'source') {
          setSources((current) => current.some((source) => source.id === eventPart.source.id)
            ? current
            : [...current, eventPart.source]);
        } else if (eventPart.type === 'proposal') {
          setProposals((current) => [...current, eventPart.proposal]);
        } else if (eventPart.type === 'diagnostics') {
          setDiagnostics(eventPart.diagnostics);
        } else if (eventPart.type === 'error') {
          setError(eventPart.message);
        }
      }
    } catch {
      setError('Turn Chat stopped unexpectedly. No proposal or record was applied.');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const review = (proposalId: string, action: ProposalReviewAction) => {
    setProposals((current) => current.map((proposal) =>
      proposal.id === proposalId ? reviewProposal(proposal, action) : proposal));
  };

  return (
    <section className="ti-chat" aria-label="Turn Chat">
      <header className="ti-chat__header">
        <div>
          <span className="ti-eyebrow">Personal field companion</span>
          <h1>Turn Chat</h1>
        </div>
        <span className={`ti-provider ti-provider--${providerState}`}>
          {providerState === 'mock' ? 'Mock · no live model' : `${providerState} provider`}
        </span>
      </header>

      <div className="ti-context" role="group" aria-label="Chat context">
        {contexts.map((option, index) => (
          <button
            aria-pressed={index === contextIndex}
            key={`${option.kind}-${option.unitId ?? option.propertyId ?? index}`}
            onClick={() => setContextIndex(index)}
            type="button"
          >
            {contextLabel(option)}
          </button>
        ))}
      </div>

      <aside className="ti-safety">
        <AlertTriangle size={17} aria-hidden="true" />
        <span>Advisory only. Paper remains authoritative. No approval, payroll, message, or Unit changes.</span>
      </aside>

      <div className="ti-chat__history" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ti-empty">
            <Bot size={28} aria-hidden="true" />
            <h2>Ask from an explicit field context</h2>
            <p>Mock mode demonstrates the contract and review flow with synthetic data only.</p>
          </div>
        ) : messages.map((message) => (
          <article className={`ti-message ti-message--${message.role}`} key={message.id}>
            <span className="ti-message__avatar" aria-hidden="true">
              {message.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}
            </span>
            <div>
              <strong>{message.role === 'assistant' ? 'Turn Chat' : 'Los'}</strong>
              <p>{message.content || (streaming ? 'Thinking…' : 'No response text was returned.')}</p>
              {message.sourceIds.length > 0 ? (
                <ul>{message.sourceIds.map((id) => <li key={id}>{sourceById.get(id)?.label ?? id}</li>)}</ul>
              ) : null}
            </div>
          </article>
        ))}

        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            onReview={(action) => review(proposal.id, action)}
          />
        ))}

        {sources.length > 0 ? (
          <section className="ti-sources" aria-label="Sources">
            <h2>Sources</h2>
            <ul>{sources.map((source) => (
              <li key={source.id}><strong>{source.label}</strong><span>{source.trust} · cannot authorize work</span></li>
            ))}</ul>
          </section>
        ) : null}
        {error ? <div className="ti-error" role="alert">{error}</div> : null}
        <DiagnosticsPanel diagnostics={diagnostics} route={route} />
      </div>

      <div className="ti-suggestions" aria-label="Suggestions">
        {suggestions.map((suggestion) => (
          <button disabled={streaming} key={suggestion} onClick={() => setText(suggestion)} type="button">
            {suggestion}
          </button>
        ))}
      </div>

      <form className="ti-composer" onSubmit={submit}>
        <div className="ti-composer__disabled-tools" aria-label="Unavailable input tools">
          <button disabled title="Attachment integration is not available in Track C" type="button">
            <Paperclip size={18} aria-hidden="true" /><span className="sr-only">Attachments unavailable</span>
          </button>
          <button disabled title="Visual upload integration is not available in Track C" type="button">
            <ImagePlus size={18} aria-hidden="true" /><span className="sr-only">Visual upload unavailable</span>
          </button>
          <button disabled title="Microphone integration is not available in Track C" type="button">
            <Mic size={18} aria-hidden="true" /><span className="sr-only">Microphone unavailable</span>
          </button>
        </div>
        <label>
          <span className="sr-only">Ask or draft in Turn Chat</span>
          <textarea
            maxLength={8_000}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Ask about ${contextLabel(context)}…`}
            rows={2}
            value={text}
          />
        </label>
        {streaming ? (
          <button
            aria-label="Stop response"
            className="ti-composer__send is-stop"
            onClick={() => abortRef.current?.abort('Stopped by Los')}
            type="button"
          ><Square size={17} aria-hidden="true" /></button>
        ) : (
          <button
            aria-label="Send"
            className="ti-composer__send"
            disabled={!text.trim()}
            type="submit"
          ><ArrowUp size={18} aria-hidden="true" /></button>
        )}
      </form>
      <p className="ti-composer-note">Typed input works. Attachment, camera, and microphone controls are intentionally disabled in this isolated slice.</p>
    </section>
  );
}
