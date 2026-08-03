// One shared shape for every "here are your units" crew text, in the format
// Los dictated: one row per unit — "Unit 1307: common area, A (touch-up), B, C"
// — a short generic opener, and a closer that keeps the standing rule of
// "text me as each unit is finished". Single language per send (no mixing);
// the last language used sticks on this device.

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
  readonly workType?: 'full' | 'touch-up' | 'cut-in';
}

export interface CrewTextRow {
  readonly unitNumber: string;
  readonly sections: readonly CrewTextSection[];
}

const sectionText = (section: CrewTextSection, lang: CrewTextLang): string => {
  const base = section.kind === 'common'
    ? lang === 'es' ? 'área común' : 'common area'
    : section.bed ?? '';
  const note = section.workType === 'touch-up'
    ? lang === 'es' ? 'retoques' : 'touch-up'
    : section.workType === 'cut-in'
      ? lang === 'es' ? 'cortes' : 'cut-in'
      : '';
  return note ? `${base} (${note})` : base;
};

export const crewUnitsTextBody = (
  crewName: string,
  lang: CrewTextLang,
  rows: readonly CrewTextRow[],
): string => {
  const header = lang === 'es'
    ? `¡Hola ${crewName}! Estas son sus unidades:`
    : `Hi ${crewName}! These are your units:`;
  const lines = [...rows]
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }))
    .map((row) => {
      const ordered = [...row.sections].sort((left, right) =>
        left.kind === right.kind
          ? (left.bed ?? '').localeCompare(right.bed ?? '')
          : left.kind === 'common' ? -1 : 1);
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const section of ordered) {
        const text = sectionText(section, lang);
        if (seen.has(text)) continue;
        seen.add(text);
        parts.push(text);
      }
      return `${lang === 'es' ? 'Unidad' : 'Unit'} ${row.unitNumber}: ${parts.join(', ')}`;
    });
  const footer = lang === 'es'
    ? 'Me avisa cuando terminen cada unidad. Cualquier pregunta me dice — ¡gracias por su ayuda!'
    : 'Text me as you finish each unit. Let me know if you have any questions — thank you for your help!';
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
