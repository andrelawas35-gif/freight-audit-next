/*
  lib/logger.ts — structured JSON logger with correlation ID support.

  Every log line is a single JSON object with at minimum:
    { level, msg, ts, correlationId? }

  Usage:
    import { log } from '@/lib/logger';
    log.info('invoice staged', { invoiceId, carrier });
    log.error('stage failed', { err, invoiceId });

  Correlation IDs propagate via AsyncLocalStorage so any code
  running inside withCorrelationId() automatically tags its logs.
*/

import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/nextjs';

const correlationStore = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

export function withCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStore.run(id, fn);
}

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, data?: LogPayload) {
  const entry: Record<string, unknown> = {
    level,
    msg,
    ts: new Date().toISOString(),
  };

  const cid = getCorrelationId();
  if (cid) entry.correlationId = cid;

  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (v instanceof Error) {
        entry[k] = { message: v.message, stack: v.stack };
      } else {
        entry[k] = v;
      }
    }
  }

  const line = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const log = {
  debug: (msg: string, data?: LogPayload) => emit('debug', msg, data),
  info: (msg: string, data?: LogPayload) => emit('info', msg, data),
  warn: (msg: string, data?: LogPayload) => emit('warn', msg, data),
  error: (msg: string, data?: LogPayload) => {
    emit('error', msg, data);
    if (data) {
      const errValue = Object.values(data).find((v) => v instanceof Error);
      if (errValue) {
        Sentry.captureException(errValue, {
          extra: { ...data, correlationId: getCorrelationId() },
        });
      }
    }
  },
};
