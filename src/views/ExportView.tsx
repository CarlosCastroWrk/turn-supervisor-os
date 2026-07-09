import { Download, FileArchive, FileJson, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../components/FormControls';
import { Section } from '../components/Section';
import { useToast } from '../components/toast-context';
import { parseJsonBackup } from '../lib/backups';
import { clearAppData, clearInFlightFieldDrafts } from '../lib/storage';
import {
  buildCopilotMarkdown,
  buildDailyLogsMarkdown,
  buildFollowUpsCsv,
  buildIssuesCsv,
  buildUnitsCsv,
  downloadTextFile,
} from '../lib/exporters';
import { getActiveProject, getIssuesForProject, getUnitsForProject } from '../lib/metrics';
import { buildJsonBackupWithLocalPhotos } from '../lib/photoBackup';
import { getProjectDailyLogs, getProjectFollowUpTasks } from '../lib/projectScope';
import type { AppData } from '../types';

interface ExportViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function ExportView({ data, setData }: ExportViewProps) {
  const { notify } = useToast();
  const date = new Date().toISOString().slice(0, 10);
  const project = getActiveProject(data);
  const projectDailyLogs = getProjectDailyLogs(data, project.id);
  const projectFollowUps = getProjectFollowUpTasks(data, project.id);
  const [backupTaken, setBackupTaken] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const restoreInputRef = useRef<HTMLInputElement>(null);

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

  const resetLocalData = async () => {
    if (!backupTaken) {
      const needsBackup = window.confirm('Download a JSON backup before resetting this device? Choose OK to backup first.');
      if (needsBackup) {
        await backup();
        return;
      }
    }

    const confirmed = window.confirm(
      'Reset this device back to the built-in Demo Mode sample data? This clears local browser data only. It does not delete Supabase cloud records.',
    );
    if (!confirmed) {
      return;
    }

    const photoFilesCleared = await clearAppData();
    if (!photoFilesCleared) {
      window.alert(
        'The app records were reset, but local photo-file cleanup could not be confirmed. Clear this site/app data in browser settings before handing the device to someone else.',
      );
    }
    window.location.reload();
  };

  const restoreBackup = async (file: File) => {
    if (!backupTaken) {
      const needsBackup = window.confirm('Download a JSON backup of this device before restoring another backup? Choose OK to backup first.');
      if (needsBackup) {
        await backup();
        return;
      }
    }

    try {
      const restored = parseJsonBackup(await file.text());
      const confirmed = window.confirm(
        `Restore "${file.name}" now? This replaces local browser data on this device with ${restored.projects.length} project(s), ${restored.units.length} unit(s), and ${restored.issues.length} issue(s). It does not delete Supabase cloud records.`,
      );
      if (!confirmed) {
        return;
      }

      clearInFlightFieldDrafts();
      setData(restored);
      setRestoreMessage(`Restored ${restored.projects.length} project(s), ${restored.units.length} unit(s), and ${restored.issues.length} issue(s).`);
      setBackupTaken(true);
      notify(`Backup restored with ${restored.units.length} Unit${restored.units.length === 1 ? '' : 's'}.`, { tone: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not restore that backup file.';
      setRestoreMessage(message);
      notify(message, { tone: 'error' });
    }
  };

  const onRestoreSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    restoreBackup(file);
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Current Turn exports + full backup</span>
          <h1>Export / Backup</h1>
        </div>
      </div>

      <Section title="Export Data" kicker="Local files">
        <div className="export-grid">
          <button className="export-card" disabled={isBackingUp} type="button" onClick={() => void backup()}>
            <FileJson size={26} aria-hidden="true" />
            <span>
              <strong>{isBackingUp ? 'Building Backup...' : 'Full Device JSON Backup'}</strong>
              <small>All projects plus local photos; keep private</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-units-${date}.csv`, buildUnitsCsv(getUnitsForProject(data, project.id)), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Units CSV</strong>
              <small>Status board export</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-issues-${date}.csv`, buildIssuesCsv(getIssuesForProject(data, project.id)), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Issues CSV</strong>
              <small>Open and closed issue tracker</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-daily-logs-${date}.md`, buildDailyLogsMarkdown(projectDailyLogs), 'text/markdown')}>
            <FileArchive size={26} aria-hidden="true" />
            <span>
              <strong>Current Turn Daily Logs</strong>
              <small>{project.name} only</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-copilot-memory-${date}.md`, buildCopilotMarkdown(data, project.id), 'text/markdown')}>
            <FileArchive size={26} aria-hidden="true" />
            <span>
              <strong>Current Turn Copilot / Memory</strong>
              <small>{project.name} only</small>
            </span>
          </button>
          <button className="export-card" type="button" onClick={() => downloadTextFile(`turn-follow-ups-${date}.csv`, buildFollowUpsCsv(projectFollowUps), 'text/csv')}>
            <FileSpreadsheet size={26} aria-hidden="true" />
            <span>
              <strong>Current Turn Follow-Ups</strong>
              <small>{project.name} only</small>
            </span>
          </button>
        </div>
        {backupMessage ? <p className="muted" aria-live="polite">{backupMessage}</p> : null}
      </Section>

      <Section title="Device Storage" kicker="Privacy guardrail">
        <div className="form-card">
          <p>
            The app keeps a local browser cache first. If Supabase sync is enabled and you are signed in, supported records also
            sync across your devices. JSON backups can contain work photos from this device, so store them privately. No automatic
            messaging or server-side AI is included.
          </p>
          <div className="button-row">
            <Button disabled={isBackingUp} onClick={() => void backup()}>
              <Download size={18} aria-hidden="true" />
              {isBackingUp ? 'Building Backup...' : 'Backup Before Reset'}
            </Button>
            <Button onClick={() => restoreInputRef.current?.click()}>
              <Upload size={18} aria-hidden="true" />
              Restore JSON Backup
            </Button>
            <Button variant="danger" onClick={() => void resetLocalData()}>
              <RotateCcw size={18} aria-hidden="true" />
              Reset This Device to Demo
            </Button>
          </div>
          <input
            ref={restoreInputRef}
            aria-label="Restore JSON backup file"
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={onRestoreSelected}
          />
          {restoreMessage ? <p className="muted">{restoreMessage}</p> : null}
          <p className="muted">
            If Supabase sync is signed in, cloud records can pull back after reload. Start Real Turn Mode in Setup to keep sample data
            separate from real field data. Reset clears local photo files on this device after confirmation.
          </p>
        </div>
      </Section>
    </div>
  );
}
