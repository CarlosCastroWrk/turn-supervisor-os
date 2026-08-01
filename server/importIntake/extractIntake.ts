import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';

// TurnBoard/message extraction: reads a photo of the paper TurnBoard or a
// release message and proposes structured rows. Nothing here writes
// operational state — the client always routes results through the existing
// human review + confirm flows.

export const intakeRequestSchema = z.object({
  kind: z.enum(['roster', 'release']),
  source: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('image'),
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      data: z.string().min(16).max(8_000_000),
    }),
    z.object({
      type: z.literal('text'),
      text: z.string().min(1).max(20_000),
    }),
  ]),
  rosterUnitNumbers: z.array(z.string()).max(1_000).optional(),
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;

const intakeRowSchema = z.object({
  unitNumber: z.string(),
  bedCount: z.number().int().min(0).max(5).nullable().optional(),
  building: z.string().nullable().optional(),
  trades: z.array(z.enum(['paint', 'clean'])).min(1),
  sections: z.array(z.enum(['common', 'A', 'B', 'C', 'D', 'E'])),
  confidence: z.enum(['high', 'low']),
  note: z.string().nullable().optional(),
});

const intakeResultSchema = z.object({
  rows: z.array(intakeRowSchema).max(600),
  uncertainties: z.array(z.string()).max(80),
});

export interface IntakeResponse {
  rows: z.infer<typeof intakeRowSchema>[];
  uncertainties: string[];
  provider: string;
  model: string;
  escalated: boolean;
}

const JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    rows: {
      items: {
        additionalProperties: false,
        properties: {
          bedCount: { type: ['integer', 'null'] },
          building: { type: ['string', 'null'] },
          confidence: { enum: ['high', 'low'], type: 'string' },
          note: { type: ['string', 'null'] },
          sections: {
            items: { enum: ['common', 'A', 'B', 'C', 'D', 'E'], type: 'string' },
            type: 'array',
          },
          trades: {
            items: { enum: ['paint', 'clean'], type: 'string' },
            type: 'array',
          },
          unitNumber: { type: 'string' },
        },
        required: ['unitNumber', 'bedCount', 'building', 'note', 'trades', 'sections', 'confidence'],
        type: 'object',
      },
      type: 'array',
    },
    uncertainties: { items: { type: 'string' }, type: 'array' },
  },
  required: ['rows', 'uncertainties'],
  type: 'object',
} as const;

const promptFor = (request: IntakeRequest) => {
  const shared = `You read PDS student-housing TurnBoard sheets for a supervisor named Los.
Sheet layout (one band per trade, titled Painting or Cleaning; ignore Carpet):
columns are Bldg | Unit Type | Unit # | Town-home | Comn | A | B | C | D | E | F
| crew name | PDS Approved. Some sheets omit Town-home or F.
Unit Type is the BED COUNT: "S" means STUDIO (bedCount 0, common area only);
otherwise 2, 3, 4, or 5. Studios usually also carry an "S" mark in the
Town-home column — that mark confirms Studio, it is not a released section.
A blacked-out section cell means that room is not part of this unit's scope —
occupied or nonexistent — and is never worked, released, or counted. A 3-bed
unit has Comn+A+B+C with D/E/F blacked; a 2-bed has C/D/E/F blacked.
STUDIO RULE: Unit Type "S", or ALL letter cells blacked, means STUDIO —
bedCount 0, common area only. NEVER invent beds for a studio; a blacked cell
is never a bed. The F column is NOT tracked by the app: never output F as a
section. If any units show a white (in-scope) F cell, add AT MOST ONE summary
uncertainty ("N units show an F room not tracked") — never one note per unit.
The Bldg column sometimes has typos
(e.g. 0 instead of 5) — building is informational only; trust the Unit #.
bedCount is REQUIRED on every row: read the Unit Type column, then verify it
against the blackout pattern (bedCount = number of white letter cells among
A-E). If the two disagree or are unreadable, output your best value
with confidence "low" and add an uncertainty naming the unit.
Marks inside white cells: a single slash = the property released that section;
an X = Los already passed it; a written crew name = assigned.
Data hygiene: a row of zeros or blanks is a spreadsheet artifact — skip it.
If the same unit number appears twice, report it once and add an uncertainty
naming it. If a cell or margin notes no access, occupied, locked, or similar,
do not treat that section as released — add an uncertainty naming the unit
and the note. Report only what is visibly present; never invent units.`;
  if (request.kind === 'roster') {
    return `${shared}

TASK: Extract the property ROSTER — every real unit row: unitNumber, bedCount
from the Unit Type column, building from the Bldg column (as the number shown,
e.g. "15"). trades: ["paint","clean"]. sections: leave empty (the app derives
them from bedCount). Skip artifact rows.`;
  }
  const rosterHint = request.rosterUnitNumbers?.length
    ? `\nKnown roster unit numbers (anything not in this list is an uncertainty): ${request.rosterUnitNumbers.join(', ')}`
    : '';
  return `${shared}

TASK: Extract TODAY'S RELEASED work only — units whose white cells show
release slashes, or units the message says are released today. For each unit
report which trades were released and which sections (empty sections array
means "all applicable"). Exclude sections with access/occupied notes and
explain in uncertainties. Do not include units with no release marks.${rosterHint}`;
};

const anthropicKey = () =>
  process.env.claudeTurnOskey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
const openAiKey = () =>
  process.env.openAiturnOsKey?.trim() || process.env.OPENAI_API_KEY?.trim();
const openRouterKey = () =>
  process.env.OPenrouterTurnOsKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();

// Cost-first, model-agnostic routing: Haiku reads the board; Sonnet only
// re-reads when Haiku is unsure or returns an invalid shape. OpenRouter
// (open-source models over an OpenAI-compatible API) is the first
// cross-provider backup, OpenAI the last.
const ANTHROPIC_CHEAP = process.env.TURN_OS_INTAKE_MODEL_CHEAP?.trim() || 'claude-haiku-4-5';
const ANTHROPIC_STRONG = process.env.TURN_OS_INTAKE_MODEL_STRONG?.trim() || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.TURN_OS_INTAKE_MODEL_OPENAI?.trim() || 'gpt-4o-mini';
const OPENROUTER_MODEL = process.env.TURN_OS_INTAKE_MODEL_OPENROUTER?.trim()
  || 'qwen/qwen2.5-vl-72b-instruct';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const runAnthropic = async (
  request: IntakeRequest,
  model: string,
): Promise<z.infer<typeof intakeResultSchema>> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const content: Anthropic.ContentBlockParam[] = request.source.type === 'image'
    ? [
        {
          source: {
            data: request.source.data,
            media_type: request.source.mediaType,
            type: 'base64',
          },
          type: 'image',
        },
        { text: promptFor(request), type: 'text' },
      ]
    : [{ text: `${promptFor(request)}\n\nSOURCE MESSAGE:\n${request.source.text}`, type: 'text' }];
  const response = await client.messages.create({
    max_tokens: 8_192,
    messages: [{ content, role: 'user' }],
    model,
    output_config: { format: { schema: JSON_SCHEMA, type: 'json_schema' } },
  });
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new Error('anthropic-empty');
  return intakeResultSchema.parse(JSON.parse(text.text));
};

// Runs any OpenAI-compatible provider (OpenAI itself, OpenRouter, or a
// future self-hosted endpoint) — the model-agnostic leg of the gateway.
const runOpenAiCompatible = async (
  request: IntakeRequest,
  provider: { apiKey?: string; baseURL?: string; model: string; name: string },
): Promise<z.infer<typeof intakeResultSchema>> => {
  if (!provider.apiKey) throw new Error(`${provider.name}-key-missing`);
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = request.source.type === 'image'
    ? [
        { text: promptFor(request), type: 'text' },
        {
          image_url: { url: `data:${request.source.mediaType};base64,${request.source.data}` },
          type: 'image_url',
        },
      ]
    : [{ text: `${promptFor(request)}\n\nSOURCE MESSAGE:\n${request.source.text}`, type: 'text' }];
  const completion = await client.chat.completions.create({
    messages: [
      { content: 'Return only JSON matching the requested schema.', role: 'system' },
      { content: userContent, role: 'user' },
    ],
    model: provider.model,
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error(`${provider.name}-empty`);
  return intakeResultSchema.parse(JSON.parse(raw));
};

const needsEscalation = (
  request: IntakeRequest,
  result: z.infer<typeof intakeResultSchema>,
) => {
  if (result.rows.length === 0) return true;
  const lowConfidence = result.rows.filter((row) => row.confidence === 'low').length;
  if (lowConfidence > result.rows.length / 2) return true;
  if (request.kind === 'roster') {
    const missingBeds = result.rows.filter((row) =>
      row.bedCount === null || row.bedCount === undefined).length;
    return missingBeds > result.rows.length / 3;
  }
  return false;
};

export const extractIntake = async (
  request: IntakeRequest,
): Promise<IntakeResponse> => {
  const attempts: { error: unknown; provider: string }[] = [];
  if (anthropicKey()) {
    try {
      const cheap = await runAnthropic(request, ANTHROPIC_CHEAP);
      if (!needsEscalation(request, cheap)) {
        return { ...cheap, escalated: false, model: ANTHROPIC_CHEAP, provider: 'anthropic' };
      }
      try {
        const strong = await runAnthropic(request, ANTHROPIC_STRONG);
        return { ...strong, escalated: true, model: ANTHROPIC_STRONG, provider: 'anthropic' };
      } catch (error) {
        attempts.push({ error, provider: 'anthropic-strong' });
        return { ...cheap, escalated: false, model: ANTHROPIC_CHEAP, provider: 'anthropic' };
      }
    } catch (error) {
      attempts.push({ error, provider: 'anthropic' });
    }
  }
  const compatibleProviders = [
    {
      apiKey: openRouterKey(),
      baseURL: OPENROUTER_BASE_URL,
      model: OPENROUTER_MODEL,
      name: 'openrouter',
    },
    { apiKey: openAiKey(), model: OPENAI_MODEL, name: 'openai' },
  ];
  for (const provider of compatibleProviders) {
    if (!provider.apiKey) continue;
    try {
      const fallback = await runOpenAiCompatible(request, provider);
      return {
        ...fallback,
        escalated: attempts.length > 0,
        model: provider.model,
        provider: provider.name,
      };
    } catch (error) {
      attempts.push({ error, provider: provider.name });
    }
  }
  const detail = attempts
    .map((attempt) => `${attempt.provider}: ${attempt.error instanceof Error ? attempt.error.message : 'failed'}`)
    .join('; ');
  throw new Error(detail || 'No intake provider key is configured.');
};
