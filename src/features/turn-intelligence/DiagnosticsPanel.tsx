import type { IntelligenceDiagnostics, RouteDecision } from './contracts';

export function DiagnosticsPanel({
  diagnostics,
  route,
}: {
  diagnostics: IntelligenceDiagnostics | null;
  route: RouteDecision | null;
}) {
  if (!route && !diagnostics) return null;
  return (
    <details className="ti-diagnostics">
      <summary>Run details</summary>
      <dl>
        <div><dt>Route</dt><dd>{route?.tier ?? 'Unknown'}</dd></div>
        <div><dt>Model</dt><dd>{diagnostics?.provider.modelId ?? route?.modelId ?? 'No model'}</dd></div>
        <div><dt>Provider</dt><dd>{diagnostics?.provider.provider ?? 'Pending'}</dd></div>
        <div><dt>Latency</dt><dd>{diagnostics ? `${diagnostics.latencyMs} ms` : 'Pending'}</dd></div>
        <div><dt>Tokens</dt><dd>{diagnostics?.usage.totalTokens ?? 'Not reported'}</dd></div>
        <div><dt>Cost</dt><dd>{diagnostics?.usage.estimatedCostUsd == null ? 'Not reported' : `$${diagnostics.usage.estimatedCostUsd.toFixed(4)}`}</dd></div>
      </dl>
    </details>
  );
}
