'use client';

import type { GradingState } from '@/lib/handoff/call-controller';
import type { Turn } from '@/lib/handoff/transcript';
import { CRITERIA, GATES } from '@/lib/scoring/rubric';

const RESULT_LABEL = { pass: 'Pass', fail: 'Fail', 'needs-review': 'Needs review' } as const;

export function Grading({
  grading,
  turns,
  onRetry,
}: {
  grading: GradingState;
  turns: readonly Turn[];
  onRetry: () => void;
}) {
  const { payload, scorecard } = grading;
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const bytes = payload ? new Blob([JSON.stringify(payload)]).size : 0;

  return (
    <section className="panel">
      <h2>Grading</h2>

      {payload && (
        <p className="muted">
          Call ended: sent {payload.turns.length} turns from {payload.sessions.length} session
          {payload.sessions.length === 1 ? '' : 's'} to <code>POST /api/score</code> (
          {(bytes / 1024).toFixed(1)} KB).{' '}
          {grading.status === 'sending' && 'Grading…'}
          {grading.status === 'done' && `Graded in ${((grading.durationMs ?? 0) / 1000).toFixed(1)}s.`}
        </p>
      )}

      {payload && (
        <details>
          <summary>Payload sent</summary>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
        </details>
      )}

      {grading.status === 'error' && (
        <p className="error">
          {grading.error} <button className="secondary" onClick={onRetry}>Retry</button>
        </p>
      )}

      {scorecard && (
        <div className="scorecard">
          <div className="row">
            <span className={`badge ${scorecard.result}`}>{RESULT_LABEL[scorecard.result]}</span>
            <strong>{scorecard.overall == null ? 'Compliance gate failed' : `${scorecard.overall} / 100`}</strong>
          </div>
          <p className="muted">Illustrative rubric for the demo. Replace it with your own training and compliance criteria.</p>

          <h3>Compliance gates</h3>
          <ul className="items">
            {scorecard.gates.map((gate) => (
              <li key={gate.id}>
                <div className="row">
                  <span>{gate.id}</span>
                  <span className={gate.passed ? 'ok' : 'bad'}>{gate.passed ? 'passed' : 'failed'}</span>
                </div>
                <p className="muted">{GATES[gate.id]}</p>
                <p>{gate.rationale}</p>
                <Evidence ids={gate.evidenceTurnIds} byId={byId} />
              </li>
            ))}
          </ul>

          <h3>Criteria</h3>
          <ul className="items">
            {scorecard.criteria.map((criterion) => (
              <li key={criterion.id}>
                <div className="row">
                  <span>{criterion.id}</span>
                  <span>{criterion.score} / 4</span>
                </div>
                <p className="muted">{CRITERIA[criterion.id]}</p>
                <p>{criterion.rationale}</p>
                <Evidence ids={criterion.evidenceTurnIds} byId={byId} />
              </li>
            ))}
          </ul>

          {scorecard.coachingNotes.length > 0 && (
            <>
              <h3>Coaching notes</h3>
              <ul>
                {scorecard.coachingNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}

          {scorecard.flags.length > 0 && (
            <>
              <h3>Flagged for human review</h3>
              <ul>
                {scorecard.flags.map((flag) => (
                  <li key={`${flag.item}-${flag.reason}`}>
                    <code>{flag.item}</code>: {flag.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Evidence({ ids, byId }: { ids: string[]; byId: Map<string, Turn> }) {
  if (ids.length === 0) return <p className="muted">No evidence cited.</p>;
  return (
    <ul className="evidence">
      {ids.map((id) => {
        const turn = byId.get(id);
        return turn ? (
          <li key={id}>
            <span className="muted">{turn.speaker === 'trainee' ? 'Agent' : 'Margaret'}:</span> “{turn.text}”
          </li>
        ) : null;
      })}
    </ul>
  );
}
