/** Repository the Deploy button clones. */
export const REPO_URL = 'https://github.com/vercel-fieldeng/ai-sales-training-simulator';

export const SITE = {
  name: 'AI Sales Training Simulator',
  description:
    'Practice live sales calls with an AI customer over realtime voice, then get an evidence-backed scorecard when the call ends. Built with AI Gateway and the AI SDK.',
};

export const DEPLOY_URL = `https://vercel.com/new/clone?${new URLSearchParams({
  'repository-url': REPO_URL,
  'project-name': 'ai-sales-training-simulator',
  'repository-name': 'ai-sales-training-simulator',
  env: 'AI_GATEWAY_API_KEY',
  envDescription: 'AI Gateway API key. Realtime voice client secrets can only be minted with an API key, not OIDC.',
  envLink: 'https://vercel.com/docs/ai-gateway/authentication-and-byok',
  'demo-title': SITE.name,
  'demo-description': SITE.description,
}).toString()}`;
