import { describe, expect, it } from 'vitest';
import { buildCarryoverInstructions } from '@/lib/handoff/carryover';
import { CONTINUATION_RULES } from '@/lib/handoff/persona';
import { CallTranscript, type Turn } from '@/lib/handoff/transcript';

const turn = (i: number, speaker: Turn['speaker'] = i % 2 ? 'customer' : 'trainee'): Turn => ({
  id: `t${i}`,
  speaker,
  text: `line ${i}`,
  sessionIndex: 0,
  at: i,
});

describe('buildCarryoverInstructions', () => {
  it('keeps the persona and adds continuation rules', () => {
    const out = buildCarryoverInstructions({ persona: 'PERSONA', summary: '', turns: [] });
    expect(out.startsWith('PERSONA')).toBe(true);
    expect(out).toContain(CONTINUATION_RULES);
  });

  it('includes the summary and only the most recent turns verbatim', () => {
    const turns = Array.from({ length: 12 }, (_, i) => turn(i));
    const out = buildCarryoverInstructions({ persona: 'P', summary: '- asked about Medigap', turns, tailTurns: 3 });
    expect(out).toContain('- asked about Medigap');
    expect(out).toContain('line 11');
    expect(out).toContain('line 9');
    expect(out).not.toContain('line 8');
  });

  it('labels speakers from the customer persona point of view', () => {
    const out = buildCarryoverInstructions({ persona: 'P', summary: '', turns: [turn(0, 'trainee'), turn(1, 'customer')] });
    expect(out).toContain('Agent: line 0');
    expect(out).toContain('Margaret: line 1');
  });
});

describe('CallTranscript', () => {
  it('keeps one transcript across sessions and ignores duplicates and blanks', () => {
    const transcript = new CallTranscript();
    transcript.add({ id: 'a', speaker: 'trainee', text: 'hello', sessionIndex: 0, at: 1 });
    transcript.add({ id: 'a', speaker: 'trainee', text: 'hello', sessionIndex: 0, at: 1 });
    transcript.add({ id: 'b', speaker: 'customer', text: '   ', sessionIndex: 0, at: 2 });
    transcript.add({ id: 'c', speaker: 'customer', text: 'hi there', sessionIndex: 1, at: 3 });
    expect(transcript.all().map((t) => t.id)).toEqual(['a', 'c']);
    expect(transcript.since(1).map((t) => t.sessionIndex)).toEqual([1]);
  });
});
