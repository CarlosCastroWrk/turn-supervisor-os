import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { intentSchema, type TurnIntent } from './interpret.js';

// The unified chat turn — ONE model call that can answer AND propose actions
// in the same breath. Los talks naturally ("Tony wants approved for a full
// paint in room C"); the model replies with terse facts and, when his words
// imply operational changes, a list of proposed intents the app shows for
// confirmation. The model only ever PROPOSES — every write happens client-
// side through the existing adapters after Los taps or says yes.

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(4_000),
  })).min(1).max(12),
  digest: z.string().max(16_000).optional(),
  today: z.string().max(40).optional(),
  rosterUnitNumbers: z.array(z.string()).max(1_000).optional(),
  crews: z.array(z.object({
    name: z.string(),
    trade: z.enum(['paint', 'clean']),
  })).max(50).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

const chatResultSchema = z.object({
  intents: z.array(intentSchema).max(60),
  reply: z.string(),
  uncertainties: z.array(z.string()).max(20),
});

export interface ChatResult {
  reply: string;
  intents: TurnIntent[];
  uncertainties: string[];
}

const SYSTEM_PROMPT = `You are Turn OS — the personal field brain of Los
(Carlos), a PDS student-housing Turn supervisor at Moon Tower (~166 units,
Paint + Clean trades, rooms are Común plus beds A–E).

FLOORS: the digits before the last two of a unit number are its floor —
1108 is floor 11, 903 is floor 9, 1200 is floor 12. "Floor 11" means every
unit numbered 11XX. Check the digest carefully before saying a floor is
clear.

STYLE — this is a phone screen in the field, and every token costs money:
- Facts first. No greetings, no filler, no "great question", no recap of what
  he asked. Plain field language, ENGLISH in your answers ("Common", not
  Común — Spanish belongs only inside crew messages he'll forward).
- Numbers must come FROM THE BOARD DIGEST or from him. NEVER invent or
  estimate a unit, room, count, crew, or dollar. If the digest doesn't show
  it, say exactly what's missing in one line.
- One-line answers stay plain. For LIST answers, format like a clean field
  report: a short "## Heading" per group, "- " bullets, bold unit numbers
  like **1002** — the way his ChatGPT lists look. No other markdown.
- When he asks "which/where/how many", answer with the list or the number,
  one bullet per item, unit numbers first.
- When he asks for a crew MESSAGE to forward, write the message body in
  Spanish in his format ("Buenos días, {name}. Estas son tus unidades para
  hoy:" … "{unit} — {Room}: {task}" … keep-me-posted closer) using retoque /
  recorte / completo; everything around it stays English.

ACTIONS — you can PROPOSE operational changes, never perform them. When his
words state or imply changes (even thinking out loud: "Tony wants approved
for a full paint in C"), fill the intents array; the app shows them for his
confirmation. Rules:
- Intent kinds: release (new rooms released: unit + trade + rooms + work
  types), set-task (change a released paint room's type: full | touch-up |
  cut-in | full-cut-in | touch-up-cut-in), remove-room, assign (crewName from
  the roster), note (anything worth remembering on a unit — approvals, change
  orders, textures, color changes), block, unblock.
- PAINT is room-grain with a work type per room; CLEAN intents get sections
  [] (whole unit). Only roster unit numbers; others go in uncertainties.
- One sentence often means SEVERAL intents — "Tony approved full paint in C"
  on a unit under discussion = a note AND a set-task. Emit both.
- Infer the unit from the conversation when he doesn't repeat it; if no unit
  is clear, ask in the reply and emit no intents for it.
- Snap dictation: spoken numbers → roster units; "cut in"/"recorte" →
  cut-in; "retoque" → touch-up; "completo"/"full paint" → full; combos →
  full-cut-in / touch-up-cut-in; crew names to the closest roster crew of
  that trade.
- summary: one short field line, e.g. "1203 C → full paint". Low confidence
  when unsure.
- When intents are present keep reply to ONE short line (a fact or a
  clarifying question) — the app renders the proposals themselves. NEVER say
  you did or changed anything; the app confirms and applies.
- When it's purely a question, answer it and leave intents empty.`;

const anthropicKey = () =>
  process.env.claudeTurnOskey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();

const MODEL_CHEAP = process.env.TURN_OS_INTAKE_MODEL_CHEAP?.trim() || 'claude-haiku-4-5';
const MODEL_STRONG = process.env.TURN_OS_INTAKE_MODEL_STRONG?.trim() || 'claude-sonnet-4-6';

// Structured-outputs schemas only support anyOf unions (a type array or a
// null inside an enum rejects EVERY call — pinned by test, learned Aug 10).
export const UNIFIED_SCHEMA = {
  additionalProperties: false,
  properties: {
    intents: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { enum: ['high', 'low'], type: 'string' },
          crewName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          kind: {
            enum: ['release', 'set-task', 'remove-room', 'assign', 'note', 'block', 'unblock'],
            type: 'string',
          },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          sections: {
            items: { enum: ['common', 'A', 'B', 'C', 'D', 'E'], type: 'string' },
            type: 'array',
          },
          summary: { type: 'string' },
          trade: { anyOf: [{ enum: ['paint', 'clean'], type: 'string' }, { type: 'null' }] },
          unitNumber: { type: 'string' },
          workType: {
            anyOf: [
              { enum: ['full', 'touch-up', 'cut-in', 'full-cut-in', 'touch-up-cut-in'], type: 'string' },
              { type: 'null' },
            ],
          },
        },
        required: ['kind', 'unitNumber', 'trade', 'sections', 'workType', 'crewName', 'note', 'summary', 'confidence'],
        type: 'object',
      },
      type: 'array',
    },
    reply: { type: 'string' },
    uncertainties: { items: { type: 'string' }, type: 'array' },
  },
  required: ['reply', 'intents', 'uncertainties'],
  type: 'object',
} as const;

const groundingFor = (request: ChatRequest) => [
  request.today ? `TODAY: ${request.today}` : '',
  request.rosterUnitNumbers?.length
    ? `ROSTER UNITS: ${request.rosterUnitNumbers.join(', ')}`
    : '',
  request.crews?.length
    ? `CREWS: ${request.crews.map((crew) => `${crew.name} (${crew.trade})`).join(', ')}`
    : '',
  request.digest
    ? `BOARD DIGEST (the only source of truth for numbers):\n${request.digest}`
    : 'BOARD DIGEST: unavailable this turn — say so if asked for numbers.',
].filter(Boolean).join('\n\n');

// The tail window may start mid-conversation; the API needs user-first.
const turnsFor = (request: ChatRequest) => {
  const tail = request.messages.slice(
    request.messages.findIndex((message) => message.role === 'user'),
  );
  return [
    { content: groundingFor(request), role: 'user' as const },
    { content: 'Got the board.', role: 'assistant' as const },
    ...tail.map((message) => ({ content: message.text, role: message.role })),
  ];
};

const parseResult = (raw: string): ChatResult => chatResultSchema.parse(JSON.parse(raw));

const run = async (request: ChatRequest, model: string): Promise<ChatResult> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    max_tokens: 2_048,
    messages: turnsFor(request),
    model,
    output_config: { format: { schema: UNIFIED_SCHEMA, type: 'json_schema' } },
    system: [{
      cache_control: { type: 'ephemeral' },
      text: SYSTEM_PROMPT,
      type: 'text' as const,
    }],
  });
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text' || !text.text.trim()) throw new Error('anthropic-empty');
  return parseResult(text.text);
};

// Plain-JSON fallback — works even if the structured-outputs surface rejects
// the request. Same shape, fences and prose stripped.
const runPlain = async (request: ChatRequest, model: string): Promise<ChatResult> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const turns = turnsFor(request);
  const last = turns[turns.length - 1];
  turns[turns.length - 1] = {
    ...last,
    content: `${last.content}

Respond with ONLY a JSON object, no code fences, no prose, exactly this shape:
{"reply": "...", "intents": [{"kind": "...", "unitNumber": "...", "trade": "paint"|"clean"|null, "sections": [...], "workType": "..."|null, "crewName": "..."|null, "note": "..."|null, "summary": "...", "confidence": "high"|"low"}], "uncertainties": ["..."]}`,
  };
  const response = await client.messages.create({
    max_tokens: 2_048,
    messages: turns,
    model,
    system: [{
      cache_control: { type: 'ephemeral' },
      text: SYSTEM_PROMPT,
      type: 'text' as const,
    }],
  });
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new Error('anthropic-empty');
  const match = text.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('anthropic-no-json');
  return parseResult(match[0]);
};

const describeError = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

export const chatFieldWords = async (request: ChatRequest): Promise<ChatResult> => {
  // Structured first (cheap → strong), then plain-JSON prompting — a field
  // message must never dead-end on one API surface. Each hop logs why.
  try {
    return await run(request, MODEL_CHEAP);
  } catch (error) {
    console.error('chat-structured-cheap-failed', describeError(error));
  }
  try {
    return await run(request, MODEL_STRONG);
  } catch (error) {
    console.error('chat-structured-strong-failed', describeError(error));
  }
  try {
    return await runPlain(request, MODEL_CHEAP);
  } catch (error) {
    console.error('chat-plain-cheap-failed', describeError(error));
  }
  return runPlain(request, MODEL_STRONG);
};
