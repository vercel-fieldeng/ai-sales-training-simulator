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
          Practice a live sales call with an AI customer who talks back in real time. When you hang
          up, the call is graded against a rubric, with every score tied to what was actually said.
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
