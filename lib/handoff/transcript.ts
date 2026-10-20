export type Speaker = 'trainee' | 'customer';

export interface Turn {
  id: string;
  speaker: Speaker;
  text: string;
  /** Which realtime session produced this turn (0-based). */
  sessionIndex: number;
  /** Epoch ms when the turn was recorded. */
  at: number;
}

/**
 * One transcript for the whole call, across every realtime session.
 *
 * Speaker labels come from the session itself: the trainee's speech arrives as
 * input transcription events, the AI customer's as output transcript events.
 */
export class CallTranscript {
  private turns: Turn[] = [];
  private listeners = new Set<() => void>();

  add(turn: Omit<Turn, 'id'> & { id?: string }): void {
    const text = turn.text.trim();
    if (text === '') return;
    const id = turn.id ?? `${turn.sessionIndex}-${this.turns.length}`;
    if (this.turns.some((existing) => existing.id === id)) return;
    this.turns = [...this.turns, { ...turn, id, text }];
    this.listeners.forEach((listener) => listener());
  }

  all(): readonly Turn[] {
    return this.turns;
  }

  since(index: number): readonly Turn[] {
    return this.turns.slice(index);
  }

  get length(): number {
    return this.turns.length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function formatTurns(turns: readonly Turn[]): string {
  return turns
    .map((turn) => `${turn.speaker === 'trainee' ? 'Agent' : 'Margaret'}: ${turn.text}`)
    .join('\n');
}
