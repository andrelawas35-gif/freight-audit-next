# Ingestion Pipeline

## Purpose

Ingestion turns carrier, client, SFTP, EDI, 3PL, WMS, webhook, and CSV inputs into normalized records the audit engine can process. It now also needs to preserve enough behavioral and insurance context to train the future pre-shipment gateway.

## Carrier Adapters (Invoice/Billed Side)

| Adapter | File | Input | Output |
|---------|------|-------|--------|
| FedEx API | `lib/ingestion/carriers/fedex-api.ts` | FedEx API JSON | `NormalizedInvoice` |
| UPS API | `lib/ingestion/carriers/ups-api.ts` | UPS API JSON | `NormalizedInvoice` |
| EDI 210 | `lib/ingestion/carriers/from-edi.ts` + `lib/ingestion/edi/parser.ts` | Raw EDI 210 text | `NormalizedInvoice` |
| LTL CSV | `lib/ingestion/carriers/ltl-csv.ts` | CSV string + column map | `NormalizedInvoice[]` |

## Client Adapters (Shipment/Expected Side)

| Adapter | File | Input | Output |
|---------|------|-------|--------|
| ShipStation | `lib/ingestion/client/shipstation.ts` | Webhook JSON | `NormalizedShipment` |
| Shopify | `lib/ingestion/client/shopify.ts` | Webhook JSON | `NormalizedShipment` |
| Generic CSV | `lib/ingestion/client/generic-csv.ts` | CSV string | `NormalizedShipment[]` |

## 3PL Adapters

| Adapter | File | Input | Output |
|---------|------|-------|--------|
| Fulfillment CSV | `lib/ingestion/3pl/parse.ts` | CSV string | `FulfillmentLine[]` |
| Storage CSV | `lib/ingestion/3pl/parse.ts` | CSV string | `StorageLine[]` |

## Normalization and Staging

- `lib/ingestion/schema.ts` - `NormalizedInvoice` and `NormalizedShipment` types.
- `lib/ingestion/normalize.ts` - `stageInvoice()` and `stageClientShipment()`.
- `lib/ingestion/3pl/stage.ts` - `stageFulfillment()` and `stageStorage()`.
- `app/(console)/ingestion/actions.ts` - staff console file/manual intake.
- `components/console/manual-ingestion-panel.tsx` - typed/pasted intake UI.
- `components/console/ingestion-intake-panel.tsx` - CSV staging UI.

## Ingestion Control Panel

Route: `/ingestion`

Staff can:

- queue SFTP fetch jobs;
- paste FedEx/UPS carrier API JSON;
- paste ShipStation/Shopify webhook JSON;
- paste raw EDI 210;
- paste LTL CSV text with SCAC;
- upload WMS CSV;
- upload 3PL fulfillment/storage CSV;
- monitor intake events, job queue, unmatched invoices, unlinked WMS shipments, open mapping exceptions, 3PL cycles, and recent staged invoice state.

Manual intake must route through the same parsers/stagers as API ingestion. Do not build a second ingestion engine in UI code.

## Code Mapping Pipeline

1. `lib/ingestion/accessorial-map.ts` - hardcoded carrier accessorial code -> standard code.
2. `lib/ingestion/service-level-map.ts` - hardcoded carrier service code -> standard label.
3. `lib/ingestion/mappings.ts` - mapping context resolver: learned DB -> baseline -> exception.
4. `lib/ingestion/data-clerk.ts` - AI suggest-only mapping (`annotateOpenExceptions()`).

AI suggestions are never automatically committed. Human confirmation writes to `learned_mappings`.

## SFTP Auto-Fetch

Carriers drop raw `.edi`, `.x12`, or `.csv` files into SFTP. The system polls and ingests automatically.

Flow:

```text
Vercel Cron -> enqueue sftp_fetch job -> worker claims job -> ssh2-sftp-client connects
-> downloads new files -> routes EDI/CSV parser -> stages invoices -> archives on SFTP
```

Files:

- `lib/ingestion/sftp/fetch.ts`
- `app/api/cron/sftp-fetch/route.ts`
- `db/migrations/0003_add-sftp-fetch.sql`

Carrier SFTP config lives on `"Carriers"`:

| Column | Description |
|--------|-------------|
| `sftp_host` | Hostname |
| `sftp_port` | Port |
| `sftp_user` | Username |
| `sftp_key_env` | Env var name holding private key |
| `sftp_inbox_dir` | Remote directory to scan |
| `sftp_archive_dir` | Processed-file archive |
| `sftp_file_format` | `edi` or `csv` |
| `sftp_enabled` | Polling toggle |

Credentials must remain in environment variables. The console may queue a fetch but must not expose or accept private keys.

## Gateway Data Collection at Ingestion

The gateway roadmap depends on richer shipment inputs (commodity, declared value, package
dims/weight, packaging certification, address/destination risk, carrier/service selected,
signature option, insurance provider/amount, applied policy ID, source system + raw
payload). Capture them when available from WMS, carrier APIs, 3PL files, or client uploads.
The full field list is single-sourced in
[`policy-intelligence/03-taxonomy.md`](policy-intelligence/03-taxonomy.md#shipment-fields-the-taxonomy-consumes).

**Do not block ingestion when a field is missing.** Stage the record and let downstream
audit/gateway taxonomy mark `DATA_REQUIRED` or `DOCUMENTATION_MISSING`.

## Policy document intake is a separate pipeline

Shipment ingestion (this doc) answers *"what happened?"* **Policy document** intake —
contracts, tariffs, SLAs, insurance declarations, SOPs, email exceptions, plus
high-value-shipper insurance onboarding and denied-claims history — answers *"what should
have happened?"* and lives in its own staff-only pipeline. It must never block
invoice/shipment ingestion. See
[`policy-intelligence/01-ingestion.md`](policy-intelligence/01-ingestion.md).

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/ingest/carrier` | `x-ingest-secret` | FedEx/UPS API invoices |
| `POST /api/ingest/edi` | `x-ingest-secret` | EDI 210 files |
| `POST /api/ingest/sftp-poll` | `x-ingest-secret` | LTL carrier CSV from SFTP |
| `POST /api/ingest/wms` | `x-ingest-secret` | ShipStation/Shopify webhooks |
| `POST /api/ingest/3pl` | `x-ingest-secret` | 3PL fulfillment/storage CSV |

## Key Files

| File | Purpose |
|------|---------|
| `lib/ingestion/schema.ts` | Normalized types |
| `lib/ingestion/normalize.ts` | Staging logic |
| `lib/ingestion/mappings.ts` | Mapping resolver |
| `lib/ingestion/data-clerk.ts` | AI code mapping suggestions |
| `lib/ingestion/uploads.ts` | Upload tracking |
| `lib/ingestion/sftp/fetch.ts` | SFTP auto-fetch |
| `lib/ingestion/control-panel.ts` | Console read model |
