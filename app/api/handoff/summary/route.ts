import { generateText } from 'ai';
import { z } from 'zod';
import { getServerConfig } from '@/lib/config';
import { formatTurns } from '@/lib/handoff/transcript';

const bodySchema = z.object({
  previousSummary: z.string().max(20_000).default(''),
  turns: z
    .array(
      z.object({
        id: z.string(),
        speaker: z.enum(['trainee', 'customer']),
        text: z.string().max(5_000),
        sessionIndex: z.number().int().nonnegative(),
        at: z.number(),
      }),
    )
    .max(500),
});

export const maxDuration = 60;

/**
 * Rolling summary for the next session's instructions.
 *
 * Each handoff only summarizes turns since the last summary and folds them
 * into it, so the summary stays bounded no matter how long the call runs.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { previousSummary, turns } = parsed.data;
  if (turns.length === 0) return Response.json({ summary: previousSummary });

  const { text } = await generateText({
    model: getServerConfig().summaryModel,
    system: `You maintain running notes for a phone call between a new Medicare sales agent and a prospective customer named Margaret. The notes are given to the voice model playing Margaret so it can continue the call seamlessly.

Write concise bullet points covering: what Margaret has shared about herself, what the agent has explained or recommended, questions Margaret has asked and whether they were answered, her current concerns and mood, and any commitments or next steps. Keep facts exactly as stated. Do not invent details. Stay under 250 words.`,
    prompt: `${previousSummary ? `Existing notes:\n${previousSummary}\n\n` : ''}New conversation to fold in:\n${formatTurns(turns)}\n\nReturn the updated notes only.`,
  });

  return Response.json({ summary: text.trim() });
}
