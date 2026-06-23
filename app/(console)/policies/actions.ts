'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
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

function fail(error = 'Invalid request.'): PolicyActionState {
  return { ok: false, error };
}

function revalidatePolicy(policyId: string) {
  revalidatePath('/policies');
  revalidatePath(`/policies/${policyId}`);
  revalidatePath(`/policies/${policyId}/rules`);
  revalidatePath(`/policies/${policyId}/backtests`);
}
