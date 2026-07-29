import { ArrowLeft, ExternalLink } from 'lucide-react';
import { OFFICIAL_PDS_LINKS } from '../../config/officialPdsLinks';
import './acceptedCore.css';

export function OfficialPdsFormsPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="w2a2-core-page" data-testid="official-pds-forms">
      <header className="w2a2-core-page__header">
        <button
          aria-label="Back to More"
          className="w2a2-core-icon-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={22} />
        </button>
        <div>
          <h1>Official PDS Forms</h1>
          <p>External links · explicit tap only</p>
        </div>
      </header>

      <div className="w2a2-core-page__scroll" data-turn-scroll-region="primary">
        <section className="w2a2-core-boundary" role="note">
          <strong>These forms are outside Turn OS.</strong>
          <p>
            Turn OS does not prefill, submit, validate, track, or store their contents.
          </p>
        </section>

        <div className="w2a2-core-form-links">
          {OFFICIAL_PDS_LINKS.map((link) => (
            <a
              href={link.url}
              key={link.id}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span>
                <strong>{link.label}</strong>
                <small>{link.description}</small>
                <code>{link.url}</code>
              </span>
              <ExternalLink aria-hidden="true" size={20} />
            </a>
          ))}
        </div>

        <p className="w2a2-core-caption">
          Opening a link is not retained as an activity record. Complete official work
          only in the external PDS destination.
        </p>
      </div>
    </section>
  );
}
