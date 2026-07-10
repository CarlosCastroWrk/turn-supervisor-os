import { Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { FieldEntryDialog } from '../components/FieldEntryDialog';
import { Button, CommittedTextarea, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toast-context';
import { addCrewMember, updateCrewMember } from '../lib/actions';
import { CREW_TRADES, createId, nowISO } from '../lib/constants';
import { getApplicableMemories } from '../lib/memory';
import { getActiveProject, getProjectCrewMembers } from '../lib/metrics';
import type { AppData, CrewTrade } from '../types';

interface CrewsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function CrewsView({ data, setData }: CrewsViewProps) {
  const { notify } = useToast();
  const project = getActiveProject(data);
  const crewMembers = getProjectCrewMembers(data);
  const crewMemories = getApplicableMemories(data, ['Crew Memory']);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState<CrewTrade>('Painter');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const addCrewButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeAddCrew = () => {
    setIsAddOpen(false);
    window.requestAnimationFrame(() => addCrewButtonRef.current?.focus({ preventScroll: true }));
  };

  const addCrew = () => {
    if (!name.trim()) {
      notify('Add a crew name before saving.', { tone: 'error' });
      return;
    }

    const now = nowISO();
    const crewName = name.trim();
    setData((current) =>
      addCrewMember(current, {
        id: createId('crew'),
        projectId: current.activeProjectId,
        name: crewName,
        trade,
        phone: phone.trim(),
        company: '',
        language: '',
        assignedLocation: '',
        notes: notes.trim(),
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    setName('');
    setPhone('');
    setNotes('');
    closeAddCrew();
    notify(`${crewName} added to the crew directory.`, { tone: 'success' });
  };

  return (
    <>
      <div className="page page--board-first">
        <div className="field-page-header">
          <div>
            <h1>Crew</h1>
            <p>Keep the people you need close. Crew updates can also come through Capture.</p>
          </div>
          <button ref={addCrewButtonRef} className="button button--primary board-add-button" type="button" onClick={() => setIsAddOpen(true)}>
            <Plus size={18} aria-hidden="true" />
            Add crew
          </button>
        </div>

        <Section title="Crew directory" kicker={`${crewMembers.length} ${project.mode === 'real' ? 'real Turn' : 'demo'} contacts`} className="crew-directory">
          <div className="crew-grid crew-grid--directory">
            {crewMembers.map((crew) => (
              <article className="crew-card crew-card--directory" key={crew.id}>
                <div className="crew-card__header">
                  <div>
                    <h3>{crew.name}</h3>
                    <small>{crew.company || crew.assignedLocation || 'Field contact'}</small>
                  </div>
                  <StatusBadge value={crew.trade} />
                </div>
                <div className="crew-directory-meta">
                  {crew.phone ? <span>{crew.phone}</span> : <span>No phone saved</span>}
                  <span>{crew.active ? 'Active today' : 'Inactive'}</span>
                </div>
                {crew.notes ? <p className="crew-card__note">{crew.notes}</p> : <p className="crew-card__note muted">No note yet.</p>}
                <details className="crew-card__details">
                  <summary>Edit contact</summary>
                  <Field label="Observation note">
                    <CommittedTextarea
                      draftKey={`crew:${crew.id}:notes`}
                      rows={3}
                      value={crew.notes}
                      onCommit={(nextNotes) => setData((current) => updateCrewMember(current, crew.id, { notes: nextNotes }))}
                      placeholder="Arrived, assigned area, supply or access update..."
                    />
                  </Field>
                  <Button
                    onClick={() => setData((current) => updateCrewMember(current, crew.id, { active: !crew.active }))}
                    variant={crew.active ? 'secondary' : 'ghost'}
                  >
                    {crew.active ? <ToggleRight size={18} aria-hidden="true" /> : <ToggleLeft size={18} aria-hidden="true" />}
                    {crew.active ? 'Active' : 'Inactive'}
                  </Button>
                </details>
              </article>
            ))}
            {crewMembers.length === 0 ? <p className="board-empty">No crew contacts yet. Add one when you have a name.</p> : null}
          </div>
        </Section>

        {crewMemories.length > 0 ? (
          <Section title="Crew notes" kicker={`${crewMemories.length} approved fact${crewMemories.length === 1 ? '' : 's'}`} className="crew-memory-section">
            <div className="memory-grid">
              {crewMemories.map((memory) => (
                <article className="memory-card" key={memory.id}>
                  <p>{memory.content}</p>
                  <small>Source: {memory.source}</small>
                </article>
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      {isAddOpen ? (
        <FieldEntryDialog title="Add crew contact" description="Keep it light. You can add details later when they matter." onClose={closeAddCrew}>
          <div className="form-card field-entry-form">
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Team lead or contact" />
            </Field>
            <div className="grid two">
              <Field label="Trade / type">
                <select value={trade} onChange={(event) => setTrade(event.target.value as CrewTrade)}>
                  {CREW_TRADES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Phone (optional)">
                <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="Optional" />
              </Field>
            </div>
            <Field label="Quick note (optional)">
              <textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder="What should you remember about this crew?" />
            </Field>
            <div className="button-row">
              <Button variant="primary" disabled={!name.trim()} onClick={addCrew}><Plus size={18} aria-hidden="true" />Add crew</Button>
              <Button variant="ghost" onClick={closeAddCrew}>Cancel</Button>
            </div>
          </div>
        </FieldEntryDialog>
      ) : null}
    </>
  );
}
