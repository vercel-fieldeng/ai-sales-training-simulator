import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  type Experimental_RealtimeSessionOptions as RealtimeSessionOptions,
  type Experimental_RealtimeState as RealtimeState,
} from 'ai';

/**
 * A single realtime session outside React.
 *
 * `useRealtime` gives one session per hook. A handoff needs two at once (the
 * live one and the pre-warmed next one), so the controller owns sessions
 * directly through the AI SDK's session base class.
 */
export class RealtimeSession extends AbstractRealtimeSession {
  private listeners = new Set<() => void>();

  constructor(options: RealtimeSessionOptions) {
    super(options);
    this.state = {
      status: 'disconnected',
      messages: [],
      events: [],
      isCapturing: false,
      isPlaying: false,
    };
  }

  protected setState<K extends keyof RealtimeState>(key: K, value: RealtimeState[K]): void {
    this.state = { ...this.state, [key]: value };
    this.listeners.forEach((listener) => listener());
  }

  get status(): RealtimeState['status'] {
    return this.state.status;
  }

  get isPlaying(): boolean {
    return this.state.isPlaying;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolve once the session is connected, or reject if it fails first. */
  waitForConnected(timeoutMs = 30_000): Promise<void> {
    if (this.status === 'connected') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('Realtime session did not connect in time'));
      }, timeoutMs);
      const unsubscribe = this.subscribe(() => {
        if (this.status === 'connected') {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        } else if (this.status === 'error' || this.status === 'disconnected') {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error(`Realtime session ${this.status} before connecting`));
        }
      });
    });
  }
}
