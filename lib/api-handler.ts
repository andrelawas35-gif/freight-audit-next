/*
  lib/api-handler.ts — wraps API route handlers with correlation ID
  propagation, structured logging, and Sentry scope tagging.

  Usage:
    import { withObservability } from '@/lib/api-handler';

    export const POST = withObservability('ingest/carrier', async (req, { log, correlationId }) => {
      log.info('processing invoice', { carrier: 'fedex' });
      return NextResponse.json({ ok: true });
    });
*/

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import {
  log as rootLog,
  withCorrelationId,
  generateCorrelationId,
  getCorrelationId,
} from './logger';

type HandlerContext = {
  log: typeof rootLog;
  correlationId: string;
};

type Handler = (req: NextRequest, ctx: HandlerContext) => Promise<NextResponse>;

export function withObservability(routeName: string, handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId =
      req.headers.get('x-correlation-id') ?? generateCorrelationId();

    return withCorrelationId(correlationId, async () => {
      Sentry.getCurrentScope().setTag('correlationId', correlationId);
      Sentry.getCurrentScope().setTag('route', routeName);

      const start = Date.now();
      rootLog.info('request started', {
        route: routeName,
        method: req.method,
        url: req.nextUrl.pathname,
      });

      try {
        const response = await handler(req, {
          log: rootLog,
          correlationId,
        });

        rootLog.info('request completed', {
          route: routeName,
          status: response.status,
          durationMs: Date.now() - start,
        });

        response.headers.set('x-correlation-id', correlationId);
        return response;
      } catch (err) {
        const durationMs = Date.now() - start;
        rootLog.error('request failed', {
          route: routeName,
          err: err as Error,
          durationMs,
        });

        return NextResponse.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            correlationId,
          },
          { status: 500 },
        );
      }
    });
  };
}
