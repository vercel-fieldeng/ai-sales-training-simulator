import { Call } from '@/components/call';
import { getServerConfig, toClientConfig } from '@/lib/config';
import { DEPLOY_URL, REPO_URL, SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default function Page() {
  const config = toClientConfig(getServerConfig());

  return (
    <main>
      <section className="hero">
        <h1>{SITE.name}</h1>
        <p>
          A sales training call that outlasts a single realtime session. The app hands the
          conversation to a fresh AI Gateway session between turns, so the trainee hears one
          continuous call, and grades the transcript when the call ends.
        </p>
        <div className="hero-actions">
          <a className="button" href={DEPLOY_URL}>
            Deploy
          </a>
          <a className="button secondary" href={REPO_URL}>
            View source
          </a>
        </div>
      </section>
      <Call config={config} />
    </main>
  );
}
