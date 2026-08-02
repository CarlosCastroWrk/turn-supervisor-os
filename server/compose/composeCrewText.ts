import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Drafts a short SMS from Los (Turn supervisor) to a crew lead. Text is a
// DRAFT only — it opens in the phone's Messages composer and nothing sends
// until Los taps send there. No operational writes happen on this path.

export const composeRequestSchema = z.object({
  crewName: z.string().min(1).max(80),
  trade: z.enum(['paint', 'clean']),
  language: z.enum(['english', 'spanish']).default('spanish'),
  isRunner: z.boolean().optional(),
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
  const commonWord = request.language === 'spanish' ? 'Común' : 'Common';
  const unitLines = request.units.length > 0
    ? request.units
        .map((unit) => `- ${unit.unitNumber} — ${(unit.sections.length > 0 ? unit.sections : ['whole unit'])
          .map((section) => (section === 'common' ? commonWord : section)).join(' — ')}`)
        .join('\n')
    : '(no units assigned yet — say the list is coming soon)';
  return `You draft ONE short SMS text message from Los, the Turn supervisor at a student-housing property, to ${request.crewName}, the lead of a ${request.trade} crew.

Rules:
- Write ONLY in ${request.language === 'spanish' ? 'Spanish' : 'English'}. Do not mix languages or translate.
- Tone: calm, plain, respectful — how a steady supervisor texts someone he works with every day. No hype, no pep talk, no exclamation stacking, no emoji.
- List today's units one per line, exactly in this shape: "1706 — ${commonWord} — A — C". Letters A–E are bedrooms; "${commonWord}" is the common area.
- Ask them to text Los as each unit is finished.
${request.trade === 'clean' ? '- One short line on the standard: shower heads clean, no hair, corners, floors not sticky, sinks wiped dry.' : '- One short line: holes bigger than a quarter and tubs are change orders — tell Los first, do not fix or skip.'}
${request.isRunner ? '- This lead is also Los\'s runner: add one short line asking him to keep an eye on the overall day and flag anything Los should see.' : ''}
${request.instruction ? `- Los also wants this said (rephrase naturally): ${request.instruction}` : ''}
- Under 450 characters total. Plain text only — no markdown, no headings, no quotes around the message.

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
