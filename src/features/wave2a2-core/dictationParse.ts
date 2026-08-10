// RETIRED (Aug 10 2026): superseded by startDayParse.ts (Spanish task words,
// per-room tasks, headers, mismatch flags). Only the retired
// DailyReleaseSelector still imports this. Do not add list-format fixes here.
import type { FieldSection, ReleaseWorkType } from '../../types';

// Deterministic parser for Los's dictated/typed release list — no AI, no
// sign-in, no rate limit, instant and offline. His shorthand is regular:
//   "1806 A B cut in, 1707 A touch plus cut, 800 full unit"
//   "504 C D, 1806 A B"  (clean — common is added to every unit automatically)
// so plain rules read it perfectly. The AI reader stays as a fallback for messy
// photo input; this is the reliable path he asked to lead with.

export interface DictationRosterUnit {
  readonly id: string;
  readonly unitNumber: string;
  readonly beds: readonly FieldSection[]; // bedroom sections this unit has, e.g. ['A','B','C']
  readonly hasCommon: boolean;
}

export interface DictationSection {
  readonly section: FieldSection;
  readonly workType?: ReleaseWorkType;
}

export interface DictationRow {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly sections: readonly DictationSection[];
}

export interface DictationResult {
  readonly rows: readonly DictationRow[];
  readonly unmatched: readonly string[]; // unit numbers said but not in the roster
  readonly warnings: readonly string[];
}

const BED_LETTERS: readonly FieldSection[] = ['A', 'B', 'C', 'D', 'E'];

// Map a spoken/typed work phrase to a work type. Combos are checked first so
// "touch plus cut" doesn't match as plain "touch". Returns undefined if the
// phrase names no task (then the caller decides a default).
export const detectWorkType = (raw: string): ReleaseWorkType | undefined => {
  const text = raw.toLowerCase();
  const hasTouch = /touch/.test(text);
  const hasCut = /\bcut/.test(text);
  const hasFull = /\bfull\b/.test(text);
  if (hasTouch && hasCut) return 'touch-up-cut-in';
  if (hasFull && hasCut) return 'full-cut-in';
  if (hasCut) return 'cut-in';
  if (hasTouch) return 'touch-up';
  if (hasFull) return 'full';
  return undefined;
};

// Pull room letters out of an entry's descriptor, supporting "A B C", "A, C",
// "a-c" and "a through c" ranges. Returns unique bed letters in board order.
const parseRooms = (descriptor: string): FieldSection[] => {
  const upper = descriptor.toUpperCase();
  const found = new Set<FieldSection>();
  // Ranges first: A-C, A TO C, A THROUGH C
  const rangeRe = /\b([A-E])\s*(?:-|TO|THROUGH|THRU)\s*([A-E])\b/g;
  let match: RegExpExecArray | null;
  let ranged = upper;
  while ((match = rangeRe.exec(upper)) !== null) {
    const start = BED_LETTERS.indexOf(match[1] as FieldSection);
    const end = BED_LETTERS.indexOf(match[2] as FieldSection);
    if (start >= 0 && end >= 0) {
      for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) {
        found.add(BED_LETTERS[i]);
      }
    }
    ranged = ranged.replace(match[0], ' ');
  }
  // Standalone letters (a word boundary keeps us off the middle of words).
  for (const letter of ranged.match(/\b[A-E]\b/g) ?? []) {
    found.add(letter as FieldSection);
  }
  return BED_LETTERS.filter((letter) => found.has(letter));
};

// Split the whole text into (unitNumber, descriptor) entries. An entry begins at
// each 3–4 digit unit number and runs until the next one, so commas are optional.
const splitEntries = (text: string): { unitNumber: string; descriptor: string }[] => {
  const entries: { unitNumber: string; descriptor: string }[] = [];
  const re = /(\d{3,4})([^\d]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    entries.push({ descriptor: match[2] ?? '', unitNumber: match[1] });
  }
  return entries;
};

export const parseDictatedRelease = (
  text: string,
  trade: 'paint' | 'clean',
  units: readonly DictationRosterUnit[],
): DictationResult => {
  const byNumber = new Map(units.map((unit) => [unit.unitNumber.toLowerCase(), unit]));
  const rowByUnit = new Map<string, { unitId: string; unitNumber: string; sections: Map<FieldSection, ReleaseWorkType | undefined> }>();
  const unmatched: string[] = [];
  const warnings: string[] = [];

  for (const entry of splitEntries(text)) {
    const unit = byNumber.get(entry.unitNumber.toLowerCase());
    if (!unit) {
      if (!unmatched.includes(entry.unitNumber)) unmatched.push(entry.unitNumber);
      continue;
    }
    const descriptor = entry.descriptor;
    const workType = trade === 'paint' ? detectWorkType(descriptor) : undefined;
    let rooms = parseRooms(descriptor);
    // "full unit" or a bare "full" with no rooms named = the whole unit's beds.
    const wholeUnit = /full\s*unit/i.test(descriptor)
      || (/\bfull\b/i.test(descriptor) && rooms.length === 0);
    if (wholeUnit) rooms = [...unit.beds];
    // If paint work was named but no rooms at all, assume the whole unit.
    if (trade === 'paint' && rooms.length === 0 && workType) rooms = [...unit.beds];

    const wantsCommon = /\bcommon\b|com[uú]n|\bca\b/i.test(descriptor);
    const sections: FieldSection[] = [...rooms];
    // Clean: every unit gets its common area automatically (Los's rule — the
    // sheet never lists it, but every clean has one). Paint: only if he said so.
    if ((trade === 'clean' || wantsCommon) && unit.hasCommon) {
      sections.unshift('common');
    }
    // A unit named with nothing usable (no rooms, not full, no common): warn.
    if (sections.length === 0) {
      warnings.push(`${unit.unitNumber}: no rooms heard — say the rooms (e.g. "${unit.unitNumber} A B").`);
      continue;
    }

    const existing = rowByUnit.get(unit.id)
      ?? { sections: new Map<FieldSection, ReleaseWorkType | undefined>(), unitId: unit.id, unitNumber: unit.unitNumber };
    for (const section of sections) {
      // Common never carries a paint work type; a later, more specific mention wins.
      const type = section === 'common' ? undefined : workType;
      if (!existing.sections.has(section) || type !== undefined) {
        existing.sections.set(section, type);
      }
    }
    rowByUnit.set(unit.id, existing);
  }

  const order: readonly FieldSection[] = ['common', 'A', 'B', 'C', 'D', 'E'];
  const rows: DictationRow[] = [...rowByUnit.values()].map((row) => ({
    sections: order
      .filter((section) => row.sections.has(section))
      .map((section) => {
        const workType = row.sections.get(section);
        return workType ? { section, workType } : { section };
      }),
    unitId: row.unitId,
    unitNumber: row.unitNumber,
  }));

  return { rows, unmatched, warnings };
};
