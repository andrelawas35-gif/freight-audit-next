/*
  lib/ingestion/edi/parser.ts

  Parses EDI 210 (Motor Carrier Freight Invoice) into a raw structured object.
  EDI is ~ segment-delimited text. Each segment starts with a 2-3 char ID.

  This parser handles the common case. For production, replace this with
  a Stedi or Orderful webhook that delivers pre-parsed JSON — this gives
  you a fallback for carriers that send raw EDI directly.

  EDI 210 key segments:
    ISA  — interchange envelope (sender/receiver IDs)
    GS   — functional group header
    ST   — transaction set header (210 = freight invoice)
    B3   — beginning segment (invoice number, date, SCAC)
    C3   — currency (usually USD)
    N1   — name segment (BT=bill-to, SF=ship-from, ST=ship-to)
    N3   — street address
    N4   — city/state/zip
    L0   — line item quantity / weight
    L1   — rate / charge description
    L5   — description / commodity
    L7   — tariff reference
    SE   — transaction set trailer
*/

export type EdiRawInvoice = {
  interchangeSenderId: string;
  scac: string;
  invoiceNumber: string;
  invoiceDate: string;       // YYYYMMDD
  proNumber: string;
  shipDate: string;
  totalCharges: number;
  currency: string;
  originZip: string;
  destinationZip: string;
  lineItems: EdiLineItem[];
  rawSegments: string[][];
};

export type EdiLineItem = {
  code: string;              // L1 freight charge code
  description: string;
  amount: number;
  weight?: number;
  weightUnit?: string;
};

const SEGMENT_DELIMITER = '~';
const ELEMENT_DELIMITER = '*';

export function parseEdi210(raw: string): EdiRawInvoice {
  const segments = raw
    .split(SEGMENT_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(ELEMENT_DELIMITER));

  const result: Partial<EdiRawInvoice> & { lineItems: EdiLineItem[]; rawSegments: string[][] } = {
    lineItems: [],
    rawSegments: segments,
    currency: 'USD',
    originZip: '',
    destinationZip: '',
    interchangeSenderId: '',
    scac: '',
    invoiceNumber: '',
    invoiceDate: '',
    proNumber: '',
    shipDate: '',
    totalCharges: 0,
  };

  // Track which N1 party we're currently reading addresses for
  let currentParty: string | null = null;

  for (const seg of segments) {
    const id = seg[0];

    if (id === 'ISA') {
      result.interchangeSenderId = seg[6]?.trim() ?? '';
    }

    if (id === 'B3') {
      // B3*invoice_num**date**SCAC*pro*ship_date*...
      result.invoiceNumber = seg[2] ?? '';
      result.invoiceDate   = seg[4] ?? '';
      result.scac          = seg[5] ?? '';
      result.proNumber     = seg[6] ?? '';
      result.shipDate      = seg[7] ?? '';
    }

    if (id === 'N1') {
      currentParty = seg[1]; // BT, SF, ST
    }

    if (id === 'N4' && currentParty) {
      const zip = (seg[3] ?? '').substring(0, 5);
      if (currentParty === 'SF') result.originZip = zip;
      if (currentParty === 'ST') result.destinationZip = zip;
    }

    if (id === 'L1') {
      // L1*quantity*unit*rate*charges*type*code*description
      const amount = parseFloat(seg[4] ?? '0');
      const code   = seg[6] ?? '';
      const desc   = seg[7] ?? '';
      if (!isNaN(amount)) {
        result.lineItems.push({ code, description: desc, amount });
      }
    }

    if (id === 'L0') {
      // L0*lading*weight*weight_qualifier
      const weight = parseFloat(seg[2] ?? '0');
      const unit   = seg[3] ?? 'LB';
      // Attach weight to last line item if present
      if (result.lineItems.length > 0 && !isNaN(weight)) {
        result.lineItems[result.lineItems.length - 1].weight = weight;
        result.lineItems[result.lineItems.length - 1].weightUnit = unit;
      }
    }
  }

  // Sum all L1 charges as total if not explicitly set
  result.totalCharges = result.lineItems.reduce((sum, li) => sum + li.amount, 0);

  return result as EdiRawInvoice;
}

// Convert YYYYMMDD → ISO 8601
export function ediDateToIso(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
