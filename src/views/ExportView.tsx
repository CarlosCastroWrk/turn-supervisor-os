import { Download, FileArchive, FileJson, FileSpreadsheet, RotateCcw } from 'lucide-react';
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
import { getProjectIssues, getProjectUnits } from '../lib/metrics';
import type { AppData } from '../types';

interface ExportViewProps {
  data: AppData;
}

export function ExportView({ data }: ExportViewProps) {
  const date = new Date().toISOString().slice(0, 10);

  const resetLocalData = () => {
    const confirmed = window.confirm('Reset local Turn Supervisor OS data on this device? Export a JSON backup first if needed.');
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
          <span className="quiet-label">Your notes should not be trapped</span>
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
            v0.1 stores data only in this browser on this device using localStorage. No backend, no cloud sync, no external APIs,
            and no automatic messaging are included.
          </p>
          <div className="button-row">
            <Button onClick={() => downloadTextFile(`turn-supervisor-backup-${date}.json`, buildJsonBackup(data), 'application/json')}>
              <Download size={18} aria-hidden="true" />
              Backup Before Reset
            </Button>
            <Button variant="danger" onClick={resetLocalData}>
              <RotateCcw size={18} aria-hidden="true" />
              Reset Local Data
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
