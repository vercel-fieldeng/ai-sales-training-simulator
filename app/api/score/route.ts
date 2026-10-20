import { generateText, Output } from 'ai';
import { z } from 'zod';
import { gradeSchema, GRADER_INSTRUCTIONS } from '@/lib/scoring/rubric';
import { finalizeGrade } from '@/lib/scoring/score';

const bodySchema = z.object({
  callId: z.string(),
  sessions: z.array(z.object({ index: z.number(), endReason: z.string().optional() })),
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
    .min(1)
    .max(1_000),
});

export const maxDuration = 60;

/**
 * Grades a finished call. In a production app, this is also where you would
 * persist the transcript and scorecard (for example, to Postgres).
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { turns } = parsed.data;

  const transcript = turns
    .map((turn) => `[${turn.id}] ${turn.speaker === 'trainee' ? 'Agent' : 'Customer'}: ${turn.text}`)
    .join('\n');

  const { output } = await generateText({
    model: process.env.SCORING_MODEL ?? 'anthropic/claude-sonnet-5',
    temperature: 0,
    system: GRADER_INSTRUCTIONS,
    prompt: `Transcript:\n${transcript}`,
    output: Output.object({ schema: gradeSchema, name: 'call_grade' }),
  });

  return Response.json(finalizeGrade(output, turns));
}
