import { ArrowLeft, NotebookPen, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppData } from '../../../types';
import { PERSONAL_NOTE_ACTIVITY_ACTION } from '../track-c/personalActivity';
import './trackB.css';

// iOS-Notes-style list of every personal note: newest first, searchable,
// unit-tappable. Notes are ActivityLog rows — nothing new is stored.

export const MyNotesPage = ({
  data,
  onBack,
  onNewNote,
  onOpenUnit,
}: {
  data: AppData;
  onBack: () => void;
  onNewNote: () => void;
  onOpenUnit: (unitId: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const notes = useMemo(() => {
    const unitNumberById = new Map(data.units.map((unit) => [unit.id, unit.unitNumber]));
    return data.activityLogs
      .filter((entry) =>
        entry.projectId === data.activeProjectId
        && entry.action === PERSONAL_NOTE_ACTIVITY_ACTION)
      .map((entry) => ({
        at: entry.createdAt,
        id: entry.id,
        text: entry.note,
        unitId: entry.entityType === 'Unit' ? entry.entityId : undefined,
        unitNumber: entry.entityType === 'Unit'
          ? unitNumberById.get(entry.entityId)
          : undefined,
      }))
      .sort((left, right) => right.at.localeCompare(left.at));
  }, [data]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? notes.filter((note) =>
      note.text.toLowerCase().includes(needle)
      || (note.unitNumber ?? '').toLowerCase().includes(needle))
    : notes;

  return (
    <section aria-labelledby="my-notes-heading" className="w2a1b-notes">
      <header className="w2a1b-notes__header">
        <button aria-label="Back to More" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h1 id="my-notes-heading"><NotebookPen aria-hidden="true" size={18} /> My Notes</h1>
        <button aria-label="New note" className="w2a1b-notes__new" onClick={onNewNote} type="button">
          <Plus aria-hidden="true" size={18} /> New
        </button>
      </header>
      <label className="w2a1b-notes__search">
        <Search aria-hidden="true" size={17} />
        <input
          inputMode="search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes or unit numbers"
          value={query}
        />
      </label>
      {visible.length === 0 ? (
        <p className="w2a1b-notes__empty">
          {notes.length === 0
            ? 'No notes yet — tap New, or use Plus → Note anywhere.'
            : 'No notes match that search.'}
        </p>
      ) : (
        <ul className="w2a1b-notes__list">
          {visible.map((note) => (
            <li key={note.id}>
              <p>{note.text}</p>
              <span>
                {note.unitNumber && note.unitId ? (
                  <button onClick={() => onOpenUnit(note.unitId as string)} type="button">
                    Unit {note.unitNumber}
                  </button>
                ) : null}
                <small>
                  {new Date(note.at).toLocaleString([], {
                    day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short',
                  })}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
