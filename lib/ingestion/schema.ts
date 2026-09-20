/*
  lib/ingestion/schema.ts — the universal "lingua franca" schema.

  Every carrier and client data source gets normalized INTO this shape
  before anything touches the audit engine or Airtable.

  Think of this as the contract between ingestion and auditing.
*/

// ── Accessorial fees (line-item charges beyond base rate) ────────
export type AccessorialFee = {
  code: string;          // standardized code (see accessorial-map.ts)
  description: string;
  amount: number;        // USD
};

// ── The normalized invoice (carrier "billed" side) ───────────────
export type NormalizedInvoice = {
  // Identity
  invoiceNumber: string;
  carrierScac: string;           // e.g. "UPSN", "FDXG", "ODFL"
  proNumber?: string;            // LTL PRO number
  trackingNumber?: string;       // parcel tracking

  // Dates
  invoiceDate: string;           // ISO 8601
  paymentDueDate?: string;

  // Charges
  baseFuel: number;              // base line-haul + fuel combined, USD
  accessorialFees: AccessorialFee[];
  totalBilled: number;           // sum of all charges, USD

  // Shipment details (as carrier reported them)
  billedWeight: number;          // lbs — what carrier charged on
  billedWeightType: 'actual' | 'dimensional' | 'minimum';
  dimL?: number;                 // inches, carrier-reported
  dimW?: number;
  dimH?: number;

  // Service
  serviceLevel: string;          // standardized (see service-level-map.ts)
  originZip: string;
  destinationZip: string;
  addressType?: 'commercial' | 'residential' | 'unknown';

  // Ship/delivery
  shipDate?: string;
  deliveredDate?: string;
  deliveryAttempts?: number;

  // Client linkage (resolved after normalization)
  clientId?: string;

  // Raw payload stored for audit trail
  rawSource: 'edi' | 'api' | 'csv' | 'sftp';
  rawPayload: Record<string, unknown>;
};

// ── The normalized shipment (client "expected" side) ─────────────
export type NormalizedShipment = {
  // Identity — used to match against NormalizedInvoice
  trackingNumber?: string;
  proNumber?: string;
  referenceNumber?: string;      // client PO / order number

  carrierScac: string;
  clientId: string;

  // What actually left the warehouse
  actualWeightLbs: number;
  actualL: number;               // inches
  actualW: number;
  actualH: number;

  // Addresses
  originZip: string;
  destinationZip: string;
  addressType: 'commercial' | 'residential' | 'unknown';

  // Service ordered
  serviceLevel: string;
  shipDate: string;
  requestedDeliveryDate?: string;

  // Source system
  source: 'shopify' | 'shipstation' | 'netsuite' | 'wms_csv' | 'generic';
  rawPayload: Record<string, unknown>;
};

// ── Staging record written to Airtable before audit runs ─────────
// Maps 1:1 to the Invoices + Shipments tables but with ingestion metadata.
export type StagedRecord = {
  type: 'invoice' | 'shipment';
  status: 'pending' | 'normalized' | 'audited' | 'error';
  ingestedAt: string;
  data: NormalizedInvoice | NormalizedShipment;
  error?: string;
};
