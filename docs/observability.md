# Observability

## Architecture

```
Request → Middleware (assign x-correlation-id)
           ↓
         API Route (withObservability wrapper)
           ↓
       ┌──────────────────────┐
       │  Structured Logger   │──→ stdout (JSON lines)
       │  (lib/logger.ts)     │──→ Sentry (errors only)
       └──────────────────────┘
           ↓
       Correlation ID propagated via AsyncLocalStorage
       (all nested log calls auto-tagged)
```

## Components

### 1. Structured Logger (`lib/logger.ts`)

JSON-line logger with four levels: `debug`, `info`, `warn`, `error`.

Every log line is a single JSON object:
```json
{"level":"info","msg":"invoice staged","ts":"2026-06-23T10:00:00.000Z","correlationId":"m1abc-x9f3kd","invoiceId":"inv_123","carrier":"fedex"}
```

`log.error()` automatically sends the first `Error` instance in its data to Sentry via `captureException`.

**Correlation IDs** propagate via `AsyncLocalStorage`. Any code running inside `withCorrelationId()` — including deeply nested function calls — automatically gets the correlation ID attached to its logs.

### 2. Sentry Integration

Three config files for the three Next.js runtimes:
- `sentry.client.config.ts` — browser, 20% trace sampling, error replay at 100%
- `sentry.server.config.ts` — Node.js serverless functions
- `sentry.edge.config.ts` — Edge middleware

`instrumentation.ts` hooks Sentry into Next.js's instrumentation API for automatic error capture on unhandled exceptions.

`next.config.mjs` wraps with `withSentryConfig` for source map uploads and Vercel monitor integration.

**Required env vars:**
| Variable | Runtime | Purpose |
|----------|---------|---------|
| `SENTRY_DSN` | Server | Server-side error reporting |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Client-side error reporting |
| `SENTRY_ORG` | Build | Source map upload org |
| `SENTRY_PROJECT` | Build | Source map upload project |
| `SENTRY_AUTH_TOKEN` | Build | Source map upload auth |

Sentry is **disabled** when DSN env vars are absent — safe for local dev.

### 3. API Route Wrapper (`lib/api-handler.ts`)

`withObservability(routeName, handler)` wraps any API route handler with:
- Correlation ID extraction from `x-correlation-id` header (or generation)
- `AsyncLocalStorage` propagation for the request lifetime
- Sentry scope tagging (`correlationId`, `route`)
- Structured request/response logging with duration
- Unhandled error catch → log + Sentry + 500 JSON response with correlationId

**Usage:**
```ts
import { withObservability } from '@/lib/api-handler';

export const POST = withObservability('ingest/carrier', async (req, { log, correlationId }) => {
  log.info('processing', { carrier });
  return NextResponse.json({ ok: true });
});
```

### 4. Health Check (`/api/health`)

`GET /api/health` — liveness + readiness probe.

Returns 200 if Postgres is reachable, 503 otherwise:
```json
{
  "status": "healthy",
  "version": "a1b2c3d",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 12 }
  }
}
```

Use for:
- Vercel health checks
- Uptime monitors (Datadog, Better Uptime, Checkly)
- Load balancer readiness probes
- CI smoke tests after deploy

### 5. Correlation IDs

Every request gets a unique `x-correlation-id` header:
1. **Middleware** assigns it (or preserves an incoming one from upstream proxies)
2. **API wrapper** reads it into `AsyncLocalStorage`
3. **Logger** auto-tags every log line
4. **Sentry** gets it as a scope tag
5. **Response** includes it in the `x-correlation-id` header

To trace a request end-to-end: search logs for the correlation ID value.

## Covered Routes

All API routes use `withObservability`:
- `ingest/carrier`, `ingest/edi`, `ingest/wms`, `ingest/sftp-poll`, `ingest/3pl`
- `run-audit`, `run-audit/process`, `run-audit/status`
- `cron/sftp-fetch`

## Local Development

Sentry is disabled without DSN env vars. Structured logs still go to stdout as JSON — pipe through `jq` for readability:

```bash
npm run dev 2>&1 | jq -R 'try fromjson catch .'
```
