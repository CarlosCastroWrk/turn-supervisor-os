import { ClipboardCopy, Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { buildDailyReport, buildDailyReportPreview, downloadTextFile } from '../lib/exporters';
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
  const preview = useMemo(() => buildDailyReportPreview(data, project, date, dailyLog), [data, date, dailyLog, project]);
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

  const printReport = () => window.print();

  return (
    <div className="page page--reports">
      <div className="page-title">
        <div>
          <span className="quiet-label">Copy-ready update</span>
          <h1>Daily Report</h1>
        </div>
      </div>

      <Section title="Generate Report" kicker="Preview before sending">
        <div className="form-card report-controls no-print">
          <Field label="Report date">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          {!dailyLog ? (
            <div className="report-warning" role="status">
              No Daily Log is saved for this date. This report is a draft shell with missing-data labels, not a completed field report.
            </div>
          ) : null}
          <div className="button-row">
            <Button variant="primary" className="report-action-primary" onClick={printReport}>
              <Printer size={18} aria-hidden="true" />
              Print / Save PDF
            </Button>
            <Button className="report-action-secondary" onClick={copy}>
              <ClipboardCopy size={18} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy Text'}
            </Button>
            <Button className="report-action-secondary" onClick={() => downloadTextFile(reportFileName, report)}>
              <Download size={18} aria-hidden="true" />
              Download Text
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Report Preview" kicker={preview.isMissingDailyLog ? 'Missing data' : 'Ready to review'} className="print-report-section">
        <article className="report-preview" aria-label="Daily report preview">
          <header className="report-preview__header">
            <div>
              <span className="quiet-label">{preview.reportDateLabel}</span>
              <h2>{preview.title}</h2>
              <p>
                {preview.propertyName}
                {preview.location ? ` - ${preview.location}` : ''}
              </p>
            </div>
            <div className="report-preview__meta">
              <span>Supervisor</span>
              <strong>{preview.supervisorName || 'Los'}</strong>
              {preview.projectManagerName ? <small>For {preview.projectManagerName}</small> : null}
            </div>
          </header>

          <div className={`report-status ${preview.isMissingDailyLog ? 'is-warning' : ''}`} role="status">
            {preview.status}
          </div>

          <div className="report-metrics" aria-label="Report progress metrics">
            {preview.metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.helper}</small>
              </div>
            ))}
          </div>

          <div className="report-sections">
            {preview.sections.map((section) => (
              <section key={section.title} className="report-preview-section">
                <h3>{section.title}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      </Section>

      <Section title="Copy Text" kicker="Plain fallback" className="no-print">
        <textarea className="report-box" readOnly value={report} aria-label="Plain text daily report" />
      </Section>
    </div>
  );
}
