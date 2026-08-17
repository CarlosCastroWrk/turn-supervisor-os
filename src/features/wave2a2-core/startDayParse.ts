import type { FieldSection, FieldTrade, ReleaseWorkType } from '../../types';
import { crewFirstNameMatches } from '../../lib/constants';

// The roster grain the parser matches against (moved here from the retired
// dictationParse when the old Start Day wizard was deleted).
export interface DictationRosterUnit {
  readonly id: string;
  readonly unitNumber: string;
  readonly beds: readonly FieldSection[]; // bedroom sections this unit has, e.g. ['A','B','C']
  readonly hasCommon: boolean;
}

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
  /** Crew named on the line ("— Rocky", "assign to Sandra"). */
  readonly crewName?: string;
  /** Texture repairs with counts — NOT released rooms; they ride as notes. */
  readonly textures?: readonly { section?: FieldSection; count: number }[];
}

export interface StartDayCrew {
  readonly name: string;
  readonly trade: FieldTrade;
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
// \bcomplet stops "full" from being read into "incomplete" (a note that a room
// is NOT done): "incomplete" has no word boundary before "complet", so it won't
// match, while "completo/completa/complete" still do.
const FULL_RE = /\bfull\b|\bcomplet/i;
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

// Trade keywords for memo headers and inline prefixes — ONE word list feeds
// every regex so a new crew word can never half-work. Emoji cover ChatGPT's
// emoji-only headers ("🧹:"). "heavy/deep clean" is a task inside a clean
// line, never a header — the header check runs on lines without unit numbers,
// and inline switches require a unit number right after the keyword, so task
// words can't flip the trade mid-list.
const PAINT_WORD_STEMS = ['paint', 'pintur', 'pintar'];
const CLEAN_WORD_STEMS = ['clean', 'limpie', 'limpiar', '\\baseo\\b'];
const PAINT_WORD_RE = new RegExp([...PAINT_WORD_STEMS, '🎨', '🖌'].join('|'), 'iu');
const CLEAN_WORD_RE = new RegExp([...CLEAN_WORD_STEMS, '🧹', '🧽', '🧼', '🪣'].join('|'), 'iu');
const INLINE_TRADE_SPLIT_RE = new RegExp(
  `(?=\\b(?:${[...PAINT_WORD_STEMS, ...CLEAN_WORD_STEMS].join('|')})\\w*\\s*[:\\-–—]?\\s*\\d{3,4}\\b)`,
  'i',
);

const UNIT_NUMBER_RE = /\d{3,4}/;

interface MutableRow {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly trade: FieldTrade;
  readonly sections: Map<FieldSection, ReleaseWorkType | undefined>;
  crewName?: string;
  textures: { section?: FieldSection; count: number }[];
}

// "2 textures", "texture repair ×3", "textura" — count first or trailing.
const TEXTURE_RE = /(?:(\d+)\s*)?(?:textures?|texturas?)\b(?:\s*(?:repairs?|reps?|reparaci[oó]n(?:es)?))?(?:\s*[x×]\s*(\d+))?/i;

// Rooms named in one comma segment: "A B", "A-C", "a through c".
const parseSegmentBeds = (segment: string): FieldSection[] => {
  const upper = segment.toUpperCase();
  const found = new Set<FieldSection>();
  const rangeRe = /\b([A-E])\s*(?:-|–|—|TO|THROUGH|THRU|HASTA)\s*([A-E])\b/g;
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
  crews: readonly StartDayCrew[] = [],
): void => {
  // Per-room task grain: comma/semicolon segments, each with its own rooms and
  // task ("A: recorte, D: retoque"). "+" stays inside a segment — it joins
  // rooms on clean lines ("Común + A") and task words on paint combos
  // ("completo + recorte").
  const segments = descriptor.split(/[,;]+/);
  const parsed = segments.map((segment) => {
    const textureMatch = TEXTURE_RE.exec(segment);
    return {
      beds: parseSegmentBeds(segment),
      hasCommon: COMMON_RE.test(segment),
      isStudio: STUDIO_RE.test(segment),
      isWholeUnit: WHOLE_UNIT_RE.test(segment),
      textureCount: textureMatch
        ? Number(textureMatch[1] ?? textureMatch[2] ?? 1) || 1
        : undefined,
      workType: detectStartDayWorkType(segment, trade),
    };
  });

  // Backward-fill tasks so "A, B cut in" reads as cut-in on both rooms: a
  // segment without a task takes the task of the next segment that has one —
  // but a texture segment never inherits one (texture is NOT a paint task).
  for (let i = parsed.length - 2; i >= 0; i -= 1) {
    if (parsed[i].workType === undefined && parsed[i].textureCount === undefined) {
      parsed[i].workType = parsed[i + 1].workType;
    }
  }

  // Crew named on the line — first-name match against the roster, same trade.
  const crewName = crews.find((crew) =>
    crew.trade === trade && crewFirstNameMatches(crew.name, descriptor))?.name;

  const saidStudio = parsed.some((segment) => segment.isStudio);
  const saidWholeUnit = parsed.some((segment) => segment.isWholeUnit);
  const allBeds = parsed.flatMap((segment) => segment.beds);
  const entryWorkType = detectStartDayWorkType(descriptor, trade);

  const sections = new Map<FieldSection, ReleaseWorkType | undefined>();
  const extraRooms: FieldSection[] = [];
  const textures: { section?: FieldSection; count: number }[] = [];
  for (const segment of parsed) {
    // A texture segment with NO task marks the rooms as texture-only — they
    // are NOT released as paint work (texture ≠ touch-up). A segment with
    // both ("C touch-up + 2 textures") releases AND logs the textures.
    const textureOnly = segment.textureCount !== undefined && segment.workType === undefined;
    if (segment.textureCount !== undefined) {
      const targets: (FieldSection | undefined)[] = [
        ...segment.beds.filter((bed) => unit.beds.includes(bed)),
        ...(segment.hasCommon && unit.hasCommon ? ['common' as const] : []),
      ];
      if (targets.length === 0) targets.push(undefined);
      for (const target of targets) {
        textures.push({ count: segment.textureCount, section: target });
      }
    }
    for (const bed of segment.beds) {
      if (!unit.beds.includes(bed)) {
        if (!extraRooms.includes(bed)) extraRooms.push(bed);
        continue;
      }
      if (textureOnly) continue;
      // A later, more specific mention wins over an earlier task-less one.
      if (!sections.has(bed) || segment.workType !== undefined) {
        sections.set(bed, segment.workType);
      }
    }
    if (segment.hasCommon && unit.hasCommon && !textureOnly) {
      if (!sections.has('common') || segment.workType !== undefined) {
        // Común carries its task on paint ("Común: pintura completa") — Los
        // must see the task on every room, common included.
        sections.set('common', segment.workType);
      }
    }
  }

  // Studio / "full unit" / a bare task or "full/completo" with no rooms = the
  // whole unit. The FULL_RE check keeps clean lines honest too: "504 full" and
  // "limpieza completa" mean the whole unit even though clean carries no task.
  const wholeUnit = saidStudio || saidWholeUnit
    || (allBeds.length === 0 && sections.size === 0
      && (entryWorkType !== undefined || FULL_RE.test(descriptor)));
  if (wholeUnit) {
    for (const bed of unit.beds) {
      if (!sections.has(bed)) sections.set(bed, entryWorkType);
    }
    // A studio's whole scope IS its common — without this, a studio paint
    // release ("1209 — completo") would parse to nothing.
    if (unit.beds.length === 0 && unit.hasCommon && !sections.has('common')) {
      sections.set('common', entryWorkType);
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

  // CLEAN: every unit gets its common automatically (Los's rule) — but a
  // texture-only line releases nothing.
  if (trade === 'clean' && unit.hasCommon && !sections.has('common')
    && (sections.size > 0 || textures.length === 0)) {
    sections.set('common', entryWorkType);
  }

  if (sections.size === 0 && textures.length === 0 && !crewName) {
    warnings.push(
      `${unit.unitNumber}: no rooms heard — say the rooms (e.g. "${unit.unitNumber} A B").`,
    );
    return;
  }

  const key = `${unit.id}:${trade}`;
  const existing = rows.get(key) ?? {
    sections: new Map<FieldSection, ReleaseWorkType | undefined>(),
    textures: [],
    trade,
    unitId: unit.id,
    unitNumber: unit.unitNumber,
  };
  for (const [section, workType] of sections) {
    if (!existing.sections.has(section) || workType !== undefined) {
      existing.sections.set(section, workType);
    }
  }
  if (crewName) existing.crewName = crewName;
  existing.textures.push(...textures);
  rows.set(key, existing);
};

// When a line carries no header and no mode, tell paint from clean by the line
// itself. A trade word anywhere in the line wins ("limpieza completa" is a
// clean line even though "completa" is also a paint task word); otherwise
// paint lines name a task and clean lines never do.
const inferTrade = (descriptor: string): FieldTrade => {
  if (CLEAN_WORD_RE.test(descriptor)) return 'clean';
  if (PAINT_WORD_RE.test(descriptor)) return 'paint';
  return detectStartDayWorkType(descriptor, 'paint') !== undefined ? 'paint' : 'clean';
};

export const parseStartDayMemo = (
  text: string,
  units: readonly DictationRosterUnit[],
  mode: StartDayMemoMode = 'both',
  crews: readonly StartDayCrew[] = [],
): StartDayParseResult => {
  const byNumber = new Map(units.map((unit) => [unit.unitNumber.toLowerCase(), unit]));
  const rows = new Map<string, MutableRow>();
  const unmatched: string[] = [];
  const mismatches: string[] = [];
  const warnings: string[] = [];

  let currentTrade: FieldTrade | undefined =
    mode === 'paint' ? 'paint' : mode === 'clean' ? 'clean' : undefined;
  let inferredRows = 0;
  const unreadLines: string[] = [];

  for (const rawLine of text.split(/\n+/)) {
    // Strip list bullets and markdown so ChatGPT output reads clean.
    const line = rawLine.replace(/^[\s*#>•·◦▪-]+/, '').replace(/\*/g, '').trim();
    if (!line) continue;

    if (!UNIT_NUMBER_RE.test(line)) {
      // Header line: "Pintura:", "🧹 Clean list", "Lista de limpieza", "🧹:"…
      const isPaint = PAINT_WORD_RE.test(line);
      const isClean = CLEAN_WORD_RE.test(line);
      if (mode === 'both' && isPaint !== isClean) {
        currentTrade = isPaint ? 'paint' : 'clean';
      } else if (!isPaint && !isClean && /[A-Za-z0-9]/.test(line)) {
        // Not a header, no unit number: say so instead of silently eating it.
        unreadLines.push(line.length > 40 ? `${line.slice(0, 40)}…` : line);
      }
      continue;
    }

    // Inline trade switches: a trade word directly followed by a unit number
    // ("paint 1806 A B cut in … clean 1404 A B C D") splits the line. Task
    // words like "full paint" never precede a number, so they can't switch.
    const pieces = mode === 'both' ? line.split(INLINE_TRADE_SPLIT_RE) : [line];

    for (const piece of pieces) {
      const firstDigit = piece.search(/\d/);
      if (firstDigit < 0) continue;
      if (mode === 'both') {
        const prefix = piece.slice(0, firstDigit);
        if (PAINT_WORD_RE.test(prefix)) currentTrade = 'paint';
        else if (CLEAN_WORD_RE.test(prefix)) currentTrade = 'clean';
      }
      const pieceTrade = currentTrade;

      // A 5+ digit run is a typo, not a unit ("10025" = fat-fingered "1002").
      // The entry regex would silently read "1002" and drop the stray digit —
      // so flag it instead of quietly releasing the wrong unit.
      for (const oversized of piece.match(/\d{5,}/g) ?? []) {
        const flag = `${oversized}: that’s ${oversized.length} digits — a real unit is 3–4. Which unit did you mean?`;
        if (!warnings.includes(flag)) warnings.push(flag);
      }
      // Entries: each 3–4 digit unit number owns the text up to the next one.
      // Small numbers inside a descriptor ("×2", "2 textures") are NOT unit
      // boundaries — only a 3–4 digit run starts a new entry.
      const entryRe = /(\d{3,4})((?:\D|\d{1,2}(?!\d))*)/g;
      let match: RegExpExecArray | null;
      while ((match = entryRe.exec(piece)) !== null) {
        const unit = byNumber.get(match[1].toLowerCase());
        if (!unit) {
          if (!unmatched.includes(match[1])) unmatched.push(match[1]);
          continue;
        }
        const descriptor = match[2] ?? '';
        let trade = pieceTrade;
        if (trade === undefined) {
          // A named crew settles the trade ("1806 A B — Rocky" is paint if
          // Rocky paints) more reliably than task-word inference.
          const namedTrades = new Set(crews
            .filter((candidate) => crewFirstNameMatches(candidate.name, descriptor))
            .map((candidate) => candidate.trade));
          if (namedTrades.size === 1) {
            trade = [...namedTrades][0];
          } else {
            trade = inferTrade(descriptor);
            inferredRows += 1;
          }
        }
        applyEntry(unit, descriptor, trade, rows, mismatches, warnings, crews);
      }
    }
  }

  if (unreadLines.length > 0) {
    warnings.push(`Didn’t read: ${unreadLines.slice(0, 3).map((line) => `“${line}”`).join(', ')}${unreadLines.length > 3 ? ` +${unreadLines.length - 3} more` : ''}.`);
  }
  if (inferredRows > 0) {
    warnings.push('Some lines had no Paint/Clean label — task words read as Paint, plain room lists as Clean. Double-check the two groups.');
  }

  const orderedRows: StartDayParsedRow[] = [...rows.values()].map((row) => ({
    ...(row.crewName ? { crewName: row.crewName } : {}),
    ...(row.textures.length > 0 ? { textures: row.textures } : {}),
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
