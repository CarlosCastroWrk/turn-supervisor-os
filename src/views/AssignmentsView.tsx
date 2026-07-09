import { Check, Clock, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, CommittedTextarea, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { addAssignment, updateAssignment } from '../lib/actions';
import { ASSIGNMENT_STATUSES, CREW_TRADES, createId, nowISO, todayISO } from '../lib/constants';
import { getProjectAssignments, getProjectBuildings, getProjectCrewMembers, getProjectUnits } from '../lib/metrics';
import type { AppData, AssignmentStatus, CrewTrade } from '../types';

interface AssignmentsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function AssignmentsView({ data, setData }: AssignmentsViewProps) {
  const units = getProjectUnits(data);
  const buildings = getProjectBuildings(data);
  const crewMembers = getProjectCrewMembers(data);
  const assignments = getProjectAssignments(data).sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
  const [date, setDate] = useState(todayISO());
  const [crewMemberId, setCrewMemberId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [trade, setTrade] = useState<CrewTrade>('Painter');
  const [buildingId, setBuildingId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [expectedCompletion, setExpectedCompletion] = useState('');
  const [notes, setNotes] = useState('');

  const createAssignment = () => {
    const crew = crewMembers.find((item) => item.id === crewMemberId);
    if (!scope.trim() && !teamName.trim() && !crew) {
      return;
    }

    const linkedUnits = units.filter((unit) => unitIds.includes(unit.id));
    const now = nowISO();
    setData((current) =>
      addAssignment(current, {
        id: createId('assignment'),
        projectId: current.activeProjectId,
        crewMemberId: crew?.id,
        teamName: crew?.company || crew?.name || teamName || `${trade} team`,
        trade,
        buildingId: buildingId || linkedUnits[0]?.buildingId,
        floorId: linkedUnits[0]?.floorId,
        unitIds,
        scope,
        date,
        startTime,
        expectedCompletion,
        actualCompletion: '',
        status: 'Planned',
        notes,
        createdAt: now,
        updatedAt: now,
      }),
    );
    setTeamName('');
    setUnitIds([]);
    setScope('');
    setNotes('');
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Who is where?</span>
          <h1>Assignments</h1>
        </div>
      </div>

      <Section title="Create Assignment" kicker="Simple coverage">
        <div className="form-card">
          <div className="grid three">
            <Field label="Date">
              <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
            </Field>
            <Field label="Crew contact">
              <select value={crewMemberId} onChange={(event) => setCrewMemberId(event.target.value)}>
                <option value="">Team name only</option>
                {crewMembers.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.name} · {crew.trade}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team name">
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="If no individual selected" />
            </Field>
            <Field label="Trade">
              <select value={trade} onChange={(event) => setTrade(event.target.value as CrewTrade)}>
                {CREW_TRADES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Building">
              <select value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
                <option value="">From selected unit(s)</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start time">
              <input value={startTime} onChange={(event) => setStartTime(event.target.value)} type="time" />
            </Field>
            <Field label="Expected completion">
              <input value={expectedCompletion} onChange={(event) => setExpectedCompletion(event.target.value)} type="time" />
            </Field>
          </div>
          <Field label="Units">
            <select multiple value={unitIds} onChange={(event) => setUnitIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Scope">
            <textarea value={scope} rows={3} onChange={(event) => setScope(event.target.value)} placeholder="Paint Unit 101 bedrooms. Clean Units 201 and 203." />
          </Field>
          <Field label="Notes">
            <textarea value={notes} rows={2} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <Button variant="primary" onClick={createAssignment}>
            <Plus size={18} aria-hidden="true" />
            Add Assignment
          </Button>
        </div>
      </Section>

      <Section title="Assignment Board" kicker={`${assignments.length} total`}>
        <div className="assignment-list">
          {assignments.map((assignment) => {
            const linkedUnits = units.filter((unit) => assignment.unitIds.includes(unit.id));
            return (
              <article className="assignment-card" key={assignment.id}>
                <div className="assignment-card__header">
                  <div>
                    <h3>{assignment.teamName}</h3>
                    <small>
                      {assignment.date} · {assignment.startTime || 'No start'} · {linkedUnits.map((unit) => unit.unitNumber).join(', ') || 'No units'}
                    </small>
                  </div>
                  <StatusBadge value={assignment.status} />
                </div>
                <p>{assignment.scope || 'No scope noted.'}</p>
                <div className="quick-status-row">
                  {ASSIGNMENT_STATUSES.map((status) => (
                    <Button
                      key={status}
                      className={assignment.status === status ? 'is-selected' : ''}
                      onClick={() =>
                        setData((current) =>
                          updateAssignment(current, assignment.id, {
                            status: status as AssignmentStatus,
                            actualCompletion: status === 'Complete' ? new Date().toTimeString().slice(0, 5) : assignment.actualCompletion,
                          }),
                        )
                      }
                    >
                      {status === 'Checked In' ? <Check size={16} aria-hidden="true" /> : null}
                      {status === 'Delayed' ? <Clock size={16} aria-hidden="true" /> : null}
                      {status}
                    </Button>
                  ))}
                </div>
                <Field label="Notes">
                  <CommittedTextarea
                    draftKey={`assignment:${assignment.id}:notes`}
                    rows={2}
                    value={assignment.notes}
                    onCommit={(notes) => setData((current) => updateAssignment(current, assignment.id, { notes }))}
                  />
                </Field>
              </article>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
