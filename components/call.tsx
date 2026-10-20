'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ClientCallConfig } from '@/lib/config';
import { CallController, type CallSnapshot, type SessionRecord } from '@/lib/handoff/call-controller';
import { Grading } from './grading';

const PHASE_LABEL: Record<CallSnapshot['phase'], string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  live: 'Live',
  preparing: 'Live, next session warming up',
  switching: 'Handing off',
  ended: 'Call ended',
  error: 'Error',
};

const END_LABEL: Record<NonNullable<SessionRecord['endReason']>, string> = {
  handoff: 'handed off between turns',
  'forced-handoff': 'handed off mid-turn (hard deadline)',
  recovered: 'closed by server, replaced',
  'call-ended': 'call ended',
  discarded: 'pre-warm discarded',
};

export function Call({ config }: { config: ClientCallConfig }) {
  const [controller, setController] = useState(() => new CallController(config));
  const call = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => () => void controller.end(), [controller]);

  const inCall = call.phase !== 'idle' && call.phase !== 'ended' && call.phase !== 'error';
  const { softSeconds, hardSeconds } = config.timing;

  return (
    <div className="call">
      <section className="panel">
        <div className="row">
          <strong>{PHASE_LABEL[call.phase]}</strong>
          <div className="actions">
            {call.phase === 'idle' && <button onClick={() => controller.start()}>Start call</button>}
            {inCall && (
              <>
                <button className="secondary" onClick={() => controller.requestHandoff()}>
                  Hand off at next pause
                </button>
                <button className="danger" onClick={() => controller.end()}>
                  End call
                </button>
              </>
            )}
            {(call.phase === 'ended' || call.phase === 'error') && (
              <>
                <button className="secondary" onClick={() => download(call)}>
                  Download transcript
                </button>
                <button onClick={() => setController(new CallController(config))}>New call</button>
              </>
            )}
          </div>
        </div>

        {call.error && <p className="error">{call.error}</p>}

        <dl className="meta">
          <dt>Model</dt>
          <dd>{config.realtimeModel}</dd>
          <dt>Extended time</dt>
          <dd>{config.extendedTime ? 'on (~30 min sessions)' : 'off (~13 min sessions)'}</dd>
          <dt>Handoff window</dt>
          <dd>
            from {formatSeconds(softSeconds)} at a pause, by {formatSeconds(hardSeconds)} at the latest
          </dd>
          {call.activeIndex != null && (
            <>
              <dt>Active session</dt>
              <dd>
                #{call.activeIndex + 1}, {formatSeconds(call.activeAgeSeconds)} old
                <SessionMeter age={call.activeAgeSeconds} soft={softSeconds} hard={hardSeconds} />
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="panel">
        <h2>Sessions</h2>
        <ol className="sessions">
          {call.sessions.map((session) => (
            <li key={session.index} className={session.index === call.activeIndex ? 'active' : ''}>
              <span>#{session.index + 1}</span>
              <span>
                {session.connectedAt ? new Date(session.connectedAt).toLocaleTimeString() : 'connecting'}
              </span>
              <span>
                {session.endReason
                  ? END_LABEL[session.endReason]
                  : session.index === call.activeIndex
                    ? 'active'
                    : 'warm, waiting for a pause'}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Transcript</h2>
        {call.turns.length === 0 && <p className="muted">Start talking once the call is live.</p>}
        <ul className="transcript">
          {call.turns.map((turn, i) => (
            <li key={turn.id}>
              {i > 0 && call.turns[i - 1].sessionIndex !== turn.sessionIndex && (
                <div className="divider">session #{turn.sessionIndex + 1}</div>
              )}
              <span className={`speaker ${turn.speaker}`}>
                {turn.speaker === 'trainee' ? 'Agent' : 'Margaret'}
              </span>
              {turn.text}
            </li>
          ))}
        </ul>
      </section>

      {call.grading.status !== 'idle' && (
        <Grading grading={call.grading} turns={call.turns} onRetry={() => controller.submitForGrading()} />
      )}

      {call.summary && (
        <section className="panel">
          <h2>Carryover summary</h2>
          <p className="muted">What the newest session was told about the call so far.</p>
          <pre>{call.summary}</pre>
        </section>
      )}
    </div>
  );
}

function SessionMeter({ age, soft, hard }: { age: number; soft: number; hard: number }) {
  const pct = Math.min(100, (age / hard) * 100);
  const softPct = (soft / hard) * 100;
  return (
    <span className="meter" aria-hidden>
      <span className="fill" style={{ width: `${pct}%` }} />
      <span className="mark" style={{ left: `${softPct}%` }} />
    </span>
  );
}

function formatSeconds(total: number): string {
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function download(call: CallSnapshot) {
  const blob = new Blob([JSON.stringify({ sessions: call.sessions, turns: call.turns }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-call-${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
