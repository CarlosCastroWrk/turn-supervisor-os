import { Download, PlayCircle, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { createRealTurnProject, switchActiveProject, updateProject } from '../lib/actions';
import { buildJsonBackup, downloadTextFile } from '../lib/exporters';
import { getActiveProject, getProjectBuildings, getProjectUnits } from '../lib/metrics';
import type { AppData, Project } from '../types';

interface SetupViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function SetupView({ data, setData }: SetupViewProps) {
  const project = getActiveProject(data);
  const date = new Date().toISOString().slice(0, 10);
  const demoProject = data.projects.find((item) => item.mode === 'demo');
  const realProjects = data.projects.filter((item) => item.mode === 'real');
  const activeBuildings = getProjectBuildings(data);
  const activeBuildingIds = useMemo(() => new Set(activeBuildings.map((building) => building.id)), [activeBuildings]);
  const activeFloors = data.floors.filter((floor) => activeBuildingIds.has(floor.buildingId));
  const activeUnits = getProjectUnits(data);
  const [backupTaken, setBackupTaken] = useState(false);
  const [realProjectName, setRealProjectName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supervisorName, setSupervisorName] = useState('Los');
  const [projectManagerName, setProjectManagerName] = useState('Tony');
  const [buildingCount, setBuildingCount] = useState(1);
  const [buildingNames, setBuildingNames] = useState('Building A');
  const [floorsPerBuilding, setFloorsPerBuilding] = useState(0);
  const [unitsPerFloor, setUnitsPerFloor] = useState(0);
  const [firstUnitNumber, setFirstUnitNumber] = useState(101);
  const [bedCount, setBedCount] = useState(0);
  const [bathroomCount, setBathroomCount] = useState(0);
  const [hasCommonArea, setHasCommonArea] = useState(true);
  const [realNotes, setRealNotes] = useState('');

  const saveField = (patch: Partial<Project>) => setData((current) => updateProject(current, project.id, patch));

  const backup = () => {
    downloadTextFile(`turn-supervisor-backup-${date}.json`, buildJsonBackup(data), 'application/json');
    setBackupTaken(true);
  };

  const startRealTurn = () => {
    if (!propertyName.trim()) {
      window.alert('Add the property name before starting Real Turn Mode.');
      return;
    }

    if (!backupTaken) {
      const confirmed = window.confirm('Export a JSON backup before starting Real Turn Mode. Continue without a fresh backup?');
      if (!confirmed) {
        return;
      }
    }

    setData((current) =>
      createRealTurnProject(current, {
        projectName: realProjectName,
        propertyName,
        location,
        startDate,
        endDate,
        supervisorName,
        projectManagerName,
        buildingNames: buildingNames.split('\n'),
        buildingCount,
        floorsPerBuilding,
        unitsPerFloor,
        firstUnitNumber,
        bedCount,
        bathroomCount,
        hasCommonArea,
        notes: realNotes,
      }),
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Editable anytime</span>
          <h1>Project Setup</h1>
        </div>
      </div>

      <Section title="Mode" kicker={project.mode === 'real' ? 'Real Turn Mode' : 'Demo Mode'}>
        <div className={`mode-card mode-card--${project.mode}`}>
          <div>
            <span className="quiet-label">{project.mode === 'real' ? 'Real data active' : 'Sample data active'}</span>
            <h2>{project.mode === 'real' ? 'Real Turn Mode' : 'Demo Mode'}</h2>
            <p>
              {project.mode === 'real'
                ? 'The active board is separated from sample data. Demo data stays available for practice.'
                : 'You are viewing sample data. Start a real Turn before using this in the field.'}
            </p>
          </div>
          <div className="button-row">
            <Button onClick={backup}>
              <Download size={18} aria-hidden="true" />
              Backup JSON
            </Button>
            {demoProject ? (
              <Button onClick={() => setData((current) => switchActiveProject(current, demoProject.id))} variant={project.mode === 'demo' ? 'primary' : 'secondary'}>
                <RotateCcw size={18} aria-hidden="true" />
                Demo Mode
              </Button>
            ) : null}
          </div>
        </div>

        {realProjects.length > 0 ? (
          <div className="project-switcher">
            {realProjects.map((realProject) => (
              <button
                className={`project-chip ${project.id === realProject.id ? 'is-active' : ''}`}
                key={realProject.id}
                type="button"
                onClick={() => setData((current) => switchActiveProject(current, realProject.id))}
              >
                <strong>{realProject.name}</strong>
                <small>{realProject.propertyName || 'No property name'}</small>
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Start Real Turn" kicker="Creates a separate clean project">
        <div className="form-card">
          <p className="muted">
            Use this when you are ready to stop practicing with sample data. Demo records are preserved, but the active board switches
            to a real project.
          </p>
          <div className="grid two">
            <Field label="Project name">
              <input value={realProjectName} onChange={(event) => setRealProjectName(event.target.value)} placeholder="West Campus Turn 2026" />
            </Field>
            <Field label="Property name">
              <input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Actual property name" />
            </Field>
            <Field label="Location">
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Austin, TX" />
            </Field>
            <Field label="Supervisor">
              <input value={supervisorName} onChange={(event) => setSupervisorName(event.target.value)} />
            </Field>
            <Field label="Project manager">
              <input value={projectManagerName} onChange={(event) => setProjectManagerName(event.target.value)} />
            </Field>
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          </div>
          <div className="grid four">
            <Field label="Buildings">
              <input min={1} type="number" value={buildingCount} onChange={(event) => setBuildingCount(Number(event.target.value))} />
            </Field>
            <Field label="Floors per building">
              <input min={0} type="number" value={floorsPerBuilding} onChange={(event) => setFloorsPerBuilding(Number(event.target.value))} />
            </Field>
            <Field label="Units per floor">
              <input min={0} type="number" value={unitsPerFloor} onChange={(event) => setUnitsPerFloor(Number(event.target.value))} />
            </Field>
            <Field label="First unit number">
              <input min={1} type="number" value={firstUnitNumber} onChange={(event) => setFirstUnitNumber(Number(event.target.value))} />
            </Field>
            <Field label="Beds per unit">
              <input min={0} type="number" value={bedCount} onChange={(event) => setBedCount(Number(event.target.value))} />
            </Field>
            <Field label="Bathrooms per unit">
              <input min={0} type="number" value={bathroomCount} onChange={(event) => setBathroomCount(Number(event.target.value))} />
            </Field>
            <Field label="Common area per unit">
              <select value={hasCommonArea ? 'yes' : 'no'} onChange={(event) => setHasCommonArea(event.target.value === 'yes')}>
                <option value="yes">Yes / likely</option>
                <option value="no">No / unknown</option>
              </select>
            </Field>
          </div>
          <Field label="Building names">
            <textarea value={buildingNames} rows={3} onChange={(event) => setBuildingNames(event.target.value)} placeholder={'Building A\nBuilding B'} />
          </Field>
          <Field label="Real Turn notes">
            <textarea value={realNotes} rows={3} onChange={(event) => setRealNotes(event.target.value)} placeholder="What you know so far. Leave blanks if training has not clarified it yet." />
          </Field>
          <div className="button-row">
            <Button onClick={backup}>
              <Download size={18} aria-hidden="true" />
              Backup First
            </Button>
            <Button variant="primary" onClick={startRealTurn}>
              <PlayCircle size={18} aria-hidden="true" />
              Start Real Turn
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Turn Project" kicker={project.mode === 'real' ? 'Real Turn' : 'Demo sample'}>
        <div className="form-card">
          <div className="grid two">
            <Field label="Project name">
              <input value={project.name} onChange={(event) => saveField({ name: event.target.value })} />
            </Field>
            <Field label="Property name">
              <input value={project.propertyName} onChange={(event) => saveField({ propertyName: event.target.value })} />
            </Field>
            <Field label="Location">
              <input value={project.location} onChange={(event) => saveField({ location: event.target.value })} />
            </Field>
            <Field label="Supervisor">
              <input value={project.supervisorName} onChange={(event) => saveField({ supervisorName: event.target.value })} />
            </Field>
            <Field label="Project manager">
              <input value={project.projectManagerName} onChange={(event) => saveField({ projectManagerName: event.target.value })} />
            </Field>
            <Field label="Start date">
              <input type="date" value={project.startDate} onChange={(event) => saveField({ startDate: event.target.value })} />
            </Field>
            <Field label="End date">
              <input type="date" value={project.endDate} onChange={(event) => saveField({ endDate: event.target.value })} />
            </Field>
          </div>
          <div className="grid four">
            <Field label="Estimated buildings">
              <input
                min={0}
                type="number"
                value={project.estimatedBuildings}
                onChange={(event) => saveField({ estimatedBuildings: Number(event.target.value) })}
              />
            </Field>
            <Field label="Estimated units">
              <input
                min={0}
                type="number"
                value={project.estimatedUnits}
                onChange={(event) => saveField({ estimatedUnits: Number(event.target.value) })}
              />
            </Field>
            <Field label="Estimated beds">
              <input
                min={0}
                type="number"
                value={project.estimatedBeds}
                onChange={(event) => saveField({ estimatedBeds: Number(event.target.value) })}
              />
            </Field>
            <Field label="Estimated common areas">
              <input
                min={0}
                type="number"
                value={project.estimatedCommonAreas}
                onChange={(event) => saveField({ estimatedCommonAreas: Number(event.target.value) })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={project.notes} rows={5} onChange={(event) => saveField({ notes: event.target.value })} />
          </Field>
          <Button variant="primary" onClick={() => saveField({})}>
            <Save size={18} aria-hidden="true" />
            Saved Automatically
          </Button>
        </div>
      </Section>

      <Section title="Current Structure" kicker="Generated from Units">
        <div className="setup-summary">
          <article>
            <strong>{activeBuildings.length}</strong>
            <span>Buildings</span>
          </article>
          <article>
            <strong>{activeFloors.length}</strong>
            <span>Floors</span>
          </article>
          <article>
            <strong>{activeUnits.length}</strong>
            <span>Units</span>
          </article>
          <article>
            <strong>{activeUnits.reduce((sum, unit) => sum + unit.bedCount, 0)}</strong>
            <span>Beds</span>
          </article>
        </div>
        <p className="muted">Use Units → Quick Unit Creation to add buildings, floors, and units quickly.</p>
      </Section>
    </div>
  );
}
