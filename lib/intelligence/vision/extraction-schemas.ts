/**
 * Document-type-specific extraction schemas.
 *
 * Each schema defines the fields the vision model should extract
 * from a given document type. Schemas are used to:
 *   1. Build the model prompt
 *   2. Validate extraction output structure
 *   3. Route fields to the T2 mapper → policy_rules
 *   4. Weight evaluation metrics (criticality)
 */

import type { ExtractionSchema, DocumentTypeTag } from './extractor-interface';

// ── COI (ACORD 25 Certificate of Liability Insurance) ───────────────

/**
 * ACORD 25 COI extraction schema.
 *
 * Criticality rationale:
 *   3 (coverage-voiding): wrong value = insurance may not apply
 *   2 (material):       wrong value = confusion but insured is still covered
 *   1 (informational):  wrong value = minor, correctable from context
 */
export const COI_EXTRACTION_SCHEMA: ExtractionSchema = {
  documentType: 'COI',
  fields: [
    {
      key: 'insured_name',
      description: 'Name of the insured entity (the named insured on the certificate)',
      criticality: 3,
    },
    {
      key: 'policy_number',
      description: 'Insurance policy number, typically format like CGL-2025-XXXXXX or similar',
      criticality: 3,
    },
    {
      key: 'policy_effective_date',
      description: 'Policy effective/start date in YYYY-MM-DD format',
      criticality: 2,
    },
    {
      key: 'policy_expiration_date',
      description: 'Policy expiration/end date in YYYY-MM-DD format',
      criticality: 2,
    },
    {
      key: 'general_liability_each_occurrence',
      description: 'General liability limit per occurrence (e.g. "$1,000,000")',
      criticality: 3,
    },
    {
      key: 'general_liability_aggregate',
      description: 'General liability aggregate limit (e.g. "$2,000,000")',
      criticality: 3,
    },
    {
      key: 'additional_insured_name',
      description: 'Name of the additional insured entity (certificate holder)',
      criticality: 3,
    },
    {
      key: 'additional_insured_endorsement_date',
      description: 'Date the additional insured endorsement took effect, YYYY-MM-DD format',
      criticality: 2,
    },
    {
      key: 'broker_name',
      description: 'Name of the insurance broker or agency that issued the certificate',
      criticality: 1,
    },
    {
      key: 'handwritten_endorsements',
      description: 'Any handwritten annotations, stamps, or marginalia text on the form (e.g. coverage restrictions noted by hand)',
      criticality: 1,
    },
  ],
};

// ── BOL (Bill of Lading) — placeholder for Phase 1 expansion ────────

export const BOL_EXTRACTION_SCHEMA: ExtractionSchema = {
  documentType: 'BOL',
  fields: [
    {
      key: 'tracking_number',
      description: 'PRO number or tracking number from the BOL',
      criticality: 3,
    },
    {
      key: 'pallet_count',
      description: 'Number of pallets on the shipment',
      criticality: 2,
    },
    {
      key: 'handwritten_annotations',
      description: 'Any handwritten notes, shortage notations, or damage annotations in the margins',
      criticality: 2,
    },
  ],
};

// ── Delivery Receipt — placeholder for Phase 1 expansion ────────────

export const DELIVERY_RECEIPT_SCHEMA: ExtractionSchema = {
  documentType: 'delivery_receipt',
  fields: [
    {
      key: 'tracking_number',
      description: 'Tracking or PRO number on the delivery receipt',
      criticality: 3,
    },
    {
      key: 'delivery_date',
      description: 'Date of delivery in YYYY-MM-DD format',
      criticality: 2,
    },
    {
      key: 'recipient_signature_name',
      description: 'Name of the person who signed for the delivery',
      criticality: 2,
    },
  ],
};

// ── Schema Registry ──────────────────────────────────────────────────

/** All available extraction schemas, keyed by document type tag. */
export const EXTRACTION_SCHEMAS: Record<DocumentTypeTag, ExtractionSchema> = {
  COI: COI_EXTRACTION_SCHEMA,
  BOL: BOL_EXTRACTION_SCHEMA,
  delivery_receipt: DELIVERY_RECEIPT_SCHEMA,
  unknown: { documentType: 'unknown', fields: [] },
};

/** Get the extraction schema for a given document type. */
export function getExtractionSchema(documentType: DocumentTypeTag): ExtractionSchema {
  return EXTRACTION_SCHEMAS[documentType] ?? EXTRACTION_SCHEMAS.unknown;
}
