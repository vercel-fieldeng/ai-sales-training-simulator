/** Repository the Deploy button clones. */
export const REPO_URL = 'https://github.com/vercel-fieldeng/realtime-session-handoff';

export const SITE = {
  name: 'Realtime Voice Session Handoff',
  description:
    'Run voice calls longer than a single realtime session. Hand the conversation to a fresh AI Gateway session between turns, keep one transcript, and grade the call when it ends.',
};

export const DEPLOY_URL = `https://vercel.com/new/clone?${new URLSearchParams({
  'repository-url': REPO_URL,
  'project-name': 'realtime-session-handoff',
  'repository-name': 'realtime-session-handoff',
  'demo-title': SITE.name,
  'demo-description': SITE.description,
}).toString()}`;
