/*
  lib/types.ts — types that match your Airtable tables.

  These match the field names in your Airtable base.
  When you read a record with fetchRecords(), the result
  will have these fields. Airtable field names are case-sensitive
  and include spaces — that's normal.
*/

export type AuditResult = {
  id: string;
 
  'Invoice'?: string[];          // link to Invoices
  'Invoice line'?: string[];     // link to Invoice Lines
  'Audit Rules'?: string[];      // link to Audit Rules
  'Outcome'?: 'FLAGGED' | 'PASSED' | 'ERROR';
  'Expected amount'?: number;
  'Billed amount'?: number;
  'Variance'?: number;
  'Notes'?: string;
  'Audited at'?: string;
  'Detected by'?: string;
  'Disputes'?: string[];         // link to Disputes
  'Gateway preventability'?: 'PREVENTABLE_BY_GATEWAY' | 'NON_PREVENTABLE_BY_GATEWAY' | 'UNKNOWN';
  'Gateway category'?: string;
  'Gateway rule suggestion'?: string;
  'Gateway estimated savings'?: number;
  'Gateway confidence'?: number;
  'Gateway signal source'?: 'RULE_DEFAULT' | 'ANALYST_REVIEW' | 'AI_SUGGESTED';
};

export type Dispute = {
  id: string;
  'Dispute ID'?: string;
  'Invoice'?: string[];
  'Audit result'?: string[];
  'Disputed amount'?: number;
  'Status'?: 'Open' | 'In review' | 'Submitted' | 'Escalated' | 'Won' | 'Closed';
  'Opened date'?: string;
  'Filed date'?: string;
  'Carrier response date'?: string;
  'Escalation date'?: string;
  'Escalation reason'?: string;
  'Date resolved'?: string;
  'Recovery amount'?: number;
  'Resolution notes'?: string;
};

export type Invoice = {
  id: string;
  'Invoice number'?: string;
  'Status'?: string;
  'Amount billed'?: number;
  'Amount approved'?: number;
  'Amount disputed'?: number;
  'Shipment'?: string[];
  'Carrier'?: string;
  'Invoice date'?: string;
  'Payment due date'?: string;
  'Clients'?: string[];
};

export type Shipment = {
  id: string;
  'PRO number'?: string;
  'Tracking number'?: string;
  'Actual L'?: number;
  'Actual W'?: number;
  'Actual H'?: number;
  'Actual weight lbs'?: number;
  'Ship date'?: string;
  'Delivery date'?: string;
  'Service level'?: string;
  'Carrier'?: string;
  'Destination zip'?: string;
  'Address classification'?: 'Commercial' | 'Residential' | 'Unknown';
};

export type Client = {
  id: string;
  'Company name'?: string;
  'Contract active'?: boolean;
  'Gain share pct'?: number;
  'Min invoice threshold'?: number;
  'Last audit run'?: string;
};

export type Carrier = {
  id: string;
  'Carrier name'?: string;
  'SCAC'?: string;
  'Contact email'?: string;
};
