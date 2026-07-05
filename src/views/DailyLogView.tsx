import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { upsertDailyLog } from '../lib/actions';
import { createId, nowISO, todayISO } from '../lib/constants';
import { getActiveProject } from '../lib/metrics';
import type { AppData, DailyLog } from '../types';

interface DailyLogViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

const emptyLog = (projectId: string, date: string): DailyLog => {
  const now = nowISO();
  return {
    id: createId('daily'),
    projectId,
    date,
    morningPlan: '',
    middayUpdate: '',
    endOfDayReflection: '',
    completedSummary: '',
    blockers: '',
    lessons: '',
    tomorrowPriorities: '',
    createdAt: now,
    updatedAt: now,
  };
};

export function DailyLogView({ data, setData }: DailyLogViewProps) {
  const project = getActiveProject(data);
  const [date, setDate] = useState(todayISO());
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DailyLog>(() => data.dailyLogs.find((log) => log.projectId === project.id && log.date === todayISO()) ?? emptyLog(project.id, todayISO()));

  useEffect(() => {
    if (dirty) {
      return;
    }
    setDraft(data.dailyLogs.find((log) => log.projectId === project.id && log.date === date) ?? emptyLog(project.id, date));
  }, [data.dailyLogs, date, dirty, project.id]);

  const updateDraft = (patch: Partial<DailyLog>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...patch, date }));
  };

  const changeDate = (nextDate: string) => {
    if (nextDate === date) {
      return;
    }
    if (dirty && !window.confirm('You have unsaved daily log changes. Discard them and switch dates?')) {
      return;
    }
    setDirty(false);
    setDate(nextDate);
  };

  const save = () => {
    setData((current) => upsertDailyLog(current, { ...draft, projectId: project.id, date }));
    setDirty(false);
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Execute and learn</span>
          <h1>Daily Log</h1>
        </div>
      </div>

      <Section title="Daily Capture" kicker="Morning · Midday · End of day">
        <div className="form-card">
          <Field label="Date">
            <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
          </Field>
          <Field label="Morning Plan">
            <textarea
              rows={5}
              value={draft.morningPlan}
              onChange={(event) => updateDraft({ morningPlan: event.target.value })}
              placeholder="Main priorities, buildings/floors to focus on, crews expected, known blockers, questions for Tony/Rey."
            />
          </Field>
          <Field label="Midday Update">
            <textarea
              rows={5}
              value={draft.middayUpdate}
              onChange={(event) => updateDraft({ middayUpdate: event.target.value })}
              placeholder="What is moving well? What is behind? Which crews need help? New issues? Decisions made?"
            />
          </Field>
          <Field label="End-of-Day Reflection">
            <textarea
              rows={5}
              value={draft.endOfDayReflection}
              onChange={(event) => updateDraft({ endOfDayReflection: event.target.value })}
              placeholder="Units completed, bottleneck, best crew/team moment, what surprised me, what to ask tomorrow."
            />
          </Field>
          <div className="grid two">
            <Field label="Completed Summary">
              <textarea rows={4} value={draft.completedSummary} onChange={(event) => updateDraft({ completedSummary: event.target.value })} />
            </Field>
            <Field label="Blockers">
              <textarea rows={4} value={draft.blockers} onChange={(event) => updateDraft({ blockers: event.target.value })} />
            </Field>
            <Field label="Lessons">
              <textarea rows={4} value={draft.lessons} onChange={(event) => updateDraft({ lessons: event.target.value })} />
            </Field>
            <Field label="Tomorrow Priorities">
              <textarea rows={4} value={draft.tomorrowPriorities} onChange={(event) => updateDraft({ tomorrowPriorities: event.target.value })} />
            </Field>
          </div>
          <Button variant="primary" onClick={save}>
            <Save size={18} aria-hidden="true" />
            Save Daily Log
          </Button>
        </div>
      </Section>

      <Section title="Past Logs" kicker={`${data.dailyLogs.length} saved`}>
        <div className="stack">
          {data.dailyLogs.map((log) => (
            <button className="list-card list-card--button" key={log.id} type="button" onClick={() => changeDate(log.date)}>
              <div>
                <strong>{log.date}</strong>
                <small>{log.completedSummary || log.morningPlan || 'No summary yet'}</small>
              </div>
              <span className="quiet-label">Open</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

