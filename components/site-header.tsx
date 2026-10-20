import { DEPLOY_URL, REPO_URL } from '@/lib/site';

export function SiteHeader() {
  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <a href="https://vercel.com/ai-gateway" className="brand" aria-label="Vercel AI Gateway">
          <VercelLogo />
          <span className="slash">/</span>
          <span>AI Gateway</span>
        </a>
        <div className="nav-actions">
          <a href={REPO_URL} className="icon-link" aria-label="View source on GitHub">
            <GitHubLogo />
          </a>
          <a href={DEPLOY_URL} className="deploy">
            <VercelLogo size={12} />
            Deploy
          </a>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      Built with{' '}
      <a href="https://vercel.com/ai-gateway">AI Gateway</a> and the{' '}
      <a href="https://ai-sdk.dev">AI SDK</a>.
    </footer>
  );
}

function VercelLogo({ size = 18 }: { size?: number }) {
  return (
    <svg height={size} viewBox="0 0 76 65" aria-hidden>
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
    </svg>
  );
}

function GitHubLogo() {
  return (
    <svg height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
      />
    </svg>
  );
}
