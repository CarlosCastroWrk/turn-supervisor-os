import { ClipboardCopy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { buildDailyReport, downloadTextFile } from '../lib/exporters';
import { getActiveProject } from '../lib/metrics';
import { todayISO } from '../lib/constants';
import type { AppData } from '../types';

interface ReportsViewProps {
  data: AppData;
}

export function ReportsView({ data }: ReportsViewProps) {
  const project = getActiveProject(data);
  const [date, setDate] = useState(todayISO());
  const [copied, setCopied] = useState(false);
  const dailyLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === date);
  const report = useMemo(() => buildDailyReport(data, project, date, dailyLog), [data, date, dailyLog, project]);
  const reportFileName = dailyLog ? `turn-daily-report-${date}.txt` : `turn-daily-report-draft-${date}.txt`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert('Copy failed on this browser. Press and hold the report text to select and copy it manually.');
    }
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Copy-ready update</span>
          <h1>Daily Report</h1>
        </div>
      </div>

      <Section title="Generate Report" kicker="Professional text">
        <div className="form-card">
          <Field label="Report date">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          {!dailyLog ? (
            <div className="report-warning" role="status">
              No Daily Log is saved for this date. This report is a draft shell with missing-data labels, not a completed field report.
            </div>
          ) : null}
          <textarea className="report-box" readOnly value={report} />
          <div className="button-row">
            <Button variant="primary" onClick={copy}>
              <ClipboardCopy size={18} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy Report'}
            </Button>
            <Button onClick={() => downloadTextFile(reportFileName, report)}>
              <Download size={18} aria-hidden="true" />
              Download Text
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
