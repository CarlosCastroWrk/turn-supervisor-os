import { Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
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
  const project = getActiveProject(data);
  const crewMembers = getProjectCrewMembers(data);
  const crewMemories = getApplicableMemories(data, ['Crew Memory']);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState<CrewTrade>('Painter');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [language, setLanguage] = useState('');
  const [assignedLocation, setAssignedLocation] = useState('');
  const [notes, setNotes] = useState('');

  const addCrew = () => {
    if (!name.trim()) {
      return;
    }

    const now = nowISO();
    setData((current) =>
      addCrewMember(current, {
        id: createId('crew'),
        projectId: current.activeProjectId,
        name: name.trim(),
        trade,
        phone,
        company,
        language,
        assignedLocation,
        notes,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    setName('');
    setPhone('');
    setCompany('');
    setLanguage('');
    setAssignedLocation('');
    setNotes('');
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Professional factual notes</span>
          <h1>Crew Directory</h1>
        </div>
      </div>

      <Section title="Add Contact / Crew" kicker="Private notebook">
        <div className="form-card">
          <div className="grid three">
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Team lead or contact" />
            </Field>
            <Field label="Trade / type">
              <select value={trade} onChange={(event) => setTrade(event.target.value as CrewTrade)}>
                {CREW_TRADES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="Optional" />
            </Field>
            <Field label="Company / team">
              <input value={company} onChange={(event) => setCompany(event.target.value)} />
            </Field>
            <Field label="Languages">
              <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="If relevant" />
            </Field>
            <Field label="Assigned area">
              <input value={assignedLocation} onChange={(event) => setAssignedLocation(event.target.value)} placeholder="Building A Floor 2" />
            </Field>
          </div>
          <Field label="Factual notes">
            <textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder="Arrived 7:50 AM. Waiting on access. Needs paint supplies." />
          </Field>
          <Button variant="primary" onClick={addCrew}>
            <Plus size={18} aria-hidden="true" />
            Add Crew Contact
          </Button>
        </div>
      </Section>

      {crewMemories.length > 0 ? (
        <Section title="Approved Crew Memory" kicker={`${crewMemories.length} sourced fact${crewMemories.length === 1 ? '' : 's'}`}>
          <div className="memory-grid">
            {crewMemories.map((memory) => (
              <article className="memory-card" key={memory.id}>
                <span className="quiet-label">{memory.memoryType}</span>
                <p>{memory.content}</p>
                <small>Source: {memory.source}</small>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Directory" kicker={`${crewMembers.length} ${project.mode === 'real' ? 'real Turn' : 'demo'} contacts`}>
        <div className="crew-grid">
          {crewMembers.map((crew) => (
            <article className="crew-card" key={crew.id}>
              <div className="crew-card__header">
                <div>
                  <h3>{crew.name}</h3>
                  <small>{crew.company || 'No company noted'}</small>
                </div>
                <StatusBadge value={crew.trade} />
              </div>
              <div className="crew-details">
                <span>Phone: {crew.phone || 'Not set'}</span>
                <span>Language: {crew.language || 'Not set'}</span>
                <span>Assigned: {crew.assignedLocation || 'Not assigned'}</span>
              </div>
              <Field label="Observation notes">
                <textarea
                  rows={3}
                  value={crew.notes}
                  onChange={(event) => setData((current) => updateCrewMember(current, crew.id, { notes: event.target.value }))}
                />
              </Field>
              <Button
                onClick={() => setData((current) => updateCrewMember(current, crew.id, { active: !crew.active }))}
                variant={crew.active ? 'secondary' : 'ghost'}
              >
                {crew.active ? <ToggleRight size={18} aria-hidden="true" /> : <ToggleLeft size={18} aria-hidden="true" />}
                {crew.active ? 'Active' : 'Inactive'}
              </Button>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}
