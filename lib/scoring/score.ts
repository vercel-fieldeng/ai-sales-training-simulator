import type { Turn } from '@/lib/handoff/transcript';
import { CRITERIA, GATES, type CriterionId, type GateId, type Grade } from './rubric';

export interface Flag {
  item: GateId | CriterionId;
  reason: string;
}

export interface Scorecard extends Grade {
  /** 0-100 from the criteria, or null when a compliance gate failed. */
  overall: number | null;
  result: 'pass' | 'fail' | 'needs-review';
  /** Things a human should check before the score is trusted. */
  flags: Flag[];
}

/**
 * Check the model's grade against the transcript and compute the result.
 *
 * The overall score is computed here, not by the model, and any judgment
 * without real evidence is flagged for review instead of trusted.
 */
export function finalizeGrade(grade: Grade, turns: readonly Turn[]): Scorecard {
  const known = new Set(turns.map((turn) => turn.id));
  const flags: Flag[] = [];

  const clean = <T extends { evidenceTurnIds: string[] }>(item: T, id: GateId | CriterionId): T => {
    const valid = item.evidenceTurnIds.filter((turnId) => known.has(turnId));
    if (valid.length < item.evidenceTurnIds.length) {
      flags.push({ item: id, reason: 'Cited turns that are not in the transcript' });
    }
    return { ...item, evidenceTurnIds: valid };
  };

  const gates = grade.gates.map((gate) => {
    const cleaned = clean(gate, gate.id);
    if (cleaned.passed && cleaned.evidenceTurnIds.length === 0) {
      flags.push({ item: gate.id, reason: 'Marked passed with no supporting evidence' });
    }
    return cleaned;
  });

  const criteria = grade.criteria.map((criterion) => {
    const cleaned = clean(criterion, criterion.id);
    if (cleaned.score >= 3 && cleaned.evidenceTurnIds.length === 0) {
      flags.push({ item: criterion.id, reason: 'High score with no supporting evidence' });
    }
    return cleaned;
  });

  for (const id of Object.keys(GATES) as GateId[]) {
    if (!gates.some((gate) => gate.id === id)) flags.push({ item: id, reason: 'Not graded' });
  }
  for (const id of Object.keys(CRITERIA) as CriterionId[]) {
    if (!criteria.some((criterion) => criterion.id === id)) flags.push({ item: id, reason: 'Not graded' });
  }

  const gateFailed = gates.some((gate) => !gate.passed);
  const overall =
    gateFailed || criteria.length === 0
      ? null
      : Math.round((criteria.reduce((sum, c) => sum + c.score, 0) / (criteria.length * 4)) * 100);

  return {
    ...grade,
    gates,
    criteria,
    overall,
    result: gateFailed ? 'fail' : flags.length > 0 ? 'needs-review' : 'pass',
    flags,
  };
}
