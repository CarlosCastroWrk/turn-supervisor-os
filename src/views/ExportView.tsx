import { Download, FileArchive, FileJson, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/FormControls';
import { Section } from '../components/Section';
import { clearAppData } from '../lib/storage';
import {
  buildCopilotMarkdown,
  buildDailyLogsMarkdown,
  buildFollowUpsCsv,
  buildIssuesCsv,
  buildJsonBackup,
  buildUnitsCsv,
  downloadTextFile,
} from '../lib/exporters';
import { getActiveProject, getProjectIssues, getProjectUnits } from '../lib/metrics';
import type { AppData } from '../types';

interface ExportViewProps {
  data: AppData;
}

export function ExportView({ data }: ExportViewProps) {
  const date = new Date().toISOString().slice(0, 10);
  const project = getActiveProject(data);
  const [backupTaken, setBackupTaken] = useState(false);

  const backup = () => {
    downloadTextFile(`turn-supervisor-backup-${date}.json`, buildJsonBackup(data), 'application/json');
    setBackupTaken(true);
  };

  const resetLocalData = () => {
    if (!backupTaken) {
      const needsBackup = window.confirm('Download a JSON backup before resetting this device? Choose OK to backup first.');
      if (needsBackup) {
        backup();
        return;
      }
    }

    const confirmed = window.confirm(
      'Reset this device back to the built-in Demo Mode sample data? This clears local browser data only. It does not delete Supabase cloud records.',
    );
    if (!confirmed) {
      return;
    }

    clearAppData();
    window.location.reload();
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">{project.mode === 'real' ? 'Real Turn backup' : 'Demo backup'}</span>
          <h1>Export / Backup</h1>
        </div>
      </div>

      <Section title="Export Data" kicker="Local files">
        <div className="export-grid">
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-supervisor-backup-${date}.json`, buildJsonBackup(data), 'application/json')}>
            <FileJson size={26} aria-hidden="true" />
            <span>
              <strong>Project JSON Backup</strong>
              <small>Everything in local app state</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-units-${date}.csv`, buildUnitsCsv(getProjectUnits(data)), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Units CSV</strong>
              <small>Status board export</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-issues-${date}.csv`, buildIssuesCsv(getProjectIssues(data)), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Issues CSV</strong>
              <small>Open and closed issue tracker</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-daily-logs-${date}.md`, buildDailyLogsMarkdown(data.dailyLogs), 'text/markdown')}>
            <FileArchive size={26} aria-hidden="true" />
            <span>
              <strong>Daily Logs Markdown</strong>
              <small>Learning and reflection notes</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-copilot-memory-${date}.md`, buildCopilotMarkdown(data), 'text/markdown')}>
            <FileArchive size={26} aria-hidden="true" />
            <span>
              <strong>Copilot / Memory Markdown</strong>
              <small>Drafts, memory, agent runs, conversations</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-follow-ups-${date}.csv`, buildFollowUpsCsv(data.followUpTasks), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Follow-Ups CSV</strong>
              <small>Tasks created by Copilot or manually</small>
            </span>
          </button>
        </div>
      </Section>

      <Section title="Device Storage" kicker="Privacy guardrail">
        <div className="form-card">
          <p>
            The app keeps a local browser cache first. If Supabase sync is enabled and you are signed in, supported records also
            sync across your devices. No automatic messaging or server-side AI is included.
          </p>
          <div className="button-row">
            <Button onClick={backup}>
              <Download size={18} aria-hidden="true" />
              Backup Before Reset
            </Button>
            <Button variant="danger" onClick={resetLocalData}>
              <RotateCcw size={18} aria-hidden="true" />
              Reset This Device to Demo
            </Button>
          </div>
          <p className="muted">
            If Supabase sync is signed in, cloud records can pull back after reload. Start Real Turn Mode in Setup to keep sample data
            separate from real field data.
          </p>
        </div>
      </Section>
    </div>
  );
}
