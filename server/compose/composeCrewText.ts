import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Drafts a short SMS from Los (Turn supervisor) to a crew lead. Text is a
// DRAFT only — it opens in the phone's Messages composer and nothing sends
// until Los taps send there. No operational writes happen on this path.

export const composeRequestSchema = z.object({
  crewName: z.string().min(1).max(80),
  trade: z.enum(['paint', 'clean']),
  units: z
    .array(
      z.object({
        unitNumber: z.string().min(1).max(12),
        sections: z.array(z.string().max(16)).max(8),
      }),
    )
    .max(40),
  instruction: z.string().max(280).optional(),
});

export type ComposeRequest = z.infer<typeof composeRequestSchema>;

export interface ComposeResult {
  text: string;
  model: string;
}

const COMPOSE_MODEL = process.env.TURN_OS_COMPOSE_MODEL?.trim() || 'claude-sonnet-4-6';

const anthropicKey = () =>
  process.env.claudeTurnOskey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();

const promptFor = (request: ComposeRequest) => {
  const unitLines = request.units.length > 0
    ? request.units
        .map((unit) => `- Unit ${unit.unitNumber}: ${unit.sections.join(', ') || 'whole unit'}`)
        .join('\n')
    : '(no units assigned yet — say you will text the list soon)';
  return `You draft ONE short SMS text message from Los, the Turn supervisor at a student-housing property, to ${request.crewName}, the lead of a ${request.trade} crew.

Rules:
- Bilingual-lite: Spanish first with the short English equivalent where useful. Most crew leads speak Spanish.
- Warm, respectful, encouraging — Los depends on these crews. One brief encouragement, no long speeches, at most one emoji.
- List today's units clearly, one per line, with sections. "common" means the common area — write it as "Común/Common". Letters A–E are bedrooms.
- Ask them to text Los as each unit is finished.
${request.trade === 'clean' ? '- One short reminder of the inspection standard: shower heads with no stains, zero hair, corners, floors not sticky, sinks wiped dry.' : '- One short reminder: holes bigger than a quarter and tubs are change orders — flag them to Los, do not just fix or skip.'}
${request.instruction ? `- Los also wants this said (rephrase naturally): ${request.instruction}` : ''}
- Under 550 characters total. Plain text only — no markdown, no headings, no quotes around the message.

Today's units for ${request.crewName}:
${unitLines}

Reply with the SMS text and nothing else.`;
};

export const composeCrewText = async (
  request: ComposeRequest,
): Promise<ComposeResult> => {
  const key = anthropicKey();
  if (!key) throw new Error('anthropic-key-missing');
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    max_tokens: 500,
    messages: [{ content: promptFor(request), role: 'user' }],
    model: COMPOSE_MODEL,
  });
  const block = response.content.find((entry) => entry.type === 'text');
  if (!block || block.type !== 'text' || !block.text.trim()) {
    throw new Error('compose-empty');
  }
  return { model: COMPOSE_MODEL, text: block.text.trim() };
};
