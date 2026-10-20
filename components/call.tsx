'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ClientCallConfig } from '@/lib/config';
import { CallController, type CallSnapshot, type SessionRecord } from '@/lib/handoff/call-controller';
import { SCENARIO } from '@/lib/handoff/persona';
import { CallStage } from './call-stage';
import { Grading } from './grading';

const PHASE_LABEL: Record<CallSnapshot['phase'], string> = {
  idle: 'Ready when you are',
  connecting: 'Connecting',
  live: 'On call',
  preparing: 'On call',
  switching: 'On call',
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
  const callSeconds = elapsedCallSeconds(call);

  return (
    <div className="call">
      <section className="panel">
        <CallStage call={call} callSeconds={callSeconds} />
        <div className="row">
          <strong>{PHASE_LABEL[call.phase]}</strong>
          <div className="actions">
            {call.phase === 'idle' && <button onClick={() => controller.start()}>Start practice call</button>}
            {inCall && (
              <button className="danger" onClick={() => controller.end()}>
                End call
              </button>
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

        <div className="scenario">
          <div>
            <h3>Your customer</h3>
            <p>
              <strong>{SCENARIO.customer}.</strong> {SCENARIO.situation}
            </p>
          </div>
          <div>
            <h3>Your goals</h3>
            <ul>
              {SCENARIO.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Transcript</h2>
        {call.turns.length === 0 && (
          <p className="muted">
            {inCall ? 'Introduce yourself to start the conversation.' : 'The conversation appears here as you talk.'}
          </p>
        )}
        <ul className="transcript">
          {call.turns.map((turn) => (
            <li key={turn.id}>
              <span className={`speaker ${turn.speaker}`}>{turn.speaker === 'trainee' ? 'You' : 'Margaret'}</span>
              {turn.text}
            </li>
          ))}
        </ul>
      </section>

      <Grading grading={call.grading} turns={call.turns} onRetry={() => controller.submitForGrading()} />

      <UnderTheHood call={call} config={config} inCall={inCall} onHandoff={() => controller.requestHandoff()} />
    </div>
  );
}

/**
 * Platform detail: AI Gateway ends each realtime session at a fixed limit, so
 * longer calls are carried across sessions. Shown for demos, collapsed by default.
 */
function UnderTheHood({
  call,
  config,
  inCall,
  onHandoff,
}: {
  call: CallSnapshot;
  config: ClientCallConfig;
  inCall: boolean;
  onHandoff: () => void;
}) {
  const { softSeconds, hardSeconds } = config.timing;
  return (
    <details className="panel under-the-hood">
      <summary>
        <h2>Under the hood: long calls</h2>
        {call.sessions.length > 1 && <span className="muted">{call.sessions.length} sessions so far</span>}
      </summary>

      <p className="muted">
        AI Gateway ends each realtime session after about {config.extendedTime ? '30' : '13'} minutes. To keep a longer
        call going, the app warms up a fresh session in the background and moves the conversation to it at a pause
        between turns. It carries over a summary and the latest exchanges, and keeps the same voice. The trainee hears
        one continuous call.
      </p>

      <dl className="meta">
        <dt>Voice model</dt>
        <dd>{config.realtimeModel}</dd>
        <dt>Handoff window</dt>
        <dd>
          from {formatSeconds(softSeconds)} at a pause, by {formatSeconds(hardSeconds)} at the latest
        </dd>
        {call.activeIndex != null && (
          <>
            <dt>Current session</dt>
            <dd>
              #{call.activeIndex + 1}, {formatSeconds(call.activeAgeSeconds)} old
              <SessionMeter age={call.activeAgeSeconds} soft={softSeconds} hard={hardSeconds} />
            </dd>
          </>
        )}
      </dl>

      {inCall && (
        <p>
          <button className="secondary" onClick={onHandoff}>
            Hand off at next pause
          </button>
        </p>
      )}

      {call.sessions.length > 0 && (
        <>
          <h3>Sessions</h3>
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
        </>
      )}

      {call.summary && (
        <>
          <h3>Carryover summary</h3>
          <pre>{call.summary}</pre>
        </>
      )}
    </details>
  );
}

function elapsedCallSeconds(call: CallSnapshot): number {
  const start = call.sessions.find((s) => s.connectedAt != null)?.connectedAt;
  if (start == null) return 0;
  const ended = call.phase === 'ended' || call.phase === 'error';
  const end = ended ? Math.max(start, ...call.sessions.map((s) => s.endedAt ?? 0)) : Date.now();
  return (end - start) / 1000;
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

export function formatSeconds(total: number): string {
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function download(call: CallSnapshot) {
  const blob = new Blob([JSON.stringify({ sessions: call.sessions, turns: call.turns, grading: call.grading.scorecard }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `practice-call-${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
