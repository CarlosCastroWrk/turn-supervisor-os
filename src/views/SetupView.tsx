import { Archive, Download, PlayCircle, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, CommittedInput, CommittedTextarea, Field, NumberInput } from '../components/FormControls';
import { MemorySettings } from '../components/MemorySettings';
import { Section } from '../components/Section';
import { UnitCsvImportPanel } from '../components/UnitCsvImportPanel';
import { useToast } from '../components/toast-context';
import { archiveProject, createRealTurnProject, restoreProject, switchActiveProject, updateProject } from '../lib/actions';
import { downloadTextFile } from '../lib/exporters';
import { getActiveProject, getProjectBuildings, getProjectUnits } from '../lib/metrics';
import { buildJsonBackupWithLocalPhotos } from '../lib/photoBackup';
import type { AppData, Project } from '../types';

interface SetupViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function SetupView({ data, setData }: SetupViewProps) {
  const { notify } = useToast();
  const project = getActiveProject(data);
  const date = new Date().toISOString().slice(0, 10);
  const demoProject = data.projects.find((item) => item.mode === 'demo');
  const realProjects = data.projects.filter((item) => item.mode === 'real' && !item.archivedAt);
  const archivedRealProjects = data.projects.filter((item) => item.mode === 'real' && item.archivedAt);
  const activeBuildings = getProjectBuildings(data);
  const activeBuildingIds = useMemo(() => new Set(activeBuildings.map((building) => building.id)), [activeBuildings]);
  const activeFloors = data.floors.filter((floor) => activeBuildingIds.has(floor.buildingId));
  const activeUnits = getProjectUnits(data);
  const [backupTaken, setBackupTaken] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
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

  const backup = async () => {
    setIsBackingUp(true);
    setBackupMessage('Gathering local records and photo files...');
    try {
      const result = await buildJsonBackupWithLocalPhotos(data);
      downloadTextFile(`turn-supervisor-backup-${date}.json`, result.text, 'application/json');
      setBackupTaken(true);
      setBackupMessage(
        result.missingPhotoFiles > 0
          ? `Backup saved with ${result.includedPhotoFiles} photo file(s); ${result.missingPhotoFiles} photo record(s) have no file on this device.`
          : `Backup saved with all ${result.includedPhotoFiles} local photo file(s).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup could not be created.';
      setBackupMessage(message);
      notify(message, { tone: 'error' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const startRealTurn = () => {
    if (!propertyName.trim()) {
      notify('Add the property name before starting Real Turn Mode.', { tone: 'error' });
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
    notify(`${propertyName.trim()} Real Turn created.`, { tone: 'success' });
  };

  const archiveRealProject = (projectToArchive: Project) => {
    const backupMessage =
      'Archive hides this Real Turn project from normal switching, but it does not delete units, issues, notes, or cloud records. Continue without exporting a fresh JSON backup?';
    if (!backupTaken && !window.confirm(backupMessage)) {
      return;
    }

    const activeMessage =
      'This is the active Real Turn project. Archiving it will switch you to another visible Real Turn project or Demo Mode. Continue?';
    if (project.id === projectToArchive.id && !window.confirm(activeMessage)) {
      return;
    }

    setData((current) => archiveProject(current, projectToArchive.id));
    notify(`${projectToArchive.name} archived without deleting its records.`, { tone: 'success' });
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
            <Button disabled={isBackingUp} onClick={() => void backup()}>
              <Download size={18} aria-hidden="true" />
              {isBackingUp ? 'Building Backup...' : 'Backup JSON'}
            </Button>
            {demoProject ? (
              <Button onClick={() => setData((current) => switchActiveProject(current, demoProject.id))} variant={project.mode === 'demo' ? 'primary' : 'secondary'}>
                <RotateCcw size={18} aria-hidden="true" />
                Demo Mode
              </Button>
            ) : null}
          </div>
          {backupMessage ? <p className="muted" aria-live="polite">{backupMessage}</p> : null}
        </div>

        {realProjects.length > 0 ? (
          <div className="project-switcher">
            {realProjects.map((realProject) => (
              <article className="project-card" key={realProject.id}>
                <button
                  className={`project-chip ${project.id === realProject.id ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setData((current) => switchActiveProject(current, realProject.id))}
                >
                  <strong>{realProject.name}</strong>
                  <small>{realProject.propertyName || 'No property name'}</small>
                </button>
                <Button aria-label={`Archive ${realProject.name}`} onClick={() => archiveRealProject(realProject)} variant="ghost">
                  <Archive size={16} aria-hidden="true" />
                  Archive
                </Button>
              </article>
            ))}
          </div>
        ) : null}

        {archivedRealProjects.length > 0 ? (
          <details className="archive-panel">
            <summary>Archived Real Turn projects ({archivedRealProjects.length})</summary>
            <div className="project-switcher">
              {archivedRealProjects.map((archivedProject) => (
                <article className="project-card" key={archivedProject.id}>
                  <div className="project-chip project-chip--archived">
                    <strong>{archivedProject.name}</strong>
                    <small>{archivedProject.propertyName || 'No property name'}</small>
                  </div>
                  <Button onClick={() => setData((current) => restoreProject(current, archivedProject.id))} variant="secondary">
                    <RotateCcw size={16} aria-hidden="true" />
                    Restore
                  </Button>
                </article>
              ))}
            </div>
          </details>
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
              <NumberInput min={1} value={buildingCount} onValueChange={setBuildingCount} />
            </Field>
            <Field label="Floors per building">
              <NumberInput min={0} value={floorsPerBuilding} onValueChange={setFloorsPerBuilding} />
            </Field>
            <Field label="Units per floor">
              <NumberInput min={0} value={unitsPerFloor} onValueChange={setUnitsPerFloor} />
            </Field>
            <Field label="First unit number">
              <NumberInput min={1} value={firstUnitNumber} onValueChange={setFirstUnitNumber} />
            </Field>
            <Field label="Beds per unit">
              <NumberInput min={0} value={bedCount} onValueChange={setBedCount} />
            </Field>
            <Field label="Bathrooms per unit">
              <NumberInput min={0} value={bathroomCount} onValueChange={setBathroomCount} />
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
            <Button disabled={isBackingUp} onClick={() => void backup()}>
              <Download size={18} aria-hidden="true" />
              {isBackingUp ? 'Building Backup...' : 'Backup First'}
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
              <CommittedInput draftKey={`project:${project.id}:name`} value={project.name} onCommit={(name) => saveField({ name })} />
            </Field>
            <Field label="Property name">
              <CommittedInput
                draftKey={`project:${project.id}:propertyName`}
                value={project.propertyName}
                onCommit={(propertyName) => saveField({ propertyName })}
              />
            </Field>
            <Field label="Location">
              <CommittedInput
                draftKey={`project:${project.id}:location`}
                value={project.location}
                onCommit={(location) => saveField({ location })}
              />
            </Field>
            <Field label="Supervisor">
              <CommittedInput
                draftKey={`project:${project.id}:supervisorName`}
                value={project.supervisorName}
                onCommit={(supervisorName) => saveField({ supervisorName })}
              />
            </Field>
            <Field label="Project manager">
              <CommittedInput
                draftKey={`project:${project.id}:projectManagerName`}
                value={project.projectManagerName}
                onCommit={(projectManagerName) => saveField({ projectManagerName })}
              />
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
              <NumberInput
                draftKey={`project:${project.id}:estimatedBuildings`}
                min={0}
                value={project.estimatedBuildings}
                onValueChange={(estimatedBuildings) => saveField({ estimatedBuildings })}
              />
            </Field>
            <Field label="Estimated units">
              <NumberInput
                draftKey={`project:${project.id}:estimatedUnits`}
                min={0}
                value={project.estimatedUnits}
                onValueChange={(estimatedUnits) => saveField({ estimatedUnits })}
              />
            </Field>
            <Field label="Estimated beds">
              <NumberInput
                draftKey={`project:${project.id}:estimatedBeds`}
                min={0}
                value={project.estimatedBeds}
                onValueChange={(estimatedBeds) => saveField({ estimatedBeds })}
              />
            </Field>
            <Field label="Estimated common areas">
              <NumberInput
                draftKey={`project:${project.id}:estimatedCommonAreas`}
                min={0}
                value={project.estimatedCommonAreas}
                onValueChange={(estimatedCommonAreas) => saveField({ estimatedCommonAreas })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <CommittedTextarea
              draftKey={`project:${project.id}:notes`}
              value={project.notes}
              rows={5}
              onCommit={(notes) => saveField({ notes })}
            />
          </Field>
        </div>
      </Section>

      <MemorySettings data={data} setData={setData} />

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

      {project.mode === 'real' ? <UnitCsvImportPanel data={data} project={project} setData={setData} /> : null}
    </div>
  );
}
