import type { CallSnapshot } from '@/lib/handoff/call-controller';

/**
 * The two parties on the call: the trainee (a person on a mic) and the AI
 * customer. Each avatar lights up while that side is speaking, and the line
 * between them shows the call is connected and how long it has run.
 */
export function CallStage({ call, callSeconds }: { call: CallSnapshot; callSeconds: number }) {
  const live = call.phase === 'live' || call.phase === 'preparing' || call.phase === 'switching';

  return (
    <div className={`stage ${live ? 'is-live' : ''}`}>
      <Party
        name="You"
        role="Sales agent"
        speaking={live && call.speaking.trainee}
        icon={<PersonIcon />}
      />

      <div className="link">
        <span className="wire" />
        <span className="link-label">
          {live
            ? formatSeconds(callSeconds)
            : call.phase === 'connecting'
              ? 'Connecting…'
              : call.phase === 'ended' && callSeconds > 0
                ? `Ended at ${formatSeconds(callSeconds)}`
                : 'Not connected'}
        </span>
      </div>

      <Party
        name="Margaret"
        role="AI customer"
        speaking={live && call.speaking.customer}
        icon={<SparkIcon />}
        ai
      />
    </div>
  );
}

function Party({
  name,
  role,
  speaking,
  icon,
  ai = false,
}: {
  name: string;
  role: string;
  speaking: boolean;
  icon: React.ReactNode;
  ai?: boolean;
}) {
  return (
    <div className={`party ${speaking ? 'is-speaking' : ''}`}>
      <div className={`avatar ${ai ? 'ai' : ''}`}>
        <span className="ring" aria-hidden />
        {icon}
      </div>
      <div className="party-name">{name}</div>
      <div className="party-role">{role}</div>
      <div className="bars" aria-label={speaking ? `${name} is speaking` : undefined}>
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function formatSeconds(total: number): string {
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function PersonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
        strokeLinejoin="round"
      />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" strokeLinejoin="round" />
    </svg>
  );
}
