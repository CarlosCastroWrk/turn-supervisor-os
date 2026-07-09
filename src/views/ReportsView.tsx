import { ClipboardCopy, Download, Printer } from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { useToast } from '../components/toast-context';
import { buildDailyReport, buildDailyReportPreview, downloadTextFile } from '../lib/exporters';
import { getActiveProject } from '../lib/metrics';
import {
  LEGACY_REPORT_DRAFTS_KEY,
  buildEditedReportText,
  buildReportDocumentDraft,
  findReportDraft,
  markReportDraftEditsAgainstGenerated,
  mergeReportDocumentDraft,
  parseLegacyReportDraft,
  reportDraftId,
  reportSectionLines,
  upsertReportDraft,
} from '../lib/reportDrafts';
import { todayISO } from '../lib/constants';
import { nowISO } from '../lib/constants';
import type { AppData, ReportDocumentDraft } from '../types';

interface ReportsViewProps {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
}

const readLegacyReportDraft = (key: string, projectId: string, reportDate: string) => {
  try {
    const raw = window.localStorage.getItem(LEGACY_REPORT_DRAFTS_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw);
    const legacyDraft = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[key] : undefined;
    return parseLegacyReportDraft(legacyDraft, projectId, reportDate);
  } catch {
    return undefined;
  }
};

export function ReportsView({ data, setData }: ReportsViewProps) {
  const { notify } = useToast();
  const project = getActiveProject(data);
  const [date, setDate] = useState(todayISO());
  const [copied, setCopied] = useState(false);
  const dailyLog = data.dailyLogs.find((log) => log.projectId === project.id && log.date === date);
  const report = useMemo(() => buildDailyReport(data, project, date, dailyLog), [data, date, dailyLog, project]);
  const preview = useMemo(() => buildDailyReportPreview(data, project, date, dailyLog), [data, date, dailyLog, project]);
  const generatedDraft = useMemo(() => buildReportDocumentDraft(preview, project.id, date), [date, preview, project.id]);
  const reportDraftKey = reportDraftId(project.id, date);
  const savedDraft = useMemo(() => findReportDraft(data, project.id, date), [data, date, project.id]);
  const documentDraft = useMemo(() => mergeReportDocumentDraft(savedDraft, generatedDraft), [generatedDraft, savedDraft]);
  const editedReport = useMemo(() => buildEditedReportText(documentDraft, preview), [documentDraft, preview]);
  const reportFileName = dailyLog ? `turn-daily-report-${date}.txt` : `turn-daily-report-draft-${date}.txt`;

  useEffect(() => {
    if (savedDraft) {
      return;
    }

    const legacyDraft = readLegacyReportDraft(reportDraftKey, project.id, date);
    if (!legacyDraft) {
      return;
    }

    const migratedDraft = mergeReportDocumentDraft(markReportDraftEditsAgainstGenerated(legacyDraft, generatedDraft), generatedDraft);
    setData((current) => {
      if (findReportDraft(current, project.id, date)) {
        return current;
      }

      return upsertReportDraft(current, migratedDraft);
    });
  }, [date, generatedDraft, project.id, reportDraftKey, savedDraft, setData]);

  const updateDocumentDraft = (updater: (draft: ReportDocumentDraft) => ReportDocumentDraft) => {
    setData((current) => {
      const baseDraft = mergeReportDocumentDraft(findReportDraft(current, project.id, date), generatedDraft);
      const timestamp = nowISO();
      const nextDraft = updater(baseDraft);
      return upsertReportDraft(current, {
        ...nextDraft,
        createdAt: nextDraft.createdAt || timestamp,
        updatedAt: timestamp,
      });
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editedReport);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('Copy failed. Press and hold the report text to select and copy it manually.', { tone: 'error' });
    }
  };

  const printReport = () => window.print();
  const resetDocumentDraft = () =>
    updateDocumentDraft((draft) => ({
      ...generatedDraft,
      createdAt: draft.createdAt,
      updatedAt: nowISO(),
    }));

  const resetSection = (sectionTitle: string) =>
    updateDocumentDraft((draft) => ({
      ...draft,
      sections: draft.sections.map((section) => {
        const generatedSection = generatedDraft.sections.find((item) => item.title === sectionTitle);
        return generatedSection && section.title === sectionTitle ? generatedSection : section;
      }),
    }));

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
            <Button className="report-action-secondary" onClick={() => downloadTextFile(reportFileName, editedReport || report)}>
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
              onChange={(event) =>
                updateDocumentDraft((draft) => ({ ...draft, title: event.target.value, titleEdited: true }))
              }
            />
          </Field>
          <Field label="Summary">
            <textarea
              value={documentDraft.summary}
              onChange={(event) =>
                updateDocumentDraft((draft) => ({ ...draft, summary: event.target.value, summaryEdited: true }))
              }
              rows={3}
            />
          </Field>
          <div className="report-editor-sections">
            {documentDraft.sections.map((section, index) => (
              <Field key={section.title} label={section.title}>
                <textarea
                  value={section.body}
                  onChange={(event) =>
                    updateDocumentDraft((draft) => ({
                      ...draft,
                      sections: draft.sections.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, body: event.target.value, bodyEdited: true } : item,
                      ),
                    }))
                  }
                  rows={4}
                />
                <div className="report-editor-section-actions">
                  <span className="quiet-label">{section.bodyEdited ? 'Edited' : 'Generated'}</span>
                  {section.bodyEdited ? <Button onClick={() => resetSection(section.title)}>Reset section</Button> : null}
                </div>
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
