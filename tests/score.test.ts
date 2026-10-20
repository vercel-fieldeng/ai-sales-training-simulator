import { describe, expect, it } from 'vitest';
import type { Turn } from '@/lib/handoff/transcript';
import type { Grade } from '@/lib/scoring/rubric';
import { finalizeGrade } from '@/lib/scoring/score';

const turns: Turn[] = ['t1', 't2', 't3'].map((id, i) => ({
  id,
  speaker: i % 2 ? 'customer' : 'trainee',
  text: `line ${id}`,
  sessionIndex: 0,
  at: i,
}));

const grade = (overrides: Partial<Grade> = {}): Grade => ({
  gates: [
    { id: 'plan-disclaimer', passed: true, evidenceTurnIds: ['t1'], rationale: '' },
    { id: 'no-misleading-claims', passed: true, evidenceTurnIds: ['t3'], rationale: '' },
  ],
  criteria: [
    { id: 'discovery', score: 4, evidenceTurnIds: ['t1'], rationale: '' },
    { id: 'accuracy', score: 2, evidenceTurnIds: ['t3'], rationale: '' },
    { id: 'objection-handling', score: 2, evidenceTurnIds: [], rationale: '' },
    { id: 'next-steps', score: 0, evidenceTurnIds: [], rationale: '' },
  ],
  coachingNotes: [],
  ...overrides,
});

describe('finalizeGrade', () => {
  it('computes the overall score from criteria and passes a clean grade', () => {
    const card = finalizeGrade(grade(), turns);
    expect(card.overall).toBe(50); // (4 + 2 + 2 + 0) / 16
    expect(card.result).toBe('pass');
    expect(card.flags).toEqual([]);
  });

  it('fails the call and withholds a score when a compliance gate fails', () => {
    const g = grade();
    g.gates[0] = { ...g.gates[0], passed: false };
    const card = finalizeGrade(g, turns);
    expect(card.result).toBe('fail');
    expect(card.overall).toBeNull();
  });

  it('strips evidence that is not in the transcript and flags it', () => {
    const g = grade();
    g.criteria[0] = { ...g.criteria[0], evidenceTurnIds: ['t1', 'made-up'] };
    const card = finalizeGrade(g, turns);
    expect(card.criteria[0].evidenceTurnIds).toEqual(['t1']);
    expect(card.result).toBe('needs-review');
    expect(card.flags).toContainEqual({ item: 'discovery', reason: 'Cited turns that are not in the transcript' });
  });

  it('flags a passed gate or a high score with no evidence', () => {
    const g = grade();
    g.gates[0] = { ...g.gates[0], evidenceTurnIds: [] };
    g.criteria[0] = { ...g.criteria[0], evidenceTurnIds: [] };
    const reasons = finalizeGrade(g, turns).flags.map((f) => f.item);
    expect(reasons).toEqual(expect.arrayContaining(['plan-disclaimer', 'discovery']));
  });

  it('flags rubric items the model skipped', () => {
    const card = finalizeGrade(grade({ criteria: grade().criteria.slice(0, 3) }), turns);
    expect(card.flags).toContainEqual({ item: 'next-steps', reason: 'Not graded' });
  });
});
