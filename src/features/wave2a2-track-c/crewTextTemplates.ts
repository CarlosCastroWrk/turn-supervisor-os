// One shared shape for every "here are your units" crew text, in the format
// Los dictated: one row per unit — "Unit 1307: common area, A (touch-up), B, C"
// — a short generic opener, and a closer that keeps the standing rule of
// "text me as each unit is finished". Single language per send (no mixing);
// the last language used sticks on this device.

import { compareUnitTopFloorFirst } from '../../lib/unitOrder';

export type CrewTextLang = 'es' | 'en';

const LANG_KEY = 'turn-os:crew-text-lang';

export const readCrewTextLang = (): CrewTextLang => {
  try {
    return window.localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
};

export const writeCrewTextLang = (lang: CrewTextLang): void => {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Device storage unavailable — the text still sends.
  }
};

export interface CrewTextSection {
  readonly kind: 'common' | 'bed';
  readonly bed?: string;
  readonly workType?: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | 'heavy-clean';
}

export interface CrewTextRow {
  readonly unitNumber: string;
  readonly sections: readonly CrewTextSection[];
  // A studio unit's clean line reads just "1209 — Estudio", not a room list.
  readonly isStudio?: boolean;
}

// The paint task words Los actually uses with his crews (retoque / recorte /
// completo) — deliberately his vocabulary, NOT the board labels (cortes /
// retoques) so the crew message reads exactly like the ones he already sends.
const crewPaintTaskWord = (
  workType: CrewTextSection['workType'],
  lang: CrewTextLang,
): string => {
  switch (workType) {
    case 'touch-up': return lang === 'es' ? 'retoque' : 'touch-up';
    case 'cut-in': return lang === 'es' ? 'recorte' : 'cut-in';
    case 'full-cut-in': return lang === 'es' ? 'completo + recorte' : 'full + cut-in';
    case 'touch-up-cut-in': return lang === 'es' ? 'retoque + recorte' : 'touch-up + cut-in';
    case 'heavy-clean': return lang === 'es' ? 'limpieza pesada' : 'heavy clean';
    default: return lang === 'es' ? 'completo' : 'full';
  }
};

// Los's exact daily crew-list format (from his real WhatsApp sends):
//   Buenos días, Rocky. Estas son tus unidades para hoy:
//   1101 — C: recorte
//   1404 — Común + A, B, C, D      (clean)   /   1209 — Estudio (studio clean)
//   Por favor, mantenme al tanto cuando termines cada unidad y pases a la
//   siguiente. Gracias.
// Paint shows "room: task" per room; clean lists the rooms with no task.
export const crewUnitsTextBody = (
  crewName: string,
  lang: CrewTextLang,
  rows: readonly CrewTextRow[],
  trade: 'paint' | 'clean' = 'paint',
): string => {
  const header = lang === 'es'
    ? `Buenos días, ${crewName}. Estas son tus unidades para hoy:`
    : `Good morning, ${crewName}. These are your units for today:`;
  const commonWord = lang === 'es' ? 'Común' : 'Common';
  const studioWord = lang === 'es' ? 'Estudio' : 'Studio';
  // Top-floor-first — Los's walk order.
  const sorted = [...rows].sort((left, right) =>
    compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
  const orderSections = (sections: readonly CrewTextSection[]) =>
    [...sections].sort((left, right) =>
      left.kind === right.kind
        ? (left.bed ?? '').localeCompare(right.bed ?? '')
        : left.kind === 'common' ? -1 : 1);
  const unitLines = sorted.map((row) => {
    if (trade === 'clean' && row.isStudio) return `${row.unitNumber} — ${studioWord}`;
    const ordered = orderSections(row.sections);
    if (trade === 'clean') {
      const hasCommon = ordered.some((section) => section.kind === 'common');
      const beds: string[] = [];
      const seenBeds = new Set<string>();
      for (const section of ordered) {
        if (section.kind !== 'bed' || !section.bed || seenBeds.has(section.bed)) continue;
        seenBeds.add(section.bed);
        beds.push(section.bed);
      }
      const bedsStr = beds.join(', ');
      const roomText = hasCommon && bedsStr
        ? `${commonWord} + ${bedsStr}`
        : hasCommon ? commonWord : bedsStr;
      return `${row.unitNumber} — ${roomText}`;
    }
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const section of ordered) {
      const room = section.kind === 'common' ? commonWord : (section.bed ?? '');
      const label = `${room}: ${crewPaintTaskWord(section.workType, lang)}`;
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(label);
    }
    return `${row.unitNumber} — ${parts.join(', ')}`;
  });
  const footer = lang === 'es'
    ? 'Por favor, mantenme al tanto cuando termines cada unidad y pases a la siguiente. Gracias.'
    : 'Please keep me posted as you finish each unit and move to the next. Thank you.';
  return [header, '', ...unitLines, '', footer].join('\n');
};

// A "come back and fix it" text — the crew that DID the room gets called back,
// with what's wrong in each room. Same calm, single-language shape as the
// units text, so Joseph's callback turns into a clear crew message in one tap.
export interface CrewCallbackRow {
  readonly unitNumber: string;
  readonly sections: readonly { readonly label: string; readonly reason?: string }[];
}

export const crewCallbackTextBody = (
  crewName: string,
  lang: CrewTextLang,
  rows: readonly CrewCallbackRow[],
): string => {
  const first = crewName.trim().split(/\s+/)[0];
  const header = lang === 'es'
    ? `Hola ${first}, necesitamos regresar a arreglar unas cosas:`
    : `Hi ${first}, we need to go back and fix a few things:`;
  const sorted = [...rows].sort((left, right) =>
    compareUnitTopFloorFirst(left.unitNumber, right.unitNumber));
  const lines = sorted.map((row) => {
    const parts = row.sections.map((section) => {
      const roomWord = section.label === 'common'
        ? lang === 'es' ? 'área común' : 'common area'
        : section.label;
      return section.reason ? `${roomWord} — ${section.reason}` : roomWord;
    });
    return `${lang === 'es' ? 'Unidad' : 'Unit'} ${row.unitNumber}: ${parts.join(', ')}`;
  });
  const footer = lang === 'es'
    ? 'Avísame cuando estés de regreso, porfa. ¡Gracias!'
    : 'Let me know when you’re back, please. Thank you!';
  return [header, ...lines, footer].join('\n');
};

// Some crews live on WhatsApp, not iMessage/SMS — a device-local set of crew
// ids flips every Text action for that crew to a wa.me link (same message).
const WHATSAPP_KEY = 'turn-os:crew-whatsapp';

export const readWhatsappCrews = (): ReadonlySet<string> => {
  try {
    const raw = window.localStorage.getItem(WHATSAPP_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

export const toggleWhatsappCrew = (crewId: string): ReadonlySet<string> => {
  const next = new Set(readWhatsappCrews());
  if (next.has(crewId)) next.delete(crewId);
  else next.add(crewId);
  try {
    window.localStorage.setItem(WHATSAPP_KEY, JSON.stringify([...next]));
  } catch {
    // Device storage unavailable — the toggle just won't stick.
  }
  return next;
};

// wa.me wants the full number, digits only; bare 10-digit US numbers get the
// country code added.
export const crewMessageHref = (
  phone: string,
  whatsapp: boolean,
  body?: string,
): string => {
  if (!whatsapp) {
    return body ? `sms:${phone}&body=${encodeURIComponent(body)}` : `sms:${phone}`;
  }
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  return `https://wa.me/${digits}${body ? `?text=${encodeURIComponent(body)}` : ''}`;
};
