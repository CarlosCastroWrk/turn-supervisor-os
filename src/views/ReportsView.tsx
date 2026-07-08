import { ClipboardCopy, Download, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { buildDailyReport, buildDailyReportPreview, downloadTextFile } from '../lib/exporters';
import { getActiveProject } from '../lib/metrics';
import { todayISO } from '../lib/constants';
import type { AppData } from '../types';

interface ReportsViewProps {
  data: AppData;
}

interface ReportDocumentSectionDraft {
  title: string;
  subtitle: string;
  body: string;
}

interface ReportDocumentDraft {
  title: string;
  summary: string;
  sections: ReportDocumentSectionDraft[];
}

const REPORT_DRAFTS_KEY = 'turn-supervisor-os:report-document-drafts:v0';

const buildReportDocumentDraft = (preview: ReturnType<typeof buildDailyReportPreview>): ReportDocumentDraft => ({
  title: preview.title,
  summary: preview.summary,
  sections: preview.sections.map((section) => ({
    title: section.title,
    subtitle: section.subtitle,
    body: section.items.join('\n'),
  })),
});

const readReportDrafts = (): Record<string, ReportDocumentDraft> => {
  try {
    const raw = window.localStorage.getItem(REPORT_DRAFTS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const readReportDraft = (key: string) => readReportDrafts()[key];

const saveReportDraft = (key: string, draft: ReportDocumentDraft) => {
  try {
    const drafts = readReportDrafts();
    drafts[key] = draft;
    window.localStorage.setItem(REPORT_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Report edits remain usable in memory if browser storage is unavailable.
  }
};

const reportSectionLines = (body: string) =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const buildEditedReportText = (
  draft: ReportDocumentDraft,
  preview: ReturnType<typeof buildDailyReportPreview>,
) =>
  [
    draft.title.trim() || preview.title,
    '',
    `Date: ${preview.reportDateLabel}`,
    `Property: ${preview.propertyName}${preview.location ? ` - ${preview.location}` : ''}`,
    `Supervisor: ${preview.supervisorName || 'Los'}`,
    preview.projectManagerName ? `For: ${preview.projectManagerName}` : '',
    `Status: ${preview.status}`,
    '',
    'Summary:',
    draft.summary.trim() || preview.summary,
    '',
    'Progress:',
    ...preview.metrics.map((metric) => `- ${metric.label}: ${metric.value} (${metric.helper})`),
    '',
    ...draft.sections.flatMap((section) => [
      section.title,
      ...reportSectionLines(section.body).map((line) => `- ${line}`),
      '',
    ]),
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n')
    .trim();

export function ReportsView({ data }: ReportsViewProps) {
  const project = getActiveProject(data);
  const [date, setDate] = useState(todayISO());
  const [copied, setCopied] = useState(false);
  const dailyLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === date);
  const report = useMemo(() => buildDailyReport(data, project, date, dailyLog), [data, date, dailyLog, project]);
  const preview = useMemo(() => buildDailyReportPreview(data, project, date, dailyLog), [data, date, dailyLog, project]);
  const generatedDraft = useMemo(() => buildReportDocumentDraft(preview), [preview]);
  const reportDraftKey = `${project.id}:${date}`;
  const [documentDraft, setDocumentDraft] = useState(() => readReportDraft(reportDraftKey) ?? generatedDraft);
  const [loadedDraftKey, setLoadedDraftKey] = useState(reportDraftKey);
  const editedReport = useMemo(() => buildEditedReportText(documentDraft, preview), [documentDraft, preview]);
  const reportFileName = dailyLog ? `turn-daily-report-${date}.txt` : `turn-daily-report-draft-${date}.txt`;

  useEffect(() => {
    setDocumentDraft(readReportDraft(reportDraftKey) ?? generatedDraft);
    setLoadedDraftKey(reportDraftKey);
  }, [generatedDraft, reportDraftKey]);

  useEffect(() => {
    if (loadedDraftKey === reportDraftKey) {
      saveReportDraft(reportDraftKey, documentDraft);
    }
  }, [documentDraft, loadedDraftKey, reportDraftKey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editedReport);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert('Copy failed on this browser. Press and hold the report text to select and copy it manually.');
    }
  };

  const printReport = () => window.print();
  const resetDocumentDraft = () => setDocumentDraft(generatedDraft);

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

      <Section title="Edit Report" kicker="Simple document" className="no-print">
        <div className="form-card report-editor">
          <Field label="Report title">
            <input
              value={documentDraft.title}
              onChange={(event) => setDocumentDraft((draft) => ({ ...draft, title: event.target.value }))}
            />
          </Field>
          <Field label="Summary">
            <textarea
              value={documentDraft.summary}
              onChange={(event) => setDocumentDraft((draft) => ({ ...draft, summary: event.target.value }))}
              rows={3}
            />
          </Field>
          <div className="report-editor-sections">
            {documentDraft.sections.map((section, index) => (
              <Field key={section.title} label={section.title}>
                <textarea
                  value={section.body}
                  onChange={(event) =>
                    setDocumentDraft((draft) => ({
                      ...draft,
                      sections: draft.sections.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, body: event.target.value } : item,
                      ),
                    }))
                  }
                  rows={4}
                />
              </Field>
            ))}
          </div>
          <div className="button-row">
            <Button onClick={resetDocumentDraft}>Reset to Generated</Button>
          </div>
        </div>
      </Section>

      <Section title="Report Preview" kicker={preview.isMissingDailyLog ? 'Missing data' : 'Ready to review'} className="print-report-section">
        <article className="report-preview" aria-label="Daily report preview">
          <header className="report-preview__header">
            <div>
              <span className="quiet-label">{preview.reportDateLabel}</span>
              <h2>{documentDraft.title.trim() || preview.title}</h2>
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

          <section className="report-brief" aria-label="Report field summary">
            <span>Summary</span>
            <p>{documentDraft.summary.trim() || preview.summary}</p>
          </section>

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
            {documentDraft.sections.map((section) => (
              <section key={section.title} className="report-preview-section">
                <div className="report-preview-section__header">
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.subtitle}</p>
                  </div>
                </div>
                {reportSectionLines(section.body).length > 0 ? (
                  <ul>
                    {reportSectionLines(section.body).map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="report-empty-line">No notes entered.</p>
                )}
              </section>
            ))}
          </div>
        </article>
      </Section>

      <Section title="Copy Text" kicker="Plain fallback" className="no-print">
        <textarea className="report-box" readOnly value={editedReport || report} aria-label="Plain text daily report" />
      </Section>
    </div>
  );
}
