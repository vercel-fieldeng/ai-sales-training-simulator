import { CONTINUATION_RULES } from './persona';
import { formatTurns, type Turn } from './transcript';

/** Recent turns carried over word for word, on top of the summary. */
export const VERBATIM_TAIL_TURNS = 8;

export interface CarryoverInput {
  persona: string;
  /** Rolling summary of everything before the verbatim tail. May be empty. */
  summary: string;
  turns: readonly Turn[];
  tailTurns?: number;
}

/**
 * Instructions for the next realtime session.
 *
 * A new session starts with no memory, so continuity comes entirely from
 * here: the original persona, rules for continuing mid-call, a summary of the
 * older conversation, and the most recent turns verbatim so the model picks up
 * the exact thread (and tone) it was in.
 */
export function buildCarryoverInstructions({
  persona,
  summary,
  turns,
  tailTurns = VERBATIM_TAIL_TURNS,
}: CarryoverInput): string {
  const tail = turns.slice(-tailTurns);
  const sections = [persona, CONTINUATION_RULES];

  if (summary.trim() !== '') {
    sections.push(`Summary of the call so far:\n${summary.trim()}`);
  }
  if (tail.length > 0) {
    sections.push(`Most recent exchanges, word for word:\n${formatTurns(tail)}`);
  }

  return sections.join('\n\n');
}
