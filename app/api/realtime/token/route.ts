import { gateway } from '@ai-sdk/gateway';
import { getServerConfig } from '@/lib/config';

/**
 * Mints a short-lived client secret for one realtime session.
 *
 * The browser calls this once per session, including every handoff, so each
 * new session gets a fresh token. The AI Gateway API key never leaves the
 * server.
 */
export async function POST() {
  const config = getServerConfig();
  if (!process.env.AI_GATEWAY_API_KEY) {
    // OIDC works for text models but not here: AI Gateway rejects client-secret
    // minting without an API key (403 "Client secrets can only be minted with a Gateway API key").
    return Response.json(
      { error: 'AI_GATEWAY_API_KEY is not set. Realtime voice needs an AI Gateway API key.' },
      { status: 500 },
    );
  }
  const { token, url, expiresAt } = await gateway.experimental_realtime.getToken({
    model: config.realtimeModel,
  });

  // Browsers can't set headers on a WebSocket upgrade, so the extended-time
  // opt-in rides on the URL instead of `x-vercel-gateway-extended-time`.
  const wsUrl = new URL(url);
  if (config.extendedTime) wsUrl.searchParams.set('extended-time', 'true');

  return Response.json({ token, url: wsUrl.toString(), expiresAt });
}
