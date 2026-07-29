import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActivitySurface,
  DirectNoteFlow,
  DirectPhotoFlow,
  SourceFirstImport,
  TrackDReportsAndProof,
  parseTrackDImportText,
  projectLegacyActivityRecord,
  type TrackDConfirmedImport,
  type TrackDImportParseOptions,
  type TrackDNoteRequest,
  type TrackDPhotoRequest,
  type TrackDSaveReceipt,
} from './index';
import './preview.css';

type PreviewSurface = 'import' | 'note' | 'photo' | 'activity' | 'reports';
type PreviewTheme = 'system' | 'light' | 'dark';

const units = [
  { id: 'unit-101', unitNumber: '101' },
  { id: 'unit-102', unitNumber: '102' },
] as const;

const activityRecords = [
  projectLegacyActivityRecord(
    {
      id: 'activity-note',
      createdAt: '2026-07-28T17:12:00.000Z',
      action: 'Saved direct note',
      note: 'Unit 101 paint touch-up recorded.',
      entityType: 'Unit',
      entityId: 'unit-101',
    },
    {
      actor: 'Los',
      boundary: 'personal-record',
      category: 'note',
      source: 'Direct note',
      unitId: 'unit-101',
      unitNumber: '101',
    },
  ),
  projectLegacyActivityRecord({
    id: 'activity-draft',
    createdAt: '2026-07-28T17:13:00.000Z',
    action: 'Created draft actions',
    note: 'Unconfirmed model proposal',
    entityType: 'DraftAction',
    entityId: 'draft-1',
  }),
];

const previewReceipt = (
  id: string,
  message: string,
): TrackDSaveReceipt => ({
  recordId: id,
  message,
});

export function TrackDPreview() {
  const [surface, setSurface] = useState<PreviewSurface>('import');
  const [theme, setTheme] = useState<PreviewTheme>('light');
  const [result, setResult] = useState('No host callback yet.');
  const [confirmCount, setConfirmCount] = useState(0);
  const initialPhoto = useMemo(
    () =>
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#0879e8"/></svg>',
        ],
        'plus-selected.svg',
        { type: 'image/svg+xml' },
      ),
    [],
  );

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.turnTheme;
    } else {
      document.documentElement.dataset.turnTheme = theme;
    }
  }, [theme]);

  const confirmImport = async (confirmed: TrackDConfirmedImport) => {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (
      confirmed.rows.some((row) =>
        /SAVE_FAIL|OFFLINE_FAIL/.test(row.restrictions),
      )
    ) {
      throw new Error('Synthetic complete-save failure');
    }
    setConfirmCount((count) => count + 1);
    setResult(
      JSON.stringify(
        {
          cleanRequested: confirmed.rows[0]?.cleanRequested,
          paintRequested: confirmed.rows[0]?.paintRequested,
          sourceFiles: confirmed.sourceFiles.map((file) => file.name),
          sourceKind: confirmed.source.kind,
          sourceName: confirmed.source.name,
          sourceFingerprint: confirmed.sourceBinding.fingerprint,
          sourceRevision: confirmed.sourceBinding.revision,
          originalText: confirmed.originalSource.originalText,
          transcriptionKind: confirmed.transcriptionKind,
        },
        null,
        2,
      ),
    );
    return {
      committed: true as const,
      sourceBinding: confirmed.sourceBinding,
    };
  };

  const parsePreviewSource = async (
    text: string,
    options: TrackDImportParseOptions,
  ) => {
    if (text.includes('THROW_PARSE')) {
      throw new Error('Synthetic parser failure');
    }
    if (text.includes('SLOW_PARSE')) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    return parseTrackDImportText(text, options);
  };

  const saveNote = async (
    request: TrackDNoteRequest,
  ): Promise<TrackDSaveReceipt> => {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (/SAVE_FAIL|OFFLINE_FAIL/.test(request.wording)) {
      throw new Error('Synthetic note save failure');
    }
    setResult(
      JSON.stringify(
        {
          unitId: request.unitId,
          wording: request.wording,
        },
        null,
        2,
      ),
    );
    return previewReceipt('note-1', 'Note saved');
  };

  const savePhoto = async (
    request: TrackDPhotoRequest,
  ): Promise<TrackDSaveReceipt> => {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    if (/SAVE_FAIL|OFFLINE_FAIL/.test(request.context.caption)) {
      throw new Error('Synthetic photo save failure');
    }
    setResult(
      JSON.stringify(
        {
          caption: request.context.caption,
          fileName: request.file.name,
          fileType: request.file.type,
          unitId: request.context.unitId,
        },
        null,
        2,
      ),
    );
    return previewReceipt('photo-1', 'Photo saved');
  };

  return (
    <main className="w2a2d-preview-shell">
      <nav aria-label="Track D test surfaces" className="w2a2d-preview-toolbar">
        {(['import', 'note', 'photo', 'activity', 'reports'] as const).map((item) => (
          <button
            aria-pressed={surface === item}
            key={item}
            onClick={() => {
              setSurface(item);
              setResult('No host callback yet.');
            }}
            type="button"
          >
            {surfaceLabel(item)}
          </button>
        ))}
        {(['system', 'light', 'dark'] as const).map((item) => (
          <button
            aria-label={`${surfaceLabel(item)} theme`}
            aria-pressed={theme === item}
            key={item}
            onClick={() => setTheme(item)}
            type="button"
          >
            {surfaceLabel(item)}
          </button>
        ))}
      </nav>

      {surface === 'import' ? (
        <SourceFirstImport
          attachmentPermission={{
            canAttach: true,
            label: 'Recorded for synthetic browser test',
          }}
          existingUnitNumbers={units.map((unit) => unit.unitNumber)}
          initialKind="daily-release"
          onConfirm={confirmImport}
          parseSource={parsePreviewSource}
        />
      ) : null}

      {surface === 'note' ? (
        <DirectNoteFlow
          initialUnitId="unit-101"
          onSave={saveNote}
          onUndo={() => {
            setResult('Note undo requested.');
          }}
          onView={() => {
            setResult('Note view requested.');
          }}
          units={units}
        />
      ) : null}

      {surface === 'photo' ? (
        <DirectPhotoFlow
          initialFile={initialPhoto}
          initialUnitId="unit-101"
          onSave={savePhoto}
          onUndo={() => {
            setResult('Photo undo requested.');
          }}
          onView={() => {
            setResult('Photo view requested.');
          }}
          permission={{
            canSave: true,
            canSelect: true,
            label: 'Recorded for synthetic browser test',
          }}
          propertyId="synthetic-property"
          units={units}
        />
      ) : null}

      {surface === 'activity' ? (
        <ActivitySurface
          onOpenRecord={(recordId) => {
            setResult(`Opened ${recordId}`);
          }}
          records={activityRecords}
          timeZone="America/Chicago"
        />
      ) : null}

      {surface === 'reports' ? (
        <TrackDReportsAndProof
          onOpenRecords={(metricId, recordIds) => {
            setResult(`${metricId}:${recordIds.length}`);
          }}
          recordsByMetric={{
            'notes-photos': [
              { id: 'activity-note', label: 'Unit 101 direct note' },
            ],
            'property-roster': [],
            'ready-to-walk': [],
          }}
          statuses={{ working: 'Not recorded' }}
        />
      ) : null}

      <pre className="w2a2d-preview-result" data-testid="preview-result">
        {result}
        {'\n'}confirmCount:{confirmCount}
      </pre>
    </main>
  );
}

const surfaceLabel = (
  value: PreviewSurface | PreviewTheme,
) => `${value.charAt(0).toLocaleUpperCase('en-US')}${value.slice(1)}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackDPreview />
  </StrictMode>,
);
