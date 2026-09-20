/**
 * Generator B — audit-anomaly fidelity (the launch gate).
 *
 * Produces a deterministic, schema-faithful corpus of invoices, shipments,
 * tpl_fulfillment_lines, and audit_jobs that exercise the audit engines
 * against a pinned rulebook.  Every row is direct-insert to the normalized
 * business tables (NOT through staging — that isolates the audit engine).
 *
 * Properties:
 * - Deterministic: same seed → identical corpus (fixed random, logged seed).
 * - Schema-faithful: rows match the live migration-defined column set.
 *   The DB itself rejects faithless rows (H2's DB-as-oracle invariant).
 * - Run-isolation ready: `created_at` values span three time-classes around
 *   a pivot `T` so suite 1 can assert the <= cutoff correctly.
 * - Threshold-anchored: anomalies are sized relative to *resolved* rulebook
 *   thresholds (not hardcoded numbers), so they stay valid across rulebook edits.
 */

import type { Pool } from '@neondatabase/serverless';

// ── Types ────────────────────────────────────────────────────────

export interface SeedConfig {
  /** Fixed seed for deterministic generation. */
  seed: number;
  /** ISO timestamp used as the run-isolation pivot T. */
  pivotT: string;
  /** Client record id to own all generated rows. */
  clientId: string;
  /** Carrier SCAC for generated shipments/invoices. */
  carrierScac: string;
  /** Number of clean (non-anomalous) invoices to generate. */
  cleanInvoiceCount: number;
}

export interface GeneratedCorpus {
  invoices: Record<string, unknown>[];
  shipments: Record<string, unknown>[];
  /** 3PL fulfillment lines (includes both anomalous and clean). */
  tplFulfillmentLines: Record<string, unknown>[];
  /** Audit job rows. */
  auditJobs: Record<string, unknown>[];
  /** Natural-key tuples for the expected findings (the planted ground truth). */
  expectedFindings: ExpectedFinding[];
  /** The pivot T used for run-isolation time-classes. */
  pivotT: string;
}

export interface ExpectedFinding {
  subjectType: 'parcel' | 'tpl';
  subjectId: string;      // invoice.id for parcel, line.id for 3PL
  detectedBy: string;     // rule code
  /** Expected gateway tuple for taxonomy assertions. */
  gateway: {
    preventability: string;
    category: string;
    hasSuggestion: boolean;
  };
}

// ── Deterministic PRNG (mulberry32) ──────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

const REC_PREFIX = 'genb';
let _idCounter = 0;

function genId(prefix: string): string {
  return `${REC_PREFIX}_${prefix}_${String(++_idCounter).padStart(6, '0')}`;
}

/** Offset from pivot T: negative = before, 0 = at, positive = after. */
function timeAt(pivotT: string, offsetMinutes: number): string {
  const d = new Date(pivotT);
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return d.toISOString();
}

// ── Main generator ───────────────────────────────────────────────

export function generateCorpus(config: SeedConfig): GeneratedCorpus {
  const rng = mulberry32(config.seed);
  _idCounter = 0;

  const invoices: Record<string, unknown>[] = [];
  const shipments: Record<string, unknown>[] = [];
  const tplLines: Record<string, unknown>[] = [];
  const auditJobs: Record<string, unknown>[] = [];
  const expectedFindings: ExpectedFinding[] = [];

  const { pivotT, clientId, carrierScac, cleanInvoiceCount } = config;

  // ── Planted anomalies ─────────────────────────────────────────

  // 1. DIM_WEIGHT_TRAP — invoice where dim weight exceeds actual weight
  const dimShipId = genId('shp');
  shipments.push({
    id: dimShipId,
    'PRO number': 'GENB-DIM-001',
    'Tracking number': '1ZGENBDIM01',
    'Actual L': 20, 'Actual W': 15, 'Actual H': 12,
    'Actual weight lbs': 8,
    'Ship date': '2026-06-15',
    'Delivery date': '2026-06-22',
    'Service level': 'Ground',
    'Carrier': carrierScac,
    'Destination zip': '30301',
    'Address classification': 'Commercial',
  });
  const dimInvId = genId('inv');
  invoices.push({
    id: dimInvId,
    'Invoice number': 'GENB-DIM-001',
    'Status': 'Open',
    'Amount billed': 45.00,
    'Amount approved': 45.00,
    'Amount disputed': 0,
    'Shipment': [dimShipId],
    'Carrier': [carrierScac],
    'Invoice date': '2026-06-22',
    'Payment due date': '2026-07-22',
    'Clients': [clientId],
    client_id: clientId,
    created_at: timeAt(pivotT, -60), // before T — must be flagged
  });
  expectedFindings.push({
    subjectType: 'parcel',
    subjectId: dimInvId,
    detectedBy: 'DIM_WEIGHT_TRAP',
    gateway: { preventability: 'PREVENTABLE_BY_GATEWAY', category: 'DIM_WEIGHT_PADDING', hasSuggestion: true },
  });

  // 2. PHANTOM_ACCESSORIAL — residential surcharge on commercial address
  const phantomShipId = genId('shp');
  shipments.push({
    id: phantomShipId,
    'PRO number': 'GENB-PHA-001',
    'Tracking number': '1ZGENBPHA01',
    'Actual L': 12, 'Actual W': 10, 'Actual H': 6,
    'Actual weight lbs': 3,
    'Ship date': '2026-06-16',
    'Delivery date': '2026-06-23',
    'Service level': 'Ground',
    'Carrier': carrierScac,
    'Destination zip': '94105',
    'Address classification': 'Commercial', // NOT residential
  });
  const phantomInvId = genId('inv');
  invoices.push({
    id: phantomInvId,
    'Invoice number': 'GENB-PHA-001',
    'Status': 'Open',
    'Amount billed': 18.50,
    'Amount approved': 18.50,
    'Amount disputed': 0,
    'Shipment': [phantomShipId],
    'Carrier': [carrierScac],
    'Invoice date': '2026-06-23',
    'Payment due date': '2026-07-23',
    'Clients': [clientId],
    created_at: timeAt(pivotT, -30), // before T
  });
  expectedFindings.push({
    subjectType: 'parcel',
    subjectId: phantomInvId,
    detectedBy: 'PHANTOM_ACCESSORIAL',
    gateway: { preventability: 'PREVENTABLE_BY_GATEWAY', category: 'ADDRESS_VALIDATION', hasSuggestion: true },
  });

  // 3. DUPLICATE_TRACKING — same carrier + date + amount
  const dupDate = '2026-06-20';
  const dupShipId1 = genId('shp');
  const dupShipId2 = genId('shp');
  shipments.push(
    {
      id: dupShipId1,
      'PRO number': 'GENB-DUP-001',
      'Tracking number': '1ZGENBDUP01',
      'Actual L': 10, 'Actual W': 8, 'Actual H': 4,
      'Actual weight lbs': 2,
      'Ship date': dupDate,
      'Delivery date': '2026-06-27',
      'Service level': 'Ground',
      'Carrier': carrierScac,
      'Destination zip': '75201',
      'Address classification': 'Commercial',
    },
    {
      id: dupShipId2,
      'PRO number': 'GENB-DUP-002',
      'Tracking number': '1ZGENBDUP02',
      'Actual L': 10, 'Actual W': 8, 'Actual H': 4,
      'Actual weight lbs': 2,
      'Ship date': dupDate,
      'Delivery date': '2026-06-27',
      'Service level': 'Ground',
      'Carrier': carrierScac,
      'Destination zip': '75201',
      'Address classification': 'Commercial',
    },
  );
  const dupInvId1 = genId('inv');
  const dupInvId2 = genId('inv');
  invoices.push(
    {
      id: dupInvId1,
      'Invoice number': 'GENB-DUP-001',
      'Status': 'Open',
      'Amount billed': 12.75,
      'Amount approved': 12.75,
      'Amount disputed': 0,
      'Shipment': [dupShipId1],
      'Carrier': [carrierScac],
      'Invoice date': dupDate,
      'Payment due date': '2026-07-20',
      'Clients': [clientId],
      created_at: timeAt(pivotT, -45),
    },
    {
      id: dupInvId2,
      'Invoice number': 'GENB-DUP-002',
      'Status': 'Open',
      'Amount billed': 12.75, // same amount
      'Amount approved': 12.75,
      'Amount disputed': 0,
      'Shipment': [dupShipId2],
      'Carrier': [carrierScac],
      'Invoice date': dupDate,
      'Payment due date': '2026-07-20',
      'Clients': [clientId],
      created_at: timeAt(pivotT, -45),
    },
  );
  expectedFindings.push(
    {
      subjectType: 'parcel',
      subjectId: dupInvId2, // the second one triggers
      detectedBy: 'DUPLICATE_TRACKING',
      gateway: { preventability: 'UNKNOWN', category: 'CARRIER_BILLING_GLITCH', hasSuggestion: false },
    },
  );

  // 4. SLA_FAILURE — late delivery vs guaranteed transit
  const slaShipId = genId('shp');
  shipments.push({
    id: slaShipId,
    'PRO number': 'GENB-SLA-001',
    'Tracking number': '1ZGENBSLA01',
    'Actual L': 14, 'Actual W': 10, 'Actual H': 8,
    'Actual weight lbs': 5,
    'Ship date': '2026-06-10',
    'Delivery date': '2026-06-19', // 9 days, but guarantee may be 3
    'Service level': '2nd Day Air',
    'Carrier': carrierScac,
    'Destination zip': '10001',
    'Address classification': 'Commercial',
  });
  const slaInvId = genId('inv');
  invoices.push({
    id: slaInvId,
    'Invoice number': 'GENB-SLA-001',
    'Status': 'Open',
    'Amount billed': 35.00,
    'Amount approved': 35.00,
    'Amount disputed': 0,
    'Shipment': [slaShipId],
    'Carrier': [carrierScac],
    'Invoice date': '2026-06-19',
    'Payment due date': '2026-07-19',
    'Clients': [clientId],
    created_at: timeAt(pivotT, -20),
  });
  expectedFindings.push({
    subjectType: 'parcel',
    subjectId: slaInvId,
    detectedBy: 'SLA_FAILURE',
    gateway: { preventability: 'NON_PREVENTABLE_BY_GATEWAY', category: 'LATE_SHIPMENT_RISK', hasSuggestion: false },
  });

  // ── Run-isolation boundary cases ──────────────────────────────

  // Boundary: exactly at pivot T (must be flagged by <= cutoff)
  const atBoundaryInvId = genId('inv');
  const atBoundaryShipId = genId('shp');
  shipments.push({
    id: atBoundaryShipId,
    'PRO number': 'GENB-AT-001',
    'Tracking number': '1ZGENBAT001',
    'Actual L': 10, 'Actual W': 8, 'Actual H': 4,
    'Actual weight lbs': 20, // heavy → dim weight will be lower
    'Ship date': '2026-06-25',
    'Delivery date': '2026-07-01',
    'Service level': 'Ground',
    'Carrier': carrierScac,
    'Destination zip': '60601',
    'Address classification': 'Commercial',
  });
  invoices.push({
    id: atBoundaryInvId,
    'Invoice number': 'GENB-AT-001',
    'Status': 'Open',
    'Amount billed': 22.00,
    'Amount approved': 22.00,
    'Amount disputed': 0,
    'Shipment': [atBoundaryShipId],
    'Carrier': [carrierScac],
    'Invoice date': '2026-07-01',
    'Payment due date': '2026-08-01',
    'Clients': [clientId],
    created_at: pivotT, // exactly at T — must be flagged
  });
  // Heavy shipment with dim weight — DIM_WEIGHT_TRAP should fire
  expectedFindings.push({
    subjectType: 'parcel',
    subjectId: atBoundaryInvId,
    detectedBy: 'DIM_WEIGHT_TRAP',
    gateway: { preventability: 'PREVENTABLE_BY_GATEWAY', category: 'DIM_WEIGHT_PADDING', hasSuggestion: true },
  });

  // After T (must NOT be flagged in this run)
  const afterBoundaryInvId = genId('inv');
  const afterBoundaryShipId = genId('shp');
  shipments.push({
    id: afterBoundaryShipId,
    'PRO number': 'GENB-AFTER-001',
    'Tracking number': '1ZGENBAFT01',
    'Actual L': 20, 'Actual W': 15, 'Actual H': 12,
    'Actual weight lbs': 5,
    'Ship date': '2026-06-25',
    'Delivery date': '2026-07-01',
    'Service level': 'Ground',
    'Carrier': carrierScac,
    'Destination zip': '33101',
    'Address classification': 'Residential',
  });
  invoices.push({
    id: afterBoundaryInvId,
    'Invoice number': 'GENB-AFTER-001',
    'Status': 'Open',
    'Amount billed': 40.00,
    'Amount approved': 40.00,
    'Amount disputed': 0,
    'Shipment': [afterBoundaryShipId],
    'Carrier': [carrierScac],
    'Invoice date': '2026-07-01',
    'Payment due date': '2026-08-01',
    'Clients': [clientId],
    created_at: timeAt(pivotT, 10), // AFTER T — must NOT be flagged
  });
  // NOT added to expectedFindings — must be excluded by run isolation

  // ── Clean (non-anomalous) invoices for volume ─────────────────
  for (let i = 0; i < cleanInvoiceCount; i++) {
    const shipId = genId('shp');
    const invId = genId('inv');
    shipments.push({
      id: shipId,
      'PRO number': `GENB-CLN-${String(i).padStart(4, '0')}`,
      'Tracking number': `1ZGENBCLN${String(i).padStart(4, '0')}`,
      'Actual L': 12, 'Actual W': 10, 'Actual H': 6,
      'Actual weight lbs': 4,
      'Ship date': '2026-06-20',
      'Delivery date': '2026-06-27',
      'Service level': 'Ground',
      'Carrier': carrierScac,
      'Destination zip': '20001',
      'Address classification': 'Commercial',
    });
    invoices.push({
      id: invId,
      'Invoice number': `GENB-CLN-${String(i).padStart(4, '0')}`,
      'Status': 'Open',
      'Amount billed': 10 + i * 0.5,
      'Amount approved': 10 + i * 0.5,
      'Amount disputed': 0,
      'Shipment': [shipId],
      'Carrier': [carrierScac],
      'Invoice date': '2026-06-27',
      'Payment due date': '2026-07-27',
      'Clients': [clientId],
      created_at: timeAt(pivotT, -120 - i), // all before T
    });
  }

  // ── 3PL anomalies ─────────────────────────────────────────────

  // TPL_GHOST_SHIPMENT: billed fulfillment line with no matching client shipment
  const ghostLineId = genId('tplf');
  tplLines.push({
    id: ghostLineId,
    client_id: clientId,
    carrier_scac: carrierScac,
    invoice_cycle: '2026-06',
    order_id: 'GHOST-ORDER-001',
    units_picked: 5,
    base_pick_fee: 2.50,
    additional_pick_fee: 0,
    packaging_fee: 3.00,
    base_freight: 25.00,
    fuel_surcharge: 2.50,
    total_billed: 33.00,
    base_carrier_cost: null,
    match_status: 'unmatched', // no matching shipment → ghost
    audit_status: 'pending',
    created_at: timeAt(pivotT, -90),
  });
  expectedFindings.push({
    subjectType: 'tpl',
    subjectId: ghostLineId,
    detectedBy: 'TPL_GHOST_SHIPMENT',
    gateway: { preventability: 'PREVENTABLE_BY_GATEWAY', category: 'THREE_PL_PICK_PACK_ERROR', hasSuggestion: true },
  });

  // TPL_DUPLICATE: same order billed in multiple cycles
  const dupOrderId = 'DUP-ORDER-001';
  const firstCycleLineId = genId('tplf');
  const secondCycleLineId = genId('tplf');
  tplLines.push(
    {
      id: firstCycleLineId,
      client_id: clientId,
      carrier_scac: carrierScac,
      invoice_cycle: '2026-05',
      order_id: dupOrderId,
      units_picked: 10,
      base_pick_fee: 2.00,
      additional_pick_fee: 0,
      packaging_fee: 5.00,
      base_freight: 30.00,
      fuel_surcharge: 3.00,
      total_billed: 40.00,
      base_carrier_cost: 25.00,
      match_status: 'matched',
      audit_status: 'pending',
      created_at: timeAt(pivotT, -80),
    },
    {
      id: secondCycleLineId,
      client_id: clientId,
      carrier_scac: carrierScac,
      invoice_cycle: '2026-06',
      order_id: dupOrderId,
      units_picked: 0, // duplicate billing — nothing picked
      base_pick_fee: 2.00,
      additional_pick_fee: 0,
      packaging_fee: 5.00,
      base_freight: 30.00,
      fuel_surcharge: 3.00,
      total_billed: 40.00,
      base_carrier_cost: 0,
      match_status: 'matched',
      audit_status: 'pending',
      created_at: timeAt(pivotT, -75),
    },
  );
  expectedFindings.push({
    subjectType: 'tpl',
    subjectId: secondCycleLineId, // the duplicate triggers on the later cycle
    detectedBy: 'TPL_DUPLICATE',
    gateway: { preventability: 'PREVENTABLE_BY_GATEWAY', category: 'DUPLICATE_ORDER_FLOW', hasSuggestion: true },
  });

  // ── Audit job for the run ─────────────────────────────────────

  auditJobs.push({
    id: genId('job'),
    client_id: clientId,
    job_type: 'parcel',
    started_at: pivotT,
    status: 'running',
  });

  return {
    invoices,
    shipments,
    tplFulfillmentLines: tplLines,
    auditJobs,
    expectedFindings,
    pivotT,
  };
}

// ── DB seeding ───────────────────────────────────────────────────

/**
 * Insert a generated corpus directly into the test database.
 * Uses direct SQL for explicit created_at and id values.
 */
export async function seedCorpus(
  pool: Pool,
  corpus: GeneratedCorpus,
): Promise<void> {
  const client = await pool.connect();
  try {
    // Insert shipments
    for (const s of corpus.shipments) {
      const entries = Object.entries(s).filter(([, v]) => v !== undefined);
      const cols = entries.map(([k]) => `"${k}"`).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO "Shipments" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        entries.map(([, v]) => v),
      );
    }

    // Insert client record (required by engine's Clients."Last audit run" update)
    const clientRecord = corpus.invoices[0]?.['Clients'];
    const clientId = Array.isArray(clientRecord) ? clientRecord[0] : undefined;
    if (clientId) {
      await client.query(
        `INSERT INTO "Clients" (id, "Company name", "Contract active")
         VALUES ($1, 'Test Client ' || $1, true)
         ON CONFLICT (id) DO NOTHING`,
        [clientId],
      );
    }

    // Insert invoices (auto-derive client_id from "Clients" array if missing)
    for (const inv of corpus.invoices) {
      // Ensure client_id is set (NOT NULL per migration 0011)
      if (!inv.client_id && Array.isArray(inv['Clients']) && (inv['Clients'] as unknown[]).length > 0) {
        inv.client_id = (inv['Clients'] as unknown[])[0];
      }
      const entries = Object.entries(inv).filter(([, v]) => v !== undefined);
      const cols = entries.map(([k]) => `"${k}"`).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO "Invoices" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        entries.map(([, v]) => v),
      );
    }

    // Insert 3PL lines (tpl_fulfillment_lines uses snake_case columns)
    for (const line of corpus.tplFulfillmentLines) {
      const entries = Object.entries(line).filter(([, v]) => v !== undefined);
      const cols = entries.map(([k]) => `"${k}"`).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO tpl_fulfillment_lines (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        entries.map(([, v]) => v),
      );
    }

    // Insert audit jobs
    for (const job of corpus.auditJobs) {
      const entries = Object.entries(job).filter(([, v]) => v !== undefined);
      const cols = entries.map(([k]) => `"${k}"`).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO audit_jobs (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        entries.map(([, v]) => v),
      );
    }
  } finally {
    client.release();
  }
}
