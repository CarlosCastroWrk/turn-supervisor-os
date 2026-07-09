import { Check, RotateCcw, Trash2 } from 'lucide-react';
import {
  approveMemoryCandidate,
  rejectMemoryCandidate,
  updateMemory,
  updateMemoryCandidate,
} from '../lib/actions';
import {
  getActiveProjectMemoryCandidates,
  getApplicableMemories,
  getMemoriesForActiveProjectSettings,
  getUnscopedMemoryCandidates,
  memoryAppliesToActiveProject,
  memoryScopeLabel,
} from '../lib/memory';
import type { AppData, MemoryCandidate } from '../types';
import { Button, Field } from './FormControls';
import { Section } from './Section';
import { useToast } from './toast-context';

interface MemorySettingsProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function MemorySettings({ data, setData }: MemorySettingsProps) {
  const { notify } = useToast();
  const pending = getActiveProjectMemoryCandidates(data, 'pending');
  const unscopedCandidates = getUnscopedMemoryCandidates(data);
  const memories = getMemoriesForActiveProjectSettings(data);
  const activeCount = getApplicableMemories(data).length;

  const approve = (candidate: MemoryCandidate) => {
    setData((current) => approveMemoryCandidate(current, candidate.id));
    notify('Memory approved for this Turn.', { tone: 'success' });
  };

  const reject = (candidate: MemoryCandidate) => {
    setData((current) => rejectMemoryCandidate(current, candidate.id));
    notify('Memory candidate rejected. It will not affect output.');
  };

  const assignCandidate = (candidate: MemoryCandidate) => {
    setData((current) => updateMemoryCandidate(current, candidate.id, { projectId: current.activeProjectId }));
    notify('Legacy candidate assigned to the current Turn.', { tone: 'success' });
  };

  return (
    <Section title="Supervisor Memory" kicker={`${activeCount} active`}>
      {pending.length > 0 ? (
        <div className="memory-settings-group">
          <span className="quiet-label">Needs approval</span>
          <div className="memory-grid">
            {pending.map((candidate) => (
              <article className="memory-card" key={candidate.id}>
                <div className="memory-card__meta">
                  <strong>{candidate.memoryType}</strong>
                  <span>{memoryScopeLabel(data, candidate)}</span>
                  <span>{Math.round(candidate.confidence * 100)}% confidence</span>
                </div>
                <Field label="Candidate memory">
                  <textarea
                    aria-label={`${candidate.memoryType} candidate for ${memoryScopeLabel(data, candidate)}`}
                    rows={3}
                    value={candidate.content}
                    onChange={(event) =>
                      setData((current) => updateMemoryCandidate(current, candidate.id, { content: event.target.value }))
                    }
                  />
                </Field>
                <small>Source: {candidate.source}</small>
                <div className="button-row">
                  <Button
                    aria-label={`Approve ${candidate.memoryType} for ${memoryScopeLabel(data, candidate)}`}
                    variant="primary"
                    onClick={() => approve(candidate)}
                    disabled={!candidate.content.trim()}
                  >
                    <Check size={16} aria-hidden="true" />
                    Approve
                  </Button>
                  <Button
                    aria-label={`Reject ${candidate.memoryType} for ${memoryScopeLabel(data, candidate)}`}
                    variant="ghost"
                    onClick={() => reject(candidate)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Reject
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="memory-settings-group">
        <span className="quiet-label">Approved and saved</span>
        <div className="memory-grid">
          {memories.map((memory) => {
            const scopeLabel = memoryScopeLabel(data, memory);
            const needsScope = !memory.projectId && scopeLabel === 'Needs project scope';
            const activeHere = memoryAppliesToActiveProject(data, memory);
            return (
              <article className="memory-card" key={memory.id}>
                <div className="memory-card__meta">
                  <strong>{memory.memoryType}</strong>
                  <span>{scopeLabel}</span>
                  <span>{activeHere ? 'Active' : 'Inactive'}</span>
                </div>
                <Field label="Memory">
                  <textarea
                    aria-label={`${memory.memoryType} memory for ${scopeLabel}`}
                    rows={3}
                    value={memory.content}
                    onChange={(event) =>
                      setData((current) => updateMemory(current, memory.id, { content: event.target.value }))
                    }
                  />
                </Field>
                <small>
                  Source: {memory.source}
                  {memory.lastUsedAt ? ` · Last used ${new Date(memory.lastUsedAt).toLocaleString()}` : ''}
                </small>
                {needsScope ? (
                  <Button
                    aria-label={`Use ${memory.memoryType} for current Turn`}
                    variant="secondary"
                    onClick={() => {
                      setData((current) => updateMemory(current, memory.id, { projectId: current.activeProjectId }));
                      notify('Legacy memory assigned to the current Turn.', { tone: 'success' });
                    }}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Use for current Turn
                  </Button>
                ) : (
                  <Button
                    aria-label={`${memory.approved ? 'Turn off' : 'Turn on'} ${memory.memoryType} for ${scopeLabel}`}
                    aria-pressed={memory.approved}
                    variant={memory.approved ? 'secondary' : 'ghost'}
                    onClick={() => setData((current) => updateMemory(current, memory.id, { approved: !memory.approved }))}
                  >
                    {memory.approved ? 'Turn off' : 'Turn on'}
                  </Button>
                )}
              </article>
            );
          })}
          {memories.length === 0 ? <p className="muted">No saved memory for this Turn.</p> : null}
        </div>
      </div>

      {unscopedCandidates.length > 0 ? (
        <details className="memory-legacy">
          <summary>Needs project scope ({unscopedCandidates.length})</summary>
          <div className="memory-grid">
            {unscopedCandidates.map((candidate) => (
              <article className="memory-card" key={candidate.id}>
                <strong>{candidate.memoryType}</strong>
                <p>{candidate.content}</p>
                <small>Source: {candidate.source}</small>
                <div className="button-row">
                  <Button
                    aria-label={`Use legacy ${candidate.memoryType} for current Turn`}
                    onClick={() => assignCandidate(candidate)}
                  >
                    Use for current Turn
                  </Button>
                  <Button
                    aria-label={`Reject legacy ${candidate.memoryType}`}
                    variant="ghost"
                    onClick={() => reject(candidate)}
                  >
                    Reject
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </Section>
  );
}
