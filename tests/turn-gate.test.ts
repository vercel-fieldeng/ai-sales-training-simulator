import { describe, expect, it } from 'vitest';
import { decideHandoff, isDeadlineClose, QUIET_MS } from '@/lib/handoff/turn-gate';

const timing = { softSeconds: 1620, hardSeconds: 1740 };
const quiet = { customerSpeaking: false, traineeSpeaking: false, quietForMs: QUIET_MS };

describe('decideHandoff', () => {
  it('does nothing before the soft threshold', () => {
    expect(decideHandoff({ ...quiet, sessionAgeSeconds: 1000 }, timing, false)).toEqual({ action: 'wait' });
  });

  it('prepares the next session once the soft threshold passes', () => {
    expect(decideHandoff({ ...quiet, sessionAgeSeconds: 1620 }, timing, false)).toEqual({ action: 'prepare' });
  });

  it('switches at a quiet moment once the next session is ready', () => {
    expect(decideHandoff({ ...quiet, sessionAgeSeconds: 1650 }, timing, true)).toEqual({
      action: 'switch',
      forced: false,
    });
  });

  it.each([
    ['the customer is speaking', { customerSpeaking: true }],
    ['the trainee is speaking', { traineeSpeaking: true }],
    ['the line has not been quiet long enough', { quietForMs: QUIET_MS - 1 }],
  ])('waits while %s', (_, override) => {
    expect(decideHandoff({ ...quiet, ...override, sessionAgeSeconds: 1650 }, timing, true)).toEqual({
      action: 'wait',
    });
  });

  it('forces the switch at the hard threshold even mid-turn', () => {
    expect(
      decideHandoff({ ...quiet, customerSpeaking: true, sessionAgeSeconds: 1740 }, timing, true),
    ).toEqual({ action: 'switch', forced: true });
  });

  it('keeps preparing at the hard threshold if the next session is not ready', () => {
    expect(decideHandoff({ ...quiet, sessionAgeSeconds: 1760 }, timing, false)).toEqual({ action: 'prepare' });
  });
});

describe('isDeadlineClose', () => {
  it('recognizes the gateway deadline close', () => {
    const error = new Error(
      'Realtime WebSocket closed unexpectedly (code 1001: WebSocket session approaching function deadline)',
    );
    expect(isDeadlineClose(error)).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isDeadlineClose(new Error('Realtime WebSocket closed unexpectedly (code 1011)'))).toBe(false);
  });
});
