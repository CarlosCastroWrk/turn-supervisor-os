import { ExternalLink, Gauge, WalletCards } from 'lucide-react';
import { Field, NumberInput } from './FormControls';
import { Section } from './Section';
import { getActiveProject } from '../lib/metrics';
import { AI_PRICING_VERSION, formatAiUsd, summarizeAiUsage } from '../lib/ai/usage';
import type { AppData } from '../types';

interface AiUsagePanelProps {
  data: AppData;
  onBudgetChange: (budgetUsd: number) => void;
}

const formatCallTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export function AiUsagePanel({ data, onBudgetChange }: AiUsagePanelProps) {
  const project = getActiveProject(data);
  const events = data.aiUsageEvents
    .filter((event) => event.projectId === project.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const summary = summarizeAiUsage(events, project.aiBudgetUsd);
  const aiEnabled = import.meta.env.VITE_ENABLE_AI === 'true';
  const percentUsedLabel = summary.percentUsed > 0 && summary.percentUsed < 1
    ? '<1% used'
    : `${Math.round(summary.percentUsed)}% used`;
  const visiblePercentUsed = summary.percentUsed > 0 ? Math.max(1, summary.percentUsed) : 0;

  return (
    <Section title="AI Usage" kicker={aiEnabled ? 'Metering active' : 'Ready to activate'}>
      <div className="ai-usage-panel">
        <div className="ai-usage-panel__header">
          <div className="ai-usage-panel__identity">
            <span className={`ai-status-dot ${aiEnabled ? 'is-active' : ''}`} aria-hidden="true" />
            <div>
              <strong>{aiEnabled ? 'Cost-aware routing on' : 'AI assist not active'}</strong>
              <small>{project.name}</small>
            </div>
          </div>
          <a
            className="ai-billing-link"
            href="https://platform.openai.com/settings/organization/billing/overview"
            target="_blank"
            rel="noreferrer"
          >
            OpenAI Billing
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>

        <div className="ai-usage-metrics">
          <article>
            <span>Estimated remaining</span>
            <strong>{formatAiUsd(summary.remainingUsd)}</strong>
          </article>
          <article>
            <span>Estimated used</span>
            <strong>{formatAiUsd(summary.totalCostUsd)}</strong>
          </article>
          <article>
            <span>Model calls</span>
            <strong>{summary.callCount.toLocaleString()}</strong>
          </article>
          <article>
            <span>Average call</span>
            <strong>{formatAiUsd(summary.averageCostUsd)}</strong>
          </article>
        </div>

        <div className="ai-budget-meter">
          <div className="ai-budget-meter__meta">
            <span>Turn budget</span>
            <strong>{percentUsedLabel}</strong>
          </div>
          <div
            className="ai-budget-meter__track"
            role="progressbar"
            aria-label="Estimated AI budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.percentUsed}
          >
            <span style={{ width: `${visiblePercentUsed}%` }} />
          </div>
        </div>

        <div className="ai-usage-panel__controls">
          <Field label="Turn AI budget">
            <NumberInput
              draftKey={`project:${project.id}:aiBudgetUsd`}
              min={0}
              max={10_000}
              value={project.aiBudgetUsd}
              onValueChange={onBudgetChange}
            />
          </Field>
          <div className="ai-budget-note">
            <WalletCards size={18} aria-hidden="true" />
            <p>This Turn only. OpenAI Billing is the official account balance.</p>
          </div>
        </div>

        <details className="ai-routing-details">
          <summary>Model routing</summary>
          <div className="ai-routing-grid">
            <div><span>Local</span><strong>No API cost</strong><small>Demo, offline, or provider fallback</small></div>
            <div><span>Fast</span><strong>gpt-5.4-nano</strong><small>Focused capture extraction</small></div>
            <div><span>Complex</span><strong>gpt-5.4-mini</strong><small>Ambiguous or multi-action capture</small></div>
            <div><span>Frontier</span><strong>gpt-5.5</strong><small>Reserved; never auto-selected</small></div>
          </div>
        </details>

        <div className="ai-usage-history">
          <div className="ai-usage-history__heading">
            <div>
              <Gauge size={18} aria-hidden="true" />
              <strong>Recent calls</strong>
            </div>
            <small>{summary.totalTokens.toLocaleString()} tokens metered</small>
          </div>
          {events.length > 0 ? (
            <ol>
              {events.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>{event.modelClass === 'fast' ? 'Fast' : event.modelClass === 'complex' ? 'Complex' : 'Override'} · {event.model}</strong>
                    <small>{formatCallTime(event.createdAt)} · {event.inputTokens.toLocaleString()} in / {event.outputTokens.toLocaleString()} out</small>
                  </div>
                  <strong>{formatAiUsd(event.estimatedCostUsd)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No paid TurnOS model calls recorded for this Turn.</p>
          )}
        </div>

        <small className="ai-pricing-note">Successful calls in this Turn, estimated with text-token rates verified {AI_PRICING_VERSION}.</small>
      </div>
    </Section>
  );
}
