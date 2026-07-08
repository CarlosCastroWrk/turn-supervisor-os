import type { AppData, ReportDocumentDraft } from '../types';
import { nowISO } from './constants';
import type { DailyReportPreview } from './exporters';

export const LEGACY_REPORT_DRAFTS_KEY = 'turn-supervisor-os:report-document-drafts:v0';

export const reportDraftId = (projectId: string, reportDate: string) => `${projectId}:${reportDate}`;

export const buildReportDocumentDraft = (
  preview: DailyReportPreview,
  projectId: string,
  reportDate: string,
  timestamp = nowISO(),
): ReportDocumentDraft => ({
  id: reportDraftId(projectId, reportDate),
  projectId,
  date: reportDate,
  title: preview.title,
  titleEdited: false,
  summary: preview.summary,
  summaryEdited: false,
  sections: preview.sections.map((section) => ({
    title: section.title,
    subtitle: section.subtitle,
    body: section.items.join('\n'),
    bodyEdited: false,
  })),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const findReportDraft = (data: AppData, projectId: string, reportDate: string) =>
  data.reportDrafts.find((draft) => draft.id === reportDraftId(projectId, reportDate));

export const mergeReportDocumentDraft = (
  savedDraft: ReportDocumentDraft | undefined,
  generatedDraft: ReportDocumentDraft,
): ReportDocumentDraft => {
  if (!savedDraft) {
    return generatedDraft;
  }

  const savedSections = Array.isArray(savedDraft.sections) ? savedDraft.sections : [];

  return {
    ...generatedDraft,
    createdAt: savedDraft.createdAt || generatedDraft.createdAt,
    updatedAt: savedDraft.updatedAt || generatedDraft.updatedAt,
    title: savedDraft.titleEdited && typeof savedDraft.title === 'string' ? savedDraft.title : generatedDraft.title,
    titleEdited: savedDraft.titleEdited === true,
    summary:
      savedDraft.summaryEdited && typeof savedDraft.summary === 'string' ? savedDraft.summary : generatedDraft.summary,
    summaryEdited: savedDraft.summaryEdited === true,
    sections: generatedDraft.sections.map((generatedSection) => {
      const savedSection = savedSections.find((section) => section?.title === generatedSection.title);
      const bodyEdited = savedSection?.bodyEdited === true;
      return {
        ...generatedSection,
        body: bodyEdited && typeof savedSection?.body === 'string' ? savedSection.body : generatedSection.body,
        bodyEdited,
      };
    }),
  };
};

export const upsertReportDraft = (data: AppData, draft: ReportDocumentDraft): AppData => ({
  ...data,
  reportDrafts: [draft, ...data.reportDrafts.filter((item) => item.id !== draft.id)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  ),
});

export const reportSectionLines = (body: string) =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const buildEditedReportText = (draft: ReportDocumentDraft, preview: DailyReportPreview) =>
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
    'Progress (current board state):',
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

export const parseLegacyReportDraft = (value: unknown, projectId: string, reportDate: string): ReportDocumentDraft | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const timestamp = nowISO();

  return {
    id: reportDraftId(projectId, reportDate),
    projectId,
    date: reportDate,
    title: typeof raw.title === 'string' ? raw.title : '',
    titleEdited: typeof raw.title === 'string' && raw.title.trim().length > 0,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    summaryEdited: typeof raw.summary === 'string' && raw.summary.trim().length > 0,
    sections: Array.isArray(raw.sections)
      ? raw.sections.map((section) => {
          const rawSection = section && typeof section === 'object' ? (section as Record<string, unknown>) : {};
          const body = typeof rawSection.body === 'string' ? rawSection.body : '';
          return {
            title: typeof rawSection.title === 'string' ? rawSection.title : '',
            subtitle: typeof rawSection.subtitle === 'string' ? rawSection.subtitle : '',
            body,
            bodyEdited: body.trim().length > 0,
          };
        })
      : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const markReportDraftEditsAgainstGenerated = (
  draft: ReportDocumentDraft,
  generatedDraft: ReportDocumentDraft,
): ReportDocumentDraft => ({
  ...draft,
  titleEdited: draft.title !== generatedDraft.title,
  summaryEdited: draft.summary !== generatedDraft.summary,
  sections: draft.sections.map((section) => {
    const generatedSection = generatedDraft.sections.find((item) => item.title === section.title);
    return {
      ...section,
      bodyEdited: generatedSection ? section.body !== generatedSection.body : section.body.trim().length > 0,
    };
  }),
});
