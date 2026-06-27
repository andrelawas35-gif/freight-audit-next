/**
 * index.ts — Aurelian Gateway V1 Fastify server entry point.
 *
 * Separate always-on service (08-gateway.md D4):
 *   - /health — readiness probe
 *   - POST /v1/precheck — core pre-shipment compliance check
 *
 * Starts the in-memory ruleset cache, periodic buffer drain,
 * and registers auth + observability hooks.
 */

import Fastify from 'fastify';
import { loadConfig } from './config';
import { warmCache } from './cache';
import { registerAuth } from './auth';
import { precheckHandler } from './precheck';
import { startBufferDrain, stopBufferDrain } from './decision-log';
import { getSql } from '../../../lib/db';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = Fastify({
    logger: false, // We use structured JSON logging directly
  });

  // ── Observability: correlation ID propagation ────────────────────────
  app.addHook('onRequest', async (request, reply) => {
    const cid = request.headers['x-correlation-id'] as string | undefined;
    if (cid) {
      reply.header('x-correlation-id', cid);
    }
  });

  // ── Structured request logging ───────────────────────────────────────
  app.addHook('onResponse', async (request, reply) => {
    const durationMs = reply.elapsedTime;
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'request completed',
        ts: new Date().toISOString(),
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
        correlationId: reply.getHeader('x-correlation-id') || undefined,
      }),
    );
  });

  // ── Auth (per-client API keys, D6) ───────────────────────────────────
  registerAuth(app);

  // ── Routes ───────────────────────────────────────────────────────────
  app.get('/health', async (_request, reply) => {
    const start = Date.now();
    let dbStatus = 'ok';
    let dbLatencyMs = 0;

    try {
      const sql = getSql();
      await sql`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    const statusCode = dbStatus === 'ok' ? 200 : 503;
    reply.status(statusCode).send({
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      version: '1.0.0',
      uptime: process.uptime(),
      checks: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
      },
    });
  });

  app.post('/v1/precheck', precheckHandler);

  // ── Error handler ────────────────────────────────────────────────────
  app.setErrorHandler(async (error, request, reply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string) || 'unknown';

    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;

    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'unhandled error',
        ts: new Date().toISOString(),
        correlationId,
        method: request.method,
        url: request.url,
        err: errMsg,
        stack: errStack,
      }),
    );

    reply.status(500).send({
      error: 'internal_error',
      message: 'An unexpected error occurred',
      correlationId,
    });
  });

  // ── Startup ──────────────────────────────────────────────────────────
  try {
    // Warm the ruleset cache before accepting requests
    await warmCache();

    // Start periodic buffer drain
    startBufferDrain();

    await app.listen({ port: config.port, host: '0.0.0.0' });

    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'gateway started',
        ts: new Date().toISOString(),
        port: config.port,
        apiKeyCount: config.apiKeys.size,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'gateway startup failed',
        ts: new Date().toISOString(),
        err: String(err),
      }),
    );
    process.exit(1);
  }

  // ── Graceful shutdown ────────────────────────────────────────────────
  const shutdown = async () => {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'gateway shutting down',
        ts: new Date().toISOString(),
      }),
    );

    // Drain remaining buffer entries
    await stopBufferDrain();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
