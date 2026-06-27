/**
 * auth.ts — Per-client API key authentication for the Gateway.
 *
 * API key → clientId resolution (08-gateway.md D6).
 * The key is the ONLY tenant-identity source — never from the request body.
 * Keys are loaded from env vars: GATEWAY_API_KEY_<clientId>=sk-...
 *
 * Cached in the warm snapshot — auth adds no per-request DB hit.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from './config';

/** Extend Fastify request to carry authenticated clientId. */
declare module 'fastify' {
  interface FastifyRequest {
    gatewayClientId?: string;
  }
}

const AUTH_HEADER = 'x-api-key';

export function resolveClientId(apiKey: string): string | null {
  const { apiKeys } = getConfig();
  return apiKeys.get(apiKey) ?? null;
}

/**
 * Fastify preHandler hook that validates the x-api-key header
 * and attaches `req.gatewayClientId`.
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers[AUTH_HEADER];

  if (!apiKey || typeof apiKey !== 'string') {
    reply.status(401).send({
      error: 'unauthorized',
      message: 'Missing x-api-key header',
    });
    return;
  }

  const clientId = resolveClientId(apiKey);
  if (!clientId) {
    reply.status(401).send({
      error: 'unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  request.gatewayClientId = clientId;
}

/**
 * Register auth hooks on the Fastify instance.
 * Applied to /v1/* routes only.
 */
export function registerAuth(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    // Only authenticate /v1/ routes, skip /health
    if (!request.url.startsWith('/v1/')) return;
    await apiKeyAuth(request, reply);
  });
}
