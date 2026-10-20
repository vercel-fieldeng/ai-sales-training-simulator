import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/gateway', () => ({
  gateway: {
    experimental_realtime: {
      getToken: vi.fn(async () => ({
        token: 'secret',
        url: 'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime-2.1',
      })),
    },
  },
}));

const { POST } = await import('@/app/api/realtime/token/route');

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/realtime/token', () => {
  it('adds the extended-time opt-in when EXTENDED_TIME=true', async () => {
    vi.stubEnv('EXTENDED_TIME', 'true');
    const body = await (await POST()).json();
    const url = new URL(body.url);
    expect(url.searchParams.get('extended-time')).toBe('true');
    expect(url.searchParams.get('ai-model-id')).toBe('openai/gpt-realtime-2.1');
    expect(body.token).toBe('secret');
  });

  it('leaves the URL alone by default', async () => {
    const body = await (await POST()).json();
    expect(new URL(body.url).searchParams.has('extended-time')).toBe(false);
  });
});
