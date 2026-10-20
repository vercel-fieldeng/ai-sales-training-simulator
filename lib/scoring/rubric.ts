import { z } from 'zod';

/**
 * ILLUSTRATIVE rubric for the demo. Your training and compliance team should
 * own the real one, especially the compliance gates: CMS requirements are
 * specific and change, so don't treat these definitions as authoritative.
 */
export const GATES = {
  'plan-disclaimer':
    'The agent states they do not offer every plan available in the area, and points the customer to Medicare.gov, 1-800-MEDICARE, or the local State Health Insurance Assistance Program (SHIP) for all options.',
  'no-misleading-claims':
    'The agent makes no false or misleading claims about coverage, costs, networks, or government affiliation, and uses no high-pressure tactics.',
} as const;

export const CRITERIA = {
  discovery:
    "Asked about the customer's situation before recommending anything: current coverage and when it ends, doctors to keep, prescriptions, budget.",
  accuracy:
    'Explained Medicare Advantage and Medigap correctly, including network and cost trade-offs, without overstating either.',
  'objection-handling':
    "Addressed the customer's concerns directly (for example keeping her cardiologist) instead of deflecting or repeating a pitch.",
  'next-steps': 'Agreed a clear, low-pressure next step the customer is comfortable with.',
} as const;

export type GateId = keyof typeof GATES;
export type CriterionId = keyof typeof CRITERIA;

const gateIds = Object.keys(GATES) as [GateId, ...GateId[]];
const criterionIds = Object.keys(CRITERIA) as [CriterionId, ...CriterionId[]];

/** What the grading model must return. Every judgment cites transcript turns. */
export const gradeSchema = z.object({
  gates: z.array(
    z.object({
      id: z.enum(gateIds),
      passed: z.boolean(),
      evidenceTurnIds: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
  criteria: z.array(
    z.object({
      id: z.enum(criterionIds),
      score: z.number().int().min(0).max(4),
      evidenceTurnIds: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
  coachingNotes: z.array(z.string()).max(5),
});

export type Grade = z.infer<typeof gradeSchema>;

export const GRADER_INSTRUCTIONS = `You grade practice calls between a new Medicare sales agent ("Agent") and a simulated prospective customer ("Customer"). Grade only the Agent.

Each transcript line starts with a turn ID in brackets. Cite turn IDs as evidence for every judgment. Only cite IDs that appear in the transcript. If there is no evidence for something, say so and score it accordingly.

The call may span several technical sessions. Session boundaries are invisible to the participants. Do not penalize the Agent for anything at a boundary.

Compliance gates (pass or fail):
${Object.entries(GATES)
  .map(([id, text]) => `- ${id}: ${text}`)
  .join('\n')}

Criteria (score 0-4: 0 = absent, 1 = poor, 2 = partial, 3 = good, 4 = excellent):
${Object.entries(CRITERIA)
  .map(([id, text]) => `- ${id}: ${text}`)
  .join('\n')}

Return every gate and every criterion exactly once, plus up to five short, specific coaching notes for the Agent.`;
