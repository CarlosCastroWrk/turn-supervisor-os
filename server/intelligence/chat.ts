import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// The intelligence layer, brick two: a grounded CHAT turn. The client sends
// the conversation tail plus a compact digest of today's board; the model
// answers with terse facts in field language. It can only TALK — every write
// still goes through the interpreter's reviewed intents. Cost posture: cheap
// model first, short answers, the digest is capped by the request schema.

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(4_000),
  })).min(1).max(12),
  digest: z.string().max(16_000).optional(),
  today: z.string().max(40).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ChatResult {
  reply: string;
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
  he asked. Short lines. Plain field language, English (Común is fine).
- Numbers must come FROM THE BOARD DIGEST below or from him. NEVER invent or
  estimate a unit, room, count, crew, or dollar. If the digest doesn't show
  it, say exactly what's missing in one line.
- When he asks "which/where/how many", answer with the list or the number,
  one line per item, unit numbers first.
- You cannot change anything. If he tells you to DO something (release,
  assign, change a task, note, block), reply only: "Say it as a command and
  I'll set it up to confirm — e.g. '1608 drop C, give A B to Sandra'."
- Advice is welcome when he asks for judgment (how to sequence the day, what
  to tell Tony) — still tight, max a few lines.`;

const anthropicKey = () =>
  process.env.claudeTurnOskey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();

const MODEL_CHEAP = process.env.TURN_OS_INTAKE_MODEL_CHEAP?.trim() || 'claude-haiku-4-5';
const MODEL_STRONG = process.env.TURN_OS_INTAKE_MODEL_STRONG?.trim() || 'claude-sonnet-4-6';

const run = async (request: ChatRequest, model: string): Promise<ChatResult> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const grounding = [
    request.today ? `TODAY: ${request.today}` : '',
    request.digest ? `BOARD DIGEST (the only source of truth for numbers):\n${request.digest}` : 'BOARD DIGEST: unavailable this turn — say so if asked for numbers.',
  ].filter(Boolean).join('\n\n');
  // The tail window may start mid-conversation; the API needs user-first.
  const tail = request.messages.slice(
    request.messages.findIndex((message) => message.role === 'user'),
  );
  const response = await client.messages.create({
    max_tokens: 400,
    messages: [
      { content: grounding, role: 'user' as const },
      { content: 'Got the board.', role: 'assistant' as const },
      ...tail.map((message) => ({ content: message.text, role: message.role })),
    ],
    model,
    system: [{
      cache_control: { type: 'ephemeral' },
      text: SYSTEM_PROMPT,
      type: 'text' as const,
    }],
  });
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text' || !text.text.trim()) {
    throw new Error('anthropic-empty');
  }
  return { reply: text.text.trim() };
};

export const chatFieldWords = async (request: ChatRequest): Promise<ChatResult> => {
  try {
    return await run(request, MODEL_CHEAP);
  } catch {
    return run(request, MODEL_STRONG);
  }
};
