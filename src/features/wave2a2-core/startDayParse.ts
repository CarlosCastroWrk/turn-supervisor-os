import type { FieldSection, FieldTrade, ReleaseWorkType } from '../../types';
import type { DictationRosterUnit } from './dictationParse';

// Start Day memo parser — deterministic, offline, no AI, no sign-in.
//
// This is the reader that must swallow the exact lists Los's morning loop
// produces (today via ChatGPT, tomorrow via in-app dictation), commons
// included — that accuracy gap is what pushed him back to texts on Aug 10:
//   Clean:  "1404 — Común + A, B, C, D"   "1209 — Estudio"
//   Paint:  "1002 — A: recorte, D: retoque"   "800 — completo"
//   Combined memo with headers: "Pintura:" / "Paint:" … "Limpieza:" / "Clean:"
// Rules the parser guarantees:
//   - CLEAN: every unit gets its common area automatically (the sheet never
//     lists it, but every clean has one). Studio = the unit's whole scope.
//   - PAINT: per-room tasks, Spanish or English words (retoque/recorte/
//     completo = touch-up/cut-in/full). Común carries its task too.
//   - Nothing is silently dropped: unknown units, rooms the roster doesn't
//     have, and studio-vs-bedrooms disagreements come back as flags so Los
//     can confirm the list at a glance and trust it.

export interface StartDayParsedRoom {
  readonly section: FieldSection;
  readonly workType?: ReleaseWorkType;
}

export interface StartDayParsedRow {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly trade: FieldTrade;
  readonly rooms: readonly StartDayParsedRoom[];
}

export interface StartDayParseResult {
  readonly rows: readonly StartDayParsedRow[];
  /** Unit numbers in the memo that are not in the roster. */
  readonly unmatched: readonly string[];
  /** Trust flags: the memo and the roster disagree — Los confirms which is right. */
  readonly mismatches: readonly string[];
  /** Units heard with nothing usable, and lines the parser could not place. */
  readonly warnings: readonly string[];
}

export type StartDayMemoMode = 'both' | 'paint' | 'clean';

const BED_LETTERS: readonly FieldSection[] = ['A', 'B', 'C', 'D', 'E'];
const SECTION_ORDER: readonly FieldSection[] = ['common', 'A', 'B', 'C', 'D', 'E'];

// Task words — English and the exact Spanish words the crews use (confirmed
// Aug 8): retoque = touch-up, recorte = cut-in, completo/pintura completa =
// full. Combos are combinations of the base words.
const TOUCH_RE = /touch|retoque/i;
const CUT_RE = /\bcut|recorte/i;
const FULL_RE = /\bfull\b|complet|\bcompleta\b/i;
const HEAVY_RE = /heavy|deep|pesad|profund/i;

export const detectStartDayWorkType = (
  raw: string,
  trade: FieldTrade,
): ReleaseWorkType | undefined => {
  if (trade === 'clean') {
    // Clean is just clean — the only task worth carrying is a heavy clean.
    return HEAVY_RE.test(raw) ? 'heavy-clean' : undefined;
  }
  const hasTouch = TOUCH_RE.test(raw);
  const hasCut = CUT_RE.test(raw);
  const hasFull = FULL_RE.test(raw);
  if (hasTouch && hasCut) return 'touch-up-cut-in';
  if (hasFull && hasCut) return 'full-cut-in';
  if (hasCut) return 'cut-in';
  if (hasTouch) return 'touch-up';
  if (hasFull) return 'full';
  return undefined;
};

const COMMON_RE = /\bcommon\b|com[uú]n|\bca\b/i;
const STUDIO_RE = /estudio|studio/i;
const WHOLE_UNIT_RE = /full\s*unit|whole\s*unit|unidad\s*completa/i;

// Trade keywords for memo headers and inline prefixes. "heavy/deep clean" is a
// task inside a clean line, never a header — the header check runs on lines
// without unit numbers, and inline switches require a unit number right after
// the keyword, so task words can't flip the trade mid-list.
const PAINT_WORD_RE = /paint|pintur|pintar/i;
const CLEAN_WORD_RE = /clean|limpie|limpiar/i;

const UNIT_NUMBER_RE = /\d{3,4}/;

interface MutableRow {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly trade: FieldTrade;
  readonly sections: Map<FieldSection, ReleaseWorkType | undefined>;
}

// Rooms named in one comma segment: "A B", "A-C", "a through c".
const parseSegmentBeds = (segment: string): FieldSection[] => {
  const upper = segment.toUpperCase();
  const found = new Set<FieldSection>();
  const rangeRe = /\b([A-E])\s*(?:-|–|TO|THROUGH|THRU|HASTA)\s*([A-E])\b/g;
  let match: RegExpExecArray | null;
  let remaining = upper;
  while ((match = rangeRe.exec(upper)) !== null) {
    const start = BED_LETTERS.indexOf(match[1] as FieldSection);
    const end = BED_LETTERS.indexOf(match[2] as FieldSection);
    if (start >= 0 && end >= 0) {
      for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) {
        found.add(BED_LETTERS[i]);
      }
    }
    remaining = remaining.replace(match[0], ' ');
  }
  for (const letter of remaining.match(/\b[A-E]\b/g) ?? []) {
    found.add(letter as FieldSection);
  }
  return BED_LETTERS.filter((letter) => found.has(letter));
};

// One "unitNumber + descriptor" entry under a known trade.
const applyEntry = (
  unit: DictationRosterUnit,
  descriptor: string,
  trade: FieldTrade,
  rows: Map<string, MutableRow>,
  mismatches: string[],
  warnings: string[],
): void => {
  // Per-room task grain: comma/semicolon segments, each with its own rooms and
  // task ("A: recorte, D: retoque"). "+" stays inside a segment — it joins
  // rooms on clean lines ("Común + A") and task words on paint combos
  // ("completo + recorte").
  const segments = descriptor.split(/[,;]+/);
  const parsed = segments.map((segment) => ({
    beds: parseSegmentBeds(segment),
    hasCommon: COMMON_RE.test(segment),
    isStudio: STUDIO_RE.test(segment),
    isWholeUnit: WHOLE_UNIT_RE.test(segment),
    workType: detectStartDayWorkType(segment, trade),
  }));

  // Backward-fill tasks so "A, B cut in" reads as cut-in on both rooms: a
  // segment without a task takes the task of the next segment that has one.
  for (let i = parsed.length - 2; i >= 0; i -= 1) {
    if (parsed[i].workType === undefined) parsed[i].workType = parsed[i + 1].workType;
  }

  const saidStudio = parsed.some((segment) => segment.isStudio);
  const saidWholeUnit = parsed.some((segment) => segment.isWholeUnit);
  const allBeds = parsed.flatMap((segment) => segment.beds);
  const entryWorkType = detectStartDayWorkType(descriptor, trade);

  const sections = new Map<FieldSection, ReleaseWorkType | undefined>();
  const extraRooms: FieldSection[] = [];
  for (const segment of parsed) {
    for (const bed of segment.beds) {
      if (!unit.beds.includes(bed)) {
        if (!extraRooms.includes(bed)) extraRooms.push(bed);
        continue;
      }
      // A later, more specific mention wins over an earlier task-less one.
      if (!sections.has(bed) || segment.workType !== undefined) {
        sections.set(bed, segment.workType);
      }
    }
    if (segment.hasCommon && unit.hasCommon) {
      if (!sections.has('common') || segment.workType !== undefined) {
        // Común carries its task on paint ("Común: pintura completa") — Los
        // must see the task on every room, common included.
        sections.set('common', segment.workType);
      }
    }
  }

  // Studio / "full unit" / a bare paint task with no rooms = the whole unit.
  const wholeUnit = saidStudio || saidWholeUnit
    || (allBeds.length === 0 && sections.size === 0 && entryWorkType !== undefined);
  if (wholeUnit) {
    for (const bed of unit.beds) {
      if (!sections.has(bed)) sections.set(bed, entryWorkType);
    }
  }

  // Trust flags — say it, never silently drop it.
  if (extraRooms.length > 0) {
    mismatches.push(
      `${unit.unitNumber}: you said ${extraRooms.join(', ')} but this unit has ${unit.beds.length > 0 ? unit.beds.join(', ') : 'no bedrooms'}${unit.hasCommon ? ' + Común' : ''} — those rooms were skipped. Is the roster right?`,
    );
  }
  if (saidStudio && unit.beds.length > 0) {
    mismatches.push(
      `${unit.unitNumber}: you said Estudio but this unit has ${unit.beds.join(', ')} — released all of them. Which is right?`,
    );
  }
  const saidCommon = parsed.some((segment) => segment.hasCommon);
  if (saidCommon && !unit.hasCommon) {
    mismatches.push(
      `${unit.unitNumber}: you said Común but the roster has no common area for this unit. Is the roster right?`,
    );
  }

  // CLEAN: every unit gets its common automatically (Los's rule).
  if (trade === 'clean' && unit.hasCommon && !sections.has('common')) {
    sections.set('common', entryWorkType);
  }

  if (sections.size === 0) {
    warnings.push(
      `${unit.unitNumber}: no rooms heard — say the rooms (e.g. "${unit.unitNumber} A B").`,
    );
    return;
  }

  const key = `${unit.id}:${trade}`;
  const existing = rows.get(key) ?? {
    sections: new Map<FieldSection, ReleaseWorkType | undefined>(),
    trade,
    unitId: unit.id,
    unitNumber: unit.unitNumber,
  };
  for (const [section, workType] of sections) {
    if (!existing.sections.has(section) || workType !== undefined) {
      existing.sections.set(section, workType);
    }
  }
  rows.set(key, existing);
};

// When a line carries no header and no mode, tell paint from clean by the line
// itself: paint lines always name a task; clean lines never do.
const inferTrade = (descriptor: string): FieldTrade =>
  detectStartDayWorkType(descriptor, 'paint') !== undefined ? 'paint' : 'clean';

export const parseStartDayMemo = (
  text: string,
  units: readonly DictationRosterUnit[],
  mode: StartDayMemoMode = 'both',
): StartDayParseResult => {
  const byNumber = new Map(units.map((unit) => [unit.unitNumber.toLowerCase(), unit]));
  const rows = new Map<string, MutableRow>();
  const unmatched: string[] = [];
  const mismatches: string[] = [];
  const warnings: string[] = [];

  let currentTrade: FieldTrade | undefined =
    mode === 'paint' ? 'paint' : mode === 'clean' ? 'clean' : undefined;

  for (const rawLine of text.split(/\n+/)) {
    // Strip list bullets and markdown so ChatGPT output reads clean.
    const line = rawLine.replace(/^[\s*#>•·◦▪-]+/, '').replace(/\*/g, '').trim();
    if (!line) continue;

    if (!UNIT_NUMBER_RE.test(line)) {
      // Header line: "Pintura:", "🧹 Clean list", "Lista de limpieza"…
      const isPaint = PAINT_WORD_RE.test(line);
      const isClean = CLEAN_WORD_RE.test(line);
      if (mode === 'both' && isPaint !== isClean) {
        currentTrade = isPaint ? 'paint' : 'clean';
      }
      continue;
    }

    // Inline trade switches: a trade word directly followed by a unit number
    // ("paint 1806 A B cut in … clean 1404 A B C D") splits the line. Task
    // words like "full paint" never precede a number, so they can't switch.
    const pieces = mode === 'both'
      ? line.split(/(?=\b(?:paint(?:ing)?|pintura|pintar|clean(?:ing)?|limpieza|limpiar)\b\s*[:\-–—]?\s*\d{3,4}\b)/i)
      : [line];

    for (const piece of pieces) {
      const firstDigit = piece.search(/\d/);
      if (firstDigit < 0) continue;
      if (mode === 'both') {
        const prefix = piece.slice(0, firstDigit);
        if (PAINT_WORD_RE.test(prefix)) currentTrade = 'paint';
        else if (CLEAN_WORD_RE.test(prefix)) currentTrade = 'clean';
      }
      const pieceTrade = currentTrade;

      // Entries: each 3–4 digit unit number owns the text up to the next one.
      const entryRe = /(\d{3,4})([^\d]*)/g;
      let match: RegExpExecArray | null;
      while ((match = entryRe.exec(piece)) !== null) {
        const unit = byNumber.get(match[1].toLowerCase());
        if (!unit) {
          if (!unmatched.includes(match[1])) unmatched.push(match[1]);
          continue;
        }
        const descriptor = match[2] ?? '';
        const trade = pieceTrade ?? inferTrade(descriptor);
        applyEntry(unit, descriptor, trade, rows, mismatches, warnings);
      }
    }
  }

  const orderedRows: StartDayParsedRow[] = [...rows.values()].map((row) => ({
    rooms: SECTION_ORDER
      .filter((section) => row.sections.has(section))
      .map((section) => {
        const workType = row.sections.get(section);
        return workType ? { section, workType } : { section };
      }),
    trade: row.trade,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
  }));

  return { mismatches, rows: orderedRows, unmatched, warnings };
};
