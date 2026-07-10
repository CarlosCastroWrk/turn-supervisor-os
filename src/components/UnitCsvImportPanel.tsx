import { AlertTriangle, Download, FileUp, ShieldCheck, X } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { importUnitsFromCsv } from '../lib/actions';
import { downloadTextFile } from '../lib/exporters';
import { persistAppDataNow } from '../lib/storage';
import {
  buildUnitCsvTemplate,
  parseUnitCsv,
  UNIT_CSV_MAX_BYTES,
  UNIT_CSV_TEMPLATE_FILENAME,
  type UnitCsvParseResult,
} from '../lib/unitCsvImport';
import type { AppData, Project } from '../types';
import { Button } from './FormControls';
import { Section } from './Section';
import { useToast } from './toast-context';

interface UnitCsvImportPanelProps {
  data: AppData;
  project: Project;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

interface UnitCsvPreview {
  fileName: string;
  projectId: string;
  result: UnitCsvParseResult;
}

const visibleMessages = 8;

export function UnitCsvImportPanel({ data, project, setData }: UnitCsvImportPanelProps) {
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileReadToken = useRef(0);
  const [preview, setPreview] = useState<UnitCsvPreview>();
  const [isReading, setIsReading] = useState(false);
  const activeUnitNumbers = useMemo(
    () => data.units.filter((unit) => unit.projectId === project.id).map((unit) => unit.unitNumber),
    [data.units, project.id],
  );
  const previewIsStale = Boolean(preview && preview.projectId !== project.id);

  const clearPreview = () => {
    fileReadToken.current += 1;
    setPreview(undefined);
    setIsReading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const chooseFile = () => inputRef.current?.click();

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > UNIT_CSV_MAX_BYTES) {
      clearPreview();
      notify(`CSV must be ${UNIT_CSV_MAX_BYTES / 1024 / 1024} MB or smaller.`, { tone: 'error' });
      return;
    }

    const token = fileReadToken.current + 1;
    fileReadToken.current = token;
    setIsReading(true);
    setPreview(undefined);
    try {
      const text = await file.text();
      const result = await parseUnitCsv(text, { existingUnitNumbers: activeUnitNumbers });
      if (fileReadToken.current !== token) return;
      setPreview({ fileName: file.name, projectId: project.id, result });
      if (result.fatalErrors.length > 0) {
        notify(result.fatalErrors[0], { tone: 'error' });
      }
    } catch (error) {
      if (fileReadToken.current !== token) return;
      const message = error instanceof Error ? error.message : 'CSV could not be read.';
      setPreview(undefined);
      notify(message, { tone: 'error' });
    } finally {
      if (fileReadToken.current === token) setIsReading(false);
    }
  };

  const downloadTemplate = () => {
    downloadTextFile(UNIT_CSV_TEMPLATE_FILENAME, buildUnitCsvTemplate(), 'text/csv;charset=utf-8');
  };

  const applyImport = () => {
    if (!preview || previewIsStale || preview.result.rows.length === 0 || preview.result.fatalErrors.length > 0) return;
    const skippedCount = preview.result.skippedExisting.length + preview.result.rowErrors.length;
    const confirmed = window.confirm(
      `Add ${preview.result.rows.length.toLocaleString()} new unit(s) to ${project.name}? ` +
        `Existing units will not change${skippedCount > 0 ? `, and ${skippedCount.toLocaleString()} skipped row(s) will stay skipped` : ''}. ` +
        'This import cannot be undone automatically.',
    );
    if (!confirmed) return;

    const outcome = importUnitsFromCsv(data, preview.projectId, preview.result.rows);
    if (outcome.status === 'project-changed') {
      notify('The active project changed. Choose the CSV again before importing.', { tone: 'error' });
      return;
    }
    if (outcome.status === 'not-real') {
      notify('CSV import is available only in Real Turn Mode.', { tone: 'error' });
      return;
    }
    if (outcome.status === 'row-limit') {
      notify('CSV exceeds the safe row limit.', { tone: 'error' });
      return;
    }
    if (outcome.status === 'nothing-to-import') {
      notify('No new units were imported. Existing units were left unchanged.', { tone: 'error' });
      return;
    }

    if (!persistAppDataNow(outcome.data)) {
      notify('Import canceled because this device could not safely store the result.', { tone: 'error' });
      return;
    }
    setData(outcome.data);
    notify(
      `${outcome.importedCount.toLocaleString()} unit(s) imported. Existing unit data was not changed.`,
      { tone: 'success' },
    );
    clearPreview();
  };

  const result = preview?.result;

  return (
    <Section title="Import Unit List" kicker="Preview first · Real Turn only">
      <div className="form-card unit-csv-import">
        <div className="unit-csv-import__intro">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Add units without overwriting the board</strong>
            <p>
              Required column: Unit. Optional: Building, Floor, Beds, Bathrooms, Common Area, and Notes. Status columns are never imported.
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          aria-label="CSV file"
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void readFile(event)}
        />
        <div className="button-row csv-import-actions">
          <Button disabled={isReading} onClick={chooseFile}>
            <FileUp size={18} aria-hidden="true" />
            {isReading ? 'Reading CSV...' : 'Choose CSV'}
          </Button>
          <Button onClick={downloadTemplate} variant="ghost">
            <Download size={18} aria-hidden="true" />
            Download Template
          </Button>
        </div>
        <p className="csv-import-rule">
          Blank building uses the project&apos;s only building when there is one; otherwise it uses Imported Units. Blank floor uses Unassigned Floor.
        </p>

        {preview && result ? (
          <div className="csv-import-preview" aria-live="polite">
            <div className="csv-import-preview__header">
              <div>
                <strong>{preview.fileName}</strong>
                <small>{result.totalDataRows.toLocaleString()} {result.totalDataRows === 1 ? 'row' : 'rows'} reviewed</small>
              </div>
              <Button aria-label="Clear CSV preview" onClick={clearPreview} variant="ghost">
                <X size={18} aria-hidden="true" />
                Clear
              </Button>
            </div>

            <div className="csv-import-summary" aria-label="CSV preview summary">
              <div>
                <strong>{result.rows.length.toLocaleString()}</strong>
                <span>Ready to import</span>
              </div>
              <div>
                <strong>{result.skippedExisting.length.toLocaleString()}</strong>
                <span>Existing skipped</span>
              </div>
              <div>
                <strong>{result.rowErrors.length.toLocaleString()}</strong>
                <span>Invalid or duplicate</span>
              </div>
            </div>

            {previewIsStale ? (
              <div className="csv-import-notice csv-import-notice--error" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                The active project changed. Clear this preview and choose the file again.
              </div>
            ) : null}

            {result.fatalErrors.map((message) => (
              <div className="csv-import-notice csv-import-notice--error" key={message} role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                {message}
              </div>
            ))}

            {result.warnings.map((message) => (
              <div className="csv-import-notice" key={message}>
                <AlertTriangle size={18} aria-hidden="true" />
                {message}
              </div>
            ))}

            {result.skippedExisting.length > 0 || result.rowErrors.length > 0 ? (
              <details className="csv-import-messages">
                <summary>Review skipped rows ({result.skippedExisting.length + result.rowErrors.length})</summary>
                <ul>
                  {[...result.skippedExisting, ...result.rowErrors].slice(0, visibleMessages).map((message) => (
                    <li key={`${message.sourceRow}:${message.message}`}>
                      Row {message.sourceRow}: {message.message}
                    </li>
                  ))}
                </ul>
                {result.skippedExisting.length + result.rowErrors.length > visibleMessages ? (
                  <small>Showing the first {visibleMessages} skipped rows.</small>
                ) : null}
              </details>
            ) : null}

            {result.rows.length > 0 ? (
              <div className="csv-import-table-scroll">
                <table className="csv-import-table">
                  <caption className="visually-hidden">First units ready to import</caption>
                  <thead>
                    <tr>
                      <th scope="col">Unit</th>
                      <th scope="col">Building</th>
                      <th scope="col">Floor</th>
                      <th scope="col">Beds</th>
                      <th scope="col">Baths</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 10).map((row) => (
                      <tr key={`${row.sourceRow}:${row.unitNumber}`}>
                        <td>{row.unitNumber}</td>
                        <td>{row.buildingName || 'Use project default'}</td>
                        <td>{row.floorName || 'Unassigned Floor'}</td>
                        <td>{row.bedCount}</td>
                        <td>{row.bathroomCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 10 ? <small>Showing the first 10 ready units.</small> : null}
              </div>
            ) : null}

            <div className="button-row csv-import-confirm">
              <Button
                disabled={previewIsStale || result.rows.length === 0 || result.fatalErrors.length > 0}
                onClick={applyImport}
                variant="primary"
              >
                <FileUp size={18} aria-hidden="true" />
                Import {result.rows.length.toLocaleString()} Unit{result.rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
