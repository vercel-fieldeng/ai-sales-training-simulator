/** Minimum silence before we treat the line as quiet enough to switch. */
export const QUIET_MS = 800;

export interface TurnState {
  /** Seconds since the active session connected. */
  sessionAgeSeconds: number;
  /** The AI has a response in flight or audio still playing. */
  customerSpeaking: boolean;
  /** Server VAD reported speech-started without a matching speech-stopped. */
  traineeSpeaking: boolean;
  /** Ms since the last speech or response activity on the active session. */
  quietForMs: number;
}

export type HandoffDecision =
  | { action: 'wait' }
  | { action: 'prepare' }
  | { action: 'switch'; forced: boolean };

/**
 * Decide what the call should do right now.
 *
 * - Before `softSeconds`: nothing.
 * - From `softSeconds`: prepare the next session in the background, then
 *   switch at the first quiet moment between turns, so nobody is cut off.
 * - At `hardSeconds`: switch even mid-turn. Being cut off by the server
 *   (close 1001 at the function deadline) is worse than a clipped sentence.
 */
export function decideHandoff(
  state: TurnState,
  timing: { softSeconds: number; hardSeconds: number },
  nextSessionReady: boolean,
): HandoffDecision {
  if (state.sessionAgeSeconds < timing.softSeconds) return { action: 'wait' };

  if (state.sessionAgeSeconds >= timing.hardSeconds) {
    return nextSessionReady ? { action: 'switch', forced: true } : { action: 'prepare' };
  }

  if (!nextSessionReady) return { action: 'prepare' };

  const quiet =
    !state.customerSpeaking && !state.traineeSpeaking && state.quietForMs >= QUIET_MS;
  return quiet ? { action: 'switch', forced: false } : { action: 'wait' };
}

/** True when an error is the gateway closing the session at its deadline. */
export function isDeadlineClose(error: Error): boolean {
  return /code 1001/.test(error.message);
}
