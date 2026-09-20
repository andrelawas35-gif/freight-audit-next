'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { getSql } from '@/lib/db';
import {
  addPolicyDocument,
  addPolicyRule,
  createPolicy,
  createRuleset,
  runPolicyBacktest,
} from '@/lib/intelligence/policy-service';
import { GATEWAY_ACTIONS } from '@/lib/intelligence/taxonomy';
import {
  POLICY_DOCUMENT_STATUSES,
  POLICY_STATUSES,
  POLICY_TYPES,
} from '@/lib/intelligence/policy-evaluator';
import {
  runVisionPipeline,
  ALLOWED_VISION_MIME_TYPES,
  MAX_VISION_UPLOAD_BYTES,
} from '@/lib/intelligence/vision';
import type { DocumentTypeTag } from '@/lib/intelligence/vision';
import { put } from '@vercel/blob';

export type PolicyActionState = { ok: boolean; error?: string; message?: string } | undefined;

const policySchema = z.object({
  clientId: z.string().min(1, 'Choose a client.'),
  policyType: z.enum(POLICY_TYPES),
  name: z.string().trim().min(2, 'Name the policy.'),
  owner: z.string().trim().optional(),
  effectiveFrom: z.string().trim().optional(),
  effectiveTo: z.string().trim().optional(),
  status: z.enum(POLICY_STATUSES).default('draft'),
  notes: z.string().trim().optional(),
});

const documentSchema = z.object({
  clientId: z.string().min(1),
  policyId: z.string().min(1),
  documentType: z.string().trim().min(2, 'Document type is required.'),
  fileName: z.string().trim().min(2, 'File/source name is required.'),
  sourceUrl: z.string().trim().optional(),
  effectiveFrom: z.string().trim().optional(),
  effectiveTo: z.string().trim().optional(),
  extractionStatus: z.enum(POLICY_DOCUMENT_STATUSES).default('not_started'),
  rawText: z.string().trim().optional(),
  summary: z.string().trim().optional(),
});

const rulesetSchema = z.object({
  clientId: z.string().min(1),
  policyId: z.string().min(1),
  version: z.string().trim().min(1, 'Version is required.'),
  status: z.enum(POLICY_STATUSES).default('draft'),
  effectiveFrom: z.string().trim().optional(),
  effectiveTo: z.string().trim().optional(),
});

const ruleSchema = z.object({
  clientId: z.string().min(1),
  policyId: z.string().min(1),
  rulesetId: z.string().min(1, 'Choose a ruleset.'),
  documentId: z.string().trim().optional(),
  ruleKey: z.string().trim().min(2, 'Rule key is required.'),
  category: z.string().trim().min(2, 'Category is required.'),
  conditionJson: z.string().trim().min(2, 'Condition JSON is required.'),
  actionJson: z.string().trim().min(2, 'Action JSON is required.'),
  severity: z.enum(['info', 'warn', 'block']).default('warn'),
  clauseRef: z.string().trim().optional(),
  status: z.enum(POLICY_STATUSES).default('draft'),
});

const backtestSchema = z.object({
  clientId: z.string().min(1),
  policyId: z.string().min(1),
  rulesetId: z.string().min(1, 'Choose a ruleset.'),
  periodStart: z.string().min(1, 'Start date is required.'),
  periodEnd: z.string().min(1, 'End date is required.'),
});

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
  return session;
}

export async function createPolicyAction(_prev: PolicyActionState, formData: FormData) {
  await requireStaff();
  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  const policyId = await createPolicy({
    clientId: parsed.data.clientId,
    policyType: parsed.data.policyType,
    name: parsed.data.name,
    owner: parsed.data.owner,
    effectiveFrom: parsed.data.effectiveFrom,
    effectiveTo: parsed.data.effectiveTo,
    status: parsed.data.status,
    notes: parsed.data.notes,
  });

  revalidatePath('/policies');
  redirect(`/policies/${policyId}`);
}

export async function addDocumentAction(_prev: PolicyActionState, formData: FormData) {
  const session = await requireStaff();
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  await addPolicyDocument({
    clientId: parsed.data.clientId,
    policyId: parsed.data.policyId,
    documentType: parsed.data.documentType,
    fileName: parsed.data.fileName,
    sourceUrl: parsed.data.sourceUrl,
    effectiveFrom: parsed.data.effectiveFrom,
    effectiveTo: parsed.data.effectiveTo,
    extractionStatus: parsed.data.extractionStatus,
    rawText: parsed.data.rawText,
    summary: parsed.data.summary,
    uploadedBy: session.user.email ?? session.user.id,
  });

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: 'Document added.' };
}

export async function createRulesetAction(_prev: PolicyActionState, formData: FormData) {
  const session = await requireStaff();
  const parsed = rulesetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  try {
    await createRuleset({
      clientId: parsed.data.clientId,
      version: parsed.data.version,
      status: parsed.data.status,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo,
      createdBy: session.user.email ?? session.user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(/unique|duplicate/i.test(msg) ? 'That ruleset version already exists for this client.' : msg);
  }

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: 'Ruleset created.' };
}

export async function addRuleAction(_prev: PolicyActionState, formData: FormData) {
  await requireStaff();
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  let conditionJson: Record<string, unknown>;
  let actionJson: Record<string, unknown>;
  try {
    conditionJson = JSON.parse(parsed.data.conditionJson);
    actionJson = JSON.parse(parsed.data.actionJson);
  } catch {
    return fail('Condition and action must be valid JSON.');
  }

  const decision = String(actionJson.decision || '');
  if (!GATEWAY_ACTIONS.includes(decision as any)) {
    return fail('Action JSON must include a valid decision.');
  }

  await addPolicyRule({
    clientId: parsed.data.clientId,
    policyId: parsed.data.policyId,
    rulesetId: parsed.data.rulesetId,
    documentId: parsed.data.documentId,
    ruleKey: parsed.data.ruleKey,
    category: parsed.data.category,
    conditionJson,
    actionJson: actionJson as any,
    severity: parsed.data.severity,
    clauseRef: parsed.data.clauseRef,
    status: parsed.data.status,
  });

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: 'Rule added.' };
}

export async function runBacktestAction(_prev: PolicyActionState, formData: FormData) {
  await requireStaff();
  const parsed = backtestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);
  if (parsed.data.periodStart > parsed.data.periodEnd) return fail('Start date must be before end date.');

  const result = await runPolicyBacktest({
    clientId: parsed.data.clientId,
    rulesetId: parsed.data.rulesetId,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
  });

  revalidatePolicy(parsed.data.policyId);
  revalidatePath(`/gateway-readiness/${parsed.data.clientId}`);
  return {
    ok: true,
    message: `Backtest complete: ${result.violationsFound} violations across ${result.shipmentsChecked} contexts.`,
  };
}

// ── Attestation & activation ──────────────────────────────────────

const attestSchema = z.object({
  rulesetId: z.string().min(1, 'Ruleset is required.'),
  policyId: z.string().min(1),
  attestedBy: z.string().trim().min(1, 'Name/email of the client authority who confirmed.'),
  attestationNotes: z.string().trim().optional(),
});

const activateSchema = z.object({
  rulesetId: z.string().min(1, 'Ruleset is required.'),
  policyId: z.string().min(1),
});

export async function attestRulesetAction(_prev: PolicyActionState, formData: FormData) {
  await requireStaff();
  const parsed = attestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  const sql = getSql();
  await sql`
    UPDATE policy_rulesets
    SET status = 'client_attested',
        reviewed_by = ${parsed.data.attestedBy},
        activated_at = NOW()
    WHERE id = ${parsed.data.rulesetId}
      AND status = 'draft'
  `;

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: `Ruleset attested by ${parsed.data.attestedBy}.` };
}

export async function activateRulesetAction(_prev: PolicyActionState, formData: FormData) {
  await requireStaff();
  const parsed = activateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  const sql = getSql();

  // Transition ruleset: client_attested → active
  await sql`
    UPDATE policy_rulesets
    SET status = 'active',
        activated_at = NOW()
    WHERE id = ${parsed.data.rulesetId}
      AND status = 'client_attested'
  `;

  // Transition all rules in this ruleset from draft to active,
  // excluding unreviewed CLIENT_DEFINED rules (ADR 0015: staff correctness gate).
  await sql`
    UPDATE policy_rules
    SET status = 'active'
    WHERE ruleset_id = ${parsed.data.rulesetId}
      AND status = 'draft'
      AND NOT (signal_source = 'CLIENT_DEFINED' AND staff_reviewed = FALSE)
  `;

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: 'Ruleset activated.' };
}

function fail(error = 'Invalid request.'): PolicyActionState {
  return { ok: false, error };
}

function revalidatePolicy(policyId: string) {
  revalidatePath('/policies');
  revalidatePath(`/policies/${policyId}`);
  revalidatePath(`/policies/${policyId}/rules`);
  revalidatePath(`/policies/${policyId}/backtests`);
}

// ── Vision Document Upload ──────────────────────────────────────────

const visionUploadSchema = z.object({
  clientId: z.string().min(1),
  policyId: z.string().min(1),
  documentType: z.enum(['COI', 'BOL', 'delivery_receipt', 'unknown'] as const),
  effectiveFrom: z.string().trim().optional(),
  effectiveTo: z.string().trim().optional(),
  summary: z.string().trim().optional(),
});

/**
 * Upload a scanned document image, run vision extraction via Gemini,
 * and persist the results to policy_documents.
 *
 * Flow:
 *   1. Validate staff auth + form data
 *   2. Read file from FormData, validate size + MIME type
 *   3. Upload to Vercel Blob
 *   4. Convert to base64
 *   5. Run vision pipeline (classify → extract → persist)
 */
export async function addVisionDocumentAction(
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  const session = await requireStaff();
  const parsed = visionUploadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  // Read uploaded file
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return fail('Please select a document image to upload.');

  // Validate MIME type
  if (!ALLOWED_VISION_MIME_TYPES.includes(file.type)) {
    return fail(`Unsupported file type: ${file.type}. Allowed: ${ALLOWED_VISION_MIME_TYPES.join(', ')}`);
  }

  // Validate file size
  if (file.size > MAX_VISION_UPLOAD_BYTES) {
    return fail(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: ${MAX_VISION_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  try {
    // Upload to Vercel Blob
    const blob = await put(file.name, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    // Convert file to base64 for Gemini API
    const arrayBuffer = await file.arrayBuffer();
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

    // Run vision pipeline
    const result = await runVisionPipeline({
      clientId: parsed.data.clientId,
      policyId: parsed.data.policyId,
      documentType: parsed.data.documentType as DocumentTypeTag,
      fileName: file.name,
      fileBase64,
      mimeType: file.type,
      storedImageUrl: blob.url,
      uploadedBy: session.user?.email ?? session.user?.id ?? 'unknown',
      effectiveFrom: parsed.data.effectiveFrom ?? null,
      effectiveTo: parsed.data.effectiveTo ?? null,
      summary: parsed.data.summary ?? null,
    });

    revalidatePolicy(parsed.data.policyId);

    if (result.visionExtracted && result.extraction) {
      const readableCount = result.extraction.fields.length;
      const unreadableCount = result.extraction.unreadableFields.length;
      return {
        ok: true,
        message: `Document uploaded and extracted: ${readableCount} fields read, ${unreadableCount} unreadable. Review in the document list.`,
      };
    }

    return {
      ok: true,
      message: 'Document uploaded. Extraction failed — staff review needed.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[addVisionDocumentAction] Upload/extraction failed:', msg);
    return fail(`Upload failed: ${msg.slice(0, 200)}`);
  }
}

// ── Golden Example Management ────────────────────────────────────────

const promoteGoldenSchema = z.object({
  documentId: z.string().min(1),
  policyId: z.string().min(1),
});

/**
 * Promote a vision-extracted document to a golden few-shot example.
 * Fetches the image from Vercel Blob, caches as base64, and marks
 * the document as is_golden_example = true for context injection.
 */
export async function promoteToGoldenExampleAction(
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  await requireStaff();
  const parsed = promoteGoldenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  const sql = getSql();

  // Fetch the document to get stored_image_url and extracted_fields
  const [doc] = await sql.query(
    `SELECT id, stored_image_url, extracted_fields
     FROM policy_documents
     WHERE id = $1`,
    [parsed.data.documentId],
  ) as Array<{ id: string; stored_image_url: string | null; extracted_fields: unknown }>;

  if (!doc) return fail('Document not found.');
  if (!doc.stored_image_url) return fail('Document has no stored image — cannot promote as golden example.');
  if (!doc.extracted_fields) return fail('Document has no extracted fields — run extraction first.');

  try {
    // Fetch image from blob storage and encode to base64
    const response = await fetch(doc.stored_image_url);
    if (!response.ok) return fail(`Failed to fetch image from storage: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64');

    // Mark as golden example with cached base64
    await sql.query(
      `UPDATE policy_documents
       SET is_golden_example = true,
           image_base64 = $1
       WHERE id = $2`,
      [imageBase64, parsed.data.documentId],
    );

    // Count total golden examples for this document type
    const [countRow] = await sql.query(
      `SELECT COUNT(*)::int AS count
       FROM policy_documents
       WHERE is_golden_example = true
         AND document_type = (SELECT document_type FROM policy_documents WHERE id = $1)`,
      [parsed.data.documentId],
    ) as Array<{ count: number }>;

    revalidatePolicy(parsed.data.policyId);

    const examplesWord = countRow.count === 1 ? 'example' : 'examples';
    return {
      ok: true,
      message: `Document promoted to golden example. ${countRow.count} ${examplesWord} active for this document type.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[promoteToGoldenExampleAction] Failed:', msg);
    return fail(`Promotion failed: ${msg.slice(0, 200)}`);
  }
}

/**
 * Demote a golden example back to a regular document.
 */
export async function demoteGoldenExampleAction(
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  await requireStaff();
  const parsed = promoteGoldenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);

  const sql = getSql();
  await sql.query(
    `UPDATE policy_documents
     SET is_golden_example = false,
         image_base64 = NULL
     WHERE id = $1`,
    [parsed.data.documentId],
  );

  revalidatePolicy(parsed.data.policyId);
  return { ok: true, message: 'Document removed from golden examples.' };
}
