import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// The intelligence layer, brick one: free words in (Los talking, Joseph's
// texts, corrections mid-walk) -> a reviewed list of concrete intents out.
// Nothing here writes operational state — the client shows every intent for
// confirmation and applies them through the existing adapters.

export const interpretRequestSchema = z.object({
  text: z.string().min(1).max(8_000),
  rosterUnitNumbers: z.array(z.string()).max(1_000).optional(),
  crews: z.array(z.object({
    name: z.string(),
    trade: z.enum(['paint', 'clean']),
  })).max(50).optional(),
  today: z.string().max(40).optional(),
});

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

const intentSchema = z.object({
  kind: z.enum(['release', 'set-task', 'remove-room', 'assign', 'note', 'block', 'unblock']),
  unitNumber: z.string(),
  trade: z.enum(['paint', 'clean']).nullable().optional(),
  sections: z.array(z.enum(['common', 'A', 'B', 'C', 'D', 'E'])).optional(),
  workType: z.enum(['full', 'touch-up', 'cut-in', 'full-cut-in']).nullable().optional(),
  crewName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  summary: z.string(),
  confidence: z.enum(['high', 'low']),
});

export type TurnIntent = z.infer<typeof intentSchema>;

const interpretResultSchema = z.object({
  intents: z.array(intentSchema).max(60),
  uncertainties: z.array(z.string()).max(20),
});

export type InterpretResult = z.infer<typeof interpretResultSchema>;

const JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    intents: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { enum: ['high', 'low'], type: 'string' },
          crewName: { type: ['string', 'null'] },
          kind: {
            enum: ['release', 'set-task', 'remove-room', 'assign', 'note', 'block', 'unblock'],
            type: 'string',
          },
          note: { type: ['string', 'null'] },
          sections: {
            items: { enum: ['common', 'A', 'B', 'C', 'D', 'E'], type: 'string' },
            type: 'array',
          },
          summary: { type: 'string' },
          trade: { enum: ['paint', 'clean', null], type: ['string', 'null'] },
          unitNumber: { type: 'string' },
          workType: { enum: ['full', 'touch-up', 'cut-in', 'full-cut-in', null], type: ['string', 'null'] },
        },
        required: ['kind', 'unitNumber', 'trade', 'sections', 'workType', 'crewName', 'note', 'summary', 'confidence'],
        type: 'object',
      },
      type: 'array',
    },
    uncertainties: { items: { type: 'string' }, type: 'array' },
  },
  required: ['intents', 'uncertainties'],
  type: 'object',
} as const;

const promptFor = (request: InterpretRequest) => `You are the field brain of
Turn OS, the personal app of Los, a PDS student-housing Turn supervisor at
Moon Tower. He talks to you in field shorthand (often dictated, messy) and you
turn his words into concrete INTENTS his app applies after he confirms them.

WORLD MODEL:
- Units are 3-4 digit numbers (505, 1608). Rooms are 'common' plus beds A-E.
- Trades: paint and clean. PAINT is room-grain with a work type per room:
  full (default), touch-up, or cut-in. CLEAN is always the WHOLE unit — clean
  intents get sections [] (meaning all).
- "Staff" means Los may walk a room alone — that is a NOTE, never released work.
- Joseph = property manager who releases work. Crews are assigned per unit+trade.

INTENT KINDS:
- release: new work released (unit + trade + rooms + work types). If a message
  releases rooms with types, emit ONE release intent per unit, put typed rooms
  in sections and note the types in workType only when every room shares one
  type; mixed types -> emit ONE intent per type group for that unit.
- set-task: change the work type on already-released paint rooms.
- remove-room: rooms that should NOT be in the release ("we don't need C and D
  on 1608").
- assign: put a crew on a unit ("give 505 to Rocky"). Use crewName exactly as
  the roster spells it when a close match exists.
- note: anything worth remembering on a unit (staff rooms, "tub needs
  resurface", "color change in B").
- block / unblock: unit or trade is locked out / on hold, or released back.

RULES:
- Only unit numbers from the roster below; anything else goes to uncertainties.
- summary: one short field-language line, e.g. "1608: drop C and D from paint".
- Prefer several precise intents over one vague one. Never invent work types.
- If words are ambiguous, still emit your best intent with confidence "low"
  and explain in uncertainties.

SPOKEN INPUT (this is DICTATED — snap his messy speech to the real values):
- Numbers said as words become digits, in reading order: "fifteen oh five" ->
  1505, "eleven oh six" -> 1106, "five oh five" -> 505, "twelve hundred" ->
  1200, "sixteen-oh-eight" -> 1608, "seventeen-oh-six" -> 1706. If a spoken
  number is close to exactly one roster unit, SNAP to that roster unit (dictation
  drops or adds a digit — "one fifty five" near 1505 in the roster -> 1505) and
  only fall back to an uncertainty when two roster units are equally likely.
- Rooms: "room a"/"the a"/"unit a" -> A; "the common"/"común"/"comn"/"common
  area" -> common. "a and b" -> [A, B]. "all the beds" -> A..E for that unit.
- Work-type words, snap to exactly full | touch-up | cut-in | full-cut-in:
  "cut in"/"cut-in"/"cutting"/"cuttings"/"cuts" -> cut-in;
  "touch up"/"touch-ups"/"touchups"/"TU" -> touch-up;
  "full"/"full paint"/"whole thing"/"paint it out" -> full;
  "full paint and cut in"/"full plus cut-in"/"full and cuts" -> full-cut-in.
- Crew names: snap the spoken name to the closest roster crew of that trade
  ("rocky"/"rockie" -> the roster's Rocky). Dictation garbles names; a first-name
  match is enough. If no crew of that trade is close, uncertainty.
- Fillers to ignore: "uh", "like", "okay so", "put down", "go ahead and".
- RELEASE + ASSIGN in one breath: when Los names rooms to release AND a crew for
  the same unit ("1806 A B need cleaned, Sandra" / "1007 A B C D paint, A B C
  cut-in, give it to Rocky"), emit BOTH a release intent (the rooms + work types)
  AND an assign intent (the crew) for that unit — the RELEASE intent FIRST, then
  the assign. Keep them on the same unit; never split the unit across others.
${request.rosterUnitNumbers?.length ? `\nROSTER UNITS: ${request.rosterUnitNumbers.join(', ')}` : ''}
${request.crews?.length ? `\nCREWS: ${request.crews.map((crew) => `${crew.name} (${crew.trade})`).join(', ')}` : ''}
${request.today ? `\nTODAY: ${request.today}` : ''}

LOS SAID:
${request.text}`;

const anthropicKey = () =>
  process.env.claudeTurnOskey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();

const MODEL_CHEAP = process.env.TURN_OS_INTAKE_MODEL_CHEAP?.trim() || 'claude-haiku-4-5';
const MODEL_STRONG = process.env.TURN_OS_INTAKE_MODEL_STRONG?.trim() || 'claude-sonnet-4-6';

const run = async (request: InterpretRequest, model: string): Promise<InterpretResult> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    max_tokens: 4_096,
    messages: [{ content: [{ text: promptFor(request), type: 'text' }], role: 'user' }],
    model,
    output_config: { format: { schema: JSON_SCHEMA, type: 'json_schema' } },
  });
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new Error('anthropic-empty');
  return interpretResultSchema.parse(JSON.parse(text.text));
};

export const interpretFieldWords = async (
  request: InterpretRequest,
): Promise<InterpretResult> => {
  try {
    return await run(request, MODEL_CHEAP);
  } catch {
    return run(request, MODEL_STRONG);
  }
};
