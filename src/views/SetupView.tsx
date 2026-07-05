import { Save } from 'lucide-react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { updateProject } from '../lib/actions';
import { getActiveProject } from '../lib/metrics';
import type { AppData, Project } from '../types';

interface SetupViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function SetupView({ data, setData }: SetupViewProps) {
  const project = getActiveProject(data);

  const saveField = (patch: Partial<Project>) => setData((current) => updateProject(current, project.id, patch));

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Editable anytime</span>
          <h1>Project Setup</h1>
        </div>
      </div>

      <Section title="Turn Project" kicker="Local-only">
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
            <strong>{data.buildings.length}</strong>
            <span>Buildings</span>
          </article>
          <article>
            <strong>{data.floors.length}</strong>
            <span>Floors</span>
          </article>
          <article>
            <strong>{data.units.length}</strong>
            <span>Units</span>
          </article>
          <article>
            <strong>{data.units.reduce((sum, unit) => sum + unit.bedCount, 0)}</strong>
            <span>Beds</span>
          </article>
        </div>
        <p className="muted">Use Units → Quick Unit Creation to add buildings, floors, and units quickly.</p>
      </Section>
    </div>
  );
}

