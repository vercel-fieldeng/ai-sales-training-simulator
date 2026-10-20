import { gateway } from '@ai-sdk/gateway';
import type { Experimental_RealtimeServerEvent as RealtimeServerEvent } from 'ai';
import type { ClientCallConfig } from '@/lib/config';
import type { Scorecard } from '@/lib/scoring/score';
import { buildCarryoverInstructions } from './carryover';
import { PERSONA_INSTRUCTIONS } from './persona';
import { RealtimeSession } from './realtime-session';
import { CallTranscript, type Turn } from './transcript';
import { decideHandoff, isDeadlineClose } from './turn-gate';

const TICK_MS = 250;
const PREPARE_RETRY_MS = 5_000;
const MAX_RECOVERIES = 3;

export type CallPhase =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'preparing' // live, with the next session warming up in the background
  | 'switching'
  | 'ended'
  | 'error';

export type SessionEndReason =
  | 'handoff' // switched at a quiet moment between turns
  | 'forced-handoff' // hit the hard deadline mid-turn
  | 'recovered' // closed unexpectedly (e.g. 1001 at the deadline); replaced
  | 'call-ended'
  | 'discarded'; // a pre-warmed session that was never used

export interface SessionRecord {
  index: number;
  connectedAt?: number;
  endedAt?: number;
  endReason?: SessionEndReason;
}

/** What the browser sends to grading when the call ends. */
export interface GradingPayload {
  callId: string;
  sessions: { index: number; endReason?: SessionEndReason }[];
  turns: readonly Turn[];
}

export interface GradingState {
  status: 'idle' | 'sending' | 'done' | 'error';
  payload?: GradingPayload;
  scorecard?: Scorecard;
  durationMs?: number;
  error?: string;
}

export interface CallSnapshot {
  phase: CallPhase;
  activeIndex: number | null;
  activeAgeSeconds: number;
  nextReady: boolean;
  sessions: readonly SessionRecord[];
  turns: readonly Turn[];
  summary: string;
  grading: GradingState;
  error?: string;
}

interface LiveSession {
  index: number;
  session: RealtimeSession;
  connectedAt: number;
  /** Transcript length when this session's instructions were last written. */
  carryoverAt: number;
}

/**
 * Runs one training call as a chain of realtime sessions.
 *
 * AI Gateway ends every realtime session at a fixed limit (~13 min, or ~30 min
 * with the extended-time opt-in). To make a longer call sound like one call,
 * this controller:
 *
 *  1. watches the active session's age;
 *  2. from the soft threshold, writes a rolling summary and pre-warms the next
 *     session with carryover instructions, microphone off;
 *  3. at the first quiet moment between turns, moves the microphone to the new
 *     session and closes the old one;
 *  4. at the hard threshold, switches mid-turn rather than be cut off;
 *  5. if a session closes unexpectedly anyway (1001 at the deadline), replaces
 *     it immediately from the same carryover.
 *
 * Everything lands in one speaker-labelled transcript.
 */
export class CallController {
  readonly transcript = new CallTranscript();
  readonly callId = crypto.randomUUID();

  private phase: CallPhase = 'idle';
  private error: string | undefined;
  private sessions: SessionRecord[] = [];
  private active: LiveSession | null = null;
  private next: LiveSession | null = null;
  private preparing = false;
  private prepareBlockedUntil = 0;
  private switching = false;
  private handoffRequested = false;
  private recoveries = 0;

  private mic: MediaStream | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  // Turn-state for the active session.
  private traineeSpeaking = false;
  private responseInFlight = false;
  private lastActivityAt = 0;
  private transcriptDeltas = new Map<string, string>();

  // Rolling summary of turns [0, summarizedUpTo).
  private summary = '';
  private summarizedUpTo = 0;

  private grading: GradingState = { status: 'idle' };

  private snapshot: CallSnapshot = this.buildSnapshot();
  private listeners = new Set<() => void>();

  constructor(private readonly config: ClientCallConfig) {
    this.transcript.subscribe(() => this.emit());
  }

  // --- public API -----------------------------------------------------------

  getSnapshot = (): CallSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(): Promise<void> {
    if (this.phase !== 'idle') return;
    this.setPhase('connecting');
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.active = await this.openSession(0, PERSONA_INSTRUCTIONS);
      this.attachMic(this.active);
      this.tick = setInterval(() => this.onTick(), TICK_MS);
      this.setPhase('live');
    } catch (error) {
      this.fail(error);
    }
  }

  /** Demo control: skip the soft threshold and hand off at the next quiet moment. */
  requestHandoff(): void {
    this.handoffRequested = true;
  }

  async end(): Promise<void> {
    // No-op before start (React strict mode runs effect cleanups early) or after end.
    if (this.phase === 'idle' || this.phase === 'ended') return;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    const sessions = [this.active, this.next].filter((s): s is LiveSession => s != null);
    if (this.next) this.markEnded(this.next.index, 'discarded');
    if (this.active) this.markEnded(this.active.index, 'call-ended');
    this.active = null;
    this.next = null;
    await Promise.all(sessions.map((s) => this.closeSession(s)));
    this.mic?.getTracks().forEach((track) => track.stop());
    this.mic = null;
    this.setPhase('ended');
    if (this.transcript.length > 0) void this.submitForGrading();
  }

  /** Send the finished transcript to grading (in production, also persist it). */
  async submitForGrading(): Promise<void> {
    if (this.grading.status === 'sending' || this.grading.status === 'done') return;
    const payload: GradingPayload = {
      callId: this.callId,
      sessions: this.sessions.map(({ index, endReason }) => ({ index, endReason })),
      turns: this.transcript.all(),
    };
    const startedAt = Date.now();
    this.grading = { status: 'sending', payload };
    this.emit();
    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Grading failed: ${response.status}`);
      const scorecard = (await response.json()) as Scorecard;
      this.grading = { status: 'done', payload, scorecard, durationMs: Date.now() - startedAt };
    } catch (error) {
      this.grading = {
        status: 'error',
        payload,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.emit();
  }

  // --- the handoff loop -----------------------------------------------------

  private onTick(): void {
    const active = this.active;
    if (!active || this.switching || (this.phase !== 'live' && this.phase !== 'preparing')) {
      this.emit();
      return;
    }

    const now = Date.now();
    const ageSeconds = (now - active.connectedAt) / 1000;
    const decision = decideHandoff(
      {
        sessionAgeSeconds: this.handoffRequested
          ? Math.max(ageSeconds, this.config.timing.softSeconds)
          : ageSeconds,
        customerSpeaking: this.responseInFlight || active.session.isPlaying,
        traineeSpeaking: this.traineeSpeaking,
        quietForMs: now - this.lastActivityAt,
      },
      this.config.timing,
      this.next != null,
    );

    if (decision.action === 'prepare') void this.prepareNext();
    if (decision.action === 'switch') void this.switchToNext(decision.forced);
    this.emit();
  }

  /** Summarize, then connect the next session with the mic off. */
  private async prepareNext(): Promise<void> {
    if (this.preparing || this.next || Date.now() < this.prepareBlockedUntil) return;
    this.preparing = true;
    this.setPhase('preparing');
    const index = this.sessions.length;
    try {
      await this.updateSummary();
      this.next = await this.openSession(index, this.carryover());
    } catch (error) {
      console.warn('Preparing the next session failed; retrying shortly', error);
      this.markEnded(index, 'discarded');
      this.prepareBlockedUntil = Date.now() + PREPARE_RETRY_MS;
      if (this.phase === 'preparing') this.setPhase('live');
    } finally {
      this.preparing = false;
    }
  }

  /** Move the microphone to the pre-warmed session and retire the old one. */
  private async switchToNext(forced: boolean): Promise<void> {
    const previous = this.active;
    const next = this.next;
    if (!previous || !next || this.switching) return;
    this.switching = true;
    this.setPhase('switching');
    const traineeWasSpeaking = this.traineeSpeaking;

    try {
      // Turns spoken while the next session was warming up aren't in its
      // instructions yet. Refresh them before it hears anything. Gemini Live
      // rejects a second session-update (close 1008), so skip it there.
      const canUpdateInstructions = !this.config.realtimeModel.startsWith('google/');
      if (canUpdateInstructions && this.transcript.length > next.carryoverAt) {
        try {
          await next.session.sendEvent({
            type: 'session-update',
            config: { instructions: this.carryover() },
          });
          next.carryoverAt = this.transcript.length;
        } catch (error) {
          // Not fatal: the summary still covers the call up to the pre-warm.
          console.warn('Could not refresh carryover instructions', error);
        }
      }

      if (forced) {
        previous.session.cancelResponse();
        previous.session.stopPlayback();
      }
      previous.session.stopAudioCapture();
      this.attachMic(next);

      this.active = next;
      this.next = null;
      this.resetTurnState();
      this.handoffRequested = false;
      this.recoveries = 0;
      this.markEnded(previous.index, forced ? 'forced-handoff' : 'handoff');

      // If we cut the customer off mid-reply, let her pick the thread back up.
      if (forced && !traineeWasSpeaking) next.session.requestResponse();
    } catch (error) {
      this.fail(error);
      return;
    } finally {
      this.switching = false;
    }

    this.setPhase('live');
    await this.closeSession(previous);
  }

  /**
   * The active session closed before we handed off, most likely 1001 at the
   * function deadline. Replace it at once so the call continues.
   */
  private async recover(failed: LiveSession, error: Error): Promise<void> {
    if (this.active !== failed) return;
    if (this.recoveries >= MAX_RECOVERIES) return this.fail(error);
    this.recoveries++;
    console.warn(
      isDeadlineClose(error) ? 'Session hit the gateway deadline; recovering' : 'Session closed; recovering',
      error,
    );
    this.markEnded(failed.index, 'recovered');
    this.active = null;
    void this.closeSession(failed);

    try {
      if (this.next) {
        // Already warm: promote it.
        const next = this.next;
        this.next = null;
        this.active = next;
      } else {
        this.setPhase('switching');
        this.active = await this.openSession(this.sessions.length, this.carryover());
      }
      this.attachMic(this.active);
      this.resetTurnState();
      this.setPhase('live');
    } catch (recoveryError) {
      this.fail(recoveryError);
    }
  }

  // --- sessions -------------------------------------------------------------

  private async openSession(index: number, instructions: string): Promise<LiveSession> {
    this.sessions = [...this.sessions, { index }];
    this.emit();

    let live: LiveSession | undefined;
    const session = new RealtimeSession({
      model: gateway.experimental_realtime(this.config.realtimeModel),
      // Fresh client secret per session; see app/api/realtime/token.
      api: { token: '/api/realtime/token' },
      sessionConfig: {
        instructions,
        voice: this.config.voice, // same voice every session, so the handoff is inaudible
        turnDetection: { type: 'server-vad' },
        inputAudioTranscription: { model: this.config.inputTranscriptionModel },
      },
      onEvent: (event) => this.onEvent(index, event),
      onError: (error) => {
        if (live && this.active === live) void this.recover(live, error);
        else if (live && this.next === live) {
          this.next = null;
          this.markEnded(index, 'discarded');
          void this.closeSession(live);
        }
      },
    });

    await session.connect();
    await session.waitForConnected();
    const connectedAt = Date.now();
    this.sessions = this.sessions.map((s) => (s.index === index ? { ...s, connectedAt } : s));
    live = { index, session, connectedAt, carryoverAt: this.transcript.length };
    return live;
  }

  private attachMic(live: LiveSession): void {
    if (!this.mic) throw new Error('Microphone is not available');
    // The SDK stops the tracks of a stream it captured when capture stops.
    // Give each session its own clone so retiring one never kills the mic.
    live.session.startAudioCapture(this.mic.clone());
  }

  private async closeSession(live: LiveSession): Promise<void> {
    try {
      await live.session.close();
    } catch {
      live.session.disconnect();
    } finally {
      live.session.dispose();
    }
  }

  // --- events ---------------------------------------------------------------

  private onEvent(index: number, event: RealtimeServerEvent): void {
    // Transcripts are kept from any session, including one that is finishing
    // its last reply after a handoff. Turn-state only tracks the active one.
    const isActive = this.active?.index === index;
    const now = Date.now();

    switch (event.type) {
      case 'speech-started':
        if (isActive) {
          this.traineeSpeaking = true;
          this.lastActivityAt = now;
        }
        break;
      case 'speech-stopped':
        if (isActive) {
          this.traineeSpeaking = false;
          this.lastActivityAt = now;
        }
        break;
      case 'response-created':
        if (isActive) {
          this.responseInFlight = true;
          this.lastActivityAt = now;
        }
        break;
      case 'response-done':
        if (isActive) {
          this.responseInFlight = false;
          this.lastActivityAt = now;
        }
        break;
      case 'audio-delta':
        if (isActive) this.lastActivityAt = now;
        break;
      case 'input-transcription-completed':
        this.transcript.add({
          id: `trainee-${index}-${event.itemId}`,
          speaker: 'trainee',
          text: event.transcript,
          sessionIndex: index,
          at: now,
        });
        break;
      case 'audio-transcript-delta': {
        const key = `${index}-${event.itemId}`;
        this.transcriptDeltas.set(key, (this.transcriptDeltas.get(key) ?? '') + event.delta);
        break;
      }
      case 'audio-transcript-done': {
        const key = `${index}-${event.itemId}`;
        this.transcript.add({
          id: `customer-${key}`,
          speaker: 'customer',
          text: event.transcript ?? this.transcriptDeltas.get(key) ?? '',
          sessionIndex: index,
          at: now,
        });
        this.transcriptDeltas.delete(key);
        break;
      }
    }
  }

  // --- carryover ------------------------------------------------------------

  /** Fold turns since the last summary into the rolling summary. */
  private async updateSummary(): Promise<void> {
    const turns = this.transcript.since(this.summarizedUpTo);
    if (turns.length === 0) return;
    const upTo = this.transcript.length;
    const response = await fetch('/api/handoff/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previousSummary: this.summary, turns }),
    });
    if (!response.ok) throw new Error(`Summary request failed: ${response.status}`);
    const { summary } = (await response.json()) as { summary: string };
    this.summary = summary;
    this.summarizedUpTo = upTo;
  }

  private carryover(): string {
    return buildCarryoverInstructions({
      persona: PERSONA_INSTRUCTIONS,
      summary: this.summary,
      turns: this.transcript.all(),
    });
  }

  // --- state ----------------------------------------------------------------

  private resetTurnState(): void {
    this.traineeSpeaking = false;
    this.responseInFlight = false;
    this.lastActivityAt = Date.now();
  }

  private markEnded(index: number, endReason: SessionEndReason): void {
    this.sessions = this.sessions.map((s) =>
      s.index === index && s.endReason == null ? { ...s, endedAt: Date.now(), endReason } : s,
    );
    this.emit();
  }

  private setPhase(phase: CallPhase): void {
    this.phase = phase;
    this.emit();
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.setPhase('error');
    void this.end().then(() => this.setPhase('error'));
  }

  private buildSnapshot(): CallSnapshot {
    return {
      phase: this.phase,
      activeIndex: this.active?.index ?? null,
      activeAgeSeconds: this.active ? (Date.now() - this.active.connectedAt) / 1000 : 0,
      nextReady: this.next != null,
      sessions: this.sessions,
      turns: this.transcript.all(),
      summary: this.summary,
      grading: this.grading,
      error: this.error,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }
}
