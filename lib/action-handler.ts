/*
  lib/action-handler.ts — observability wrapper for Server Actions.

  Usage:
    import { withAction } from '@/lib/action-handler';

    export const advanceStage = withAction('disputes.advanceStage', async (log, disputeId: string) => {
      log.info('advancing', { disputeId });
      // ...
      return { ok: true };
    });
*/

import * as Sentry from '@sentry/nextjs';
import {
  log as rootLog,
  withCorrelationId,
  generateCorrelationId,
} from './logger';

type LogFn = typeof rootLog;

export function withAction<TArgs extends unknown[], TReturn>(
  actionName: string,
  fn: (log: LogFn, ...args: TArgs) => Promise<TReturn>,
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const correlationId = generateCorrelationId();
    return withCorrelationId(correlationId, async () => {
      Sentry.getCurrentScope().setTag('correlationId', correlationId);
      Sentry.getCurrentScope().setTag('action', actionName);

      const start = Date.now();
      rootLog.info('action started', { action: actionName });

      try {
        const result = await fn(rootLog, ...args);
        rootLog.info('action completed', {
          action: actionName,
          durationMs: Date.now() - start,
        });
        return result;
      } catch (err) {
        rootLog.error('action failed', {
          action: actionName,
          err: err as Error,
          durationMs: Date.now() - start,
        });
        throw err;
      }
    });
  };
}
