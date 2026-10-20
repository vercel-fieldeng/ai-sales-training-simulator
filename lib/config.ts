import 'server-only';

/** Handoff timing the browser needs. Safe to send to the client. */
export interface HandoffTiming {
  /** Seconds into a session when we start waiting for a quiet moment. */
  softSeconds: number;
  /** Seconds into a session when we hand off regardless of turn state. */
  hardSeconds: number;
}

export interface ServerConfig {
  realtimeModel: string;
  voice: string;
  inputTranscriptionModel: string;
  summaryModel: string;
  extendedTime: boolean;
  timing: HandoffTiming;
}

/** The subset of config the browser needs. Contains no secrets. */
export type ClientCallConfig = Omit<ServerConfig, 'summaryModel'>;

export function toClientConfig({ summaryModel: _, ...rest }: ServerConfig): ClientCallConfig {
  return rest;
}

function seconds(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number of seconds`);
  }
  return value;
}

export function getServerConfig(): ServerConfig {
  const timing = {
    softSeconds: seconds('HANDOFF_SOFT_SECONDS', 90),
    hardSeconds: seconds('HANDOFF_HARD_SECONDS', 150),
  };
  if (timing.hardSeconds <= timing.softSeconds) {
    throw new Error('HANDOFF_HARD_SECONDS must be greater than HANDOFF_SOFT_SECONDS');
  }

  // Off by default: the extended-time opt-in is an undocumented test feature.
  const extendedTime = process.env.EXTENDED_TIME === 'true';
  // Gateway closes a session ~15s before its function deadline:
  // ~785s by default, ~1785s with the extended-time opt-in.
  const sessionLimitSeconds = extendedTime ? 1785 : 785;
  if (timing.hardSeconds >= sessionLimitSeconds) {
    throw new Error(
      `HANDOFF_HARD_SECONDS (${timing.hardSeconds}) must be below the session limit (~${sessionLimitSeconds}s)`,
    );
  }

  return {
    realtimeModel: process.env.REALTIME_MODEL ?? 'openai/gpt-realtime-2.1',
    voice: process.env.REALTIME_VOICE ?? 'marin',
    inputTranscriptionModel: process.env.INPUT_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe',
    summaryModel: process.env.SUMMARY_MODEL ?? 'google/gemini-3.8-flash',
    extendedTime,
    timing,
  };
}
