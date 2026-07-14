import { ArrowRight, BookOpenCheck, ShieldCheck } from 'lucide-react';
import { fieldPlaybooks } from '../lib/playbooks';
import type { AppNavigate } from '../lib/routing';

interface PlaybooksViewProps {
  onNavigate: AppNavigate;
}

export function PlaybooksView({ onNavigate }: PlaybooksViewProps) {
  return (
    <div className="page page--playbooks">
      <div className="page-title playbooks-title">
        <div>
          <span className="quiet-label">Repeat the safe routine</span>
          <h1>Turn OS Playbooks</h1>
          <p>Short guides for using this personal field notebook. They are not official company procedures.</p>
        </div>
        <BookOpenCheck size={30} aria-hidden="true" />
      </div>

      <div className="playbook-grid">
        {fieldPlaybooks.map((playbook, index) => (
          <article className="playbook-card" key={playbook.id} aria-labelledby={`${playbook.id}-title`}>
            <div className="playbook-card__header">
              <span className="quiet-label">{playbook.when}</span>
              <h2 id={`${playbook.id}-title`}>{playbook.title}</h2>
              <p>{playbook.outcome}</p>
            </div>

            <ol className="playbook-steps">
              {playbook.steps.map((step, stepIndex) => (
                <li key={step.title}>
                  <span>{stepIndex + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="playbook-card__safety">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{playbook.safetyNote}</span>
            </div>

            <button className="playbook-card__action" type="button" onClick={() => onNavigate(playbook.action.view)}>
              <span>{index === 0 ? 'Start here' : 'Open workflow'}</span>
              <strong>{playbook.action.label}</strong>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
