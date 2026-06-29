/*
  app/(console)/rulebook/actions.ts — staff-only rulebook editing.

  The rulebook drives the audit engine thresholds with
  contract → carrier → global precedence (see lib/audit/rulebook.ts).
*/

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import {
  createRulebookRow, updateRulebookRow, deleteRulebookRow,
} from '@/lib/audit/rulebook';
import { RULE_KEYS } from '@/lib/audit/rule-keys';
import { log, withCorrelationId, generateCorrelationId } from '@/lib/logger';
import { withAction } from '@/lib/action-handler';

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
}

export type SaveResult = { ok: boolean; error?: string } | undefined;

const scopeSchema = z.enum(['global', 'carrier', 'contract']);

const clientIdSchema = z
  .string()
  .trim()
  .regex(/^rec[A-Za-z0-9]{14,32}$/, 'Invalid client ID.');

const carrierScacSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,15}$/, 'Invalid carrier SCAC.'));

const rulebookIdSchema = z
  .string()
  .trim()
  .regex(/^rb[A-Za-z0-9]{8,64}$/, 'Invalid rule ID.');

const ruleKeySchema = z
  .string()
  .trim()
  .refine((value) => Object.prototype.hasOwnProperty.call(RULE_KEYS, value), 'Pick a rule.');

const requiredRuleValueSchema = z.string().trim().min(1, 'Enter a value.').max(4000, 'Value is too long.');

const optionalClientIdSchema = z.preprocess(normalizeOptionalString, clientIdSchema.nullable());
const optionalCarrierScacSchema = z.preprocess(normalizeOptionalString, carrierScacSchema.nullable());
const optionalTextSchema = (max: number, message: string) =>
  z.preprocess(normalizeOptionalString, z.string().max(max, message).nullable());
const optionalDateSchema = z.preprocess(
  normalizeOptionalString,
  z.string().refine(isValidIsoDate, 'Enter a valid date.').nullable(),
);

const addRuleSchema = z.object({
  scope: scopeSchema,
  ruleKey: ruleKeySchema,
  clientId: optionalClientIdSchema,
  carrierScac: optionalCarrierScacSchema,
  serviceLevel: optionalTextSchema(80, 'Service level is too long.'),
  effectiveFrom: optionalDateSchema,
  effectiveTo: optionalDateSchema,
  clauseRef: optionalTextSchema(200, 'Clause reference is too long.'),
  value: requiredRuleValueSchema,
});

const editPatchSchema = z.object({
  numValue: z.number().finite().nonnegative('Numeric value must be zero or greater.').nullable().optional(),
  boolValue: z.boolean().nullable().optional(),
  textValue: z.string().trim().min(1, 'Enter a value.').max(200, 'Text value is too long.').nullable().optional(),
  effectiveFrom: optionalDateSchema.optional(),
  effectiveTo: optionalDateSchema.optional(),
  clauseRef: optionalTextSchema(200, 'Clause reference is too long.').optional(),
}).strict().superRefine((patch, ctx) => {
  if (patch.effectiveFrom && patch.effectiveTo && patch.effectiveFrom > patch.effectiveTo) {
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Effective to must be on or after effective from.' });
  }
});

function fail(error = 'Invalid request.'): SaveResult {
  return { ok: false, error };
}

function normalizeOptionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseRuleValue(ruleKey: string, rawValue: string) {
  const meta = RULE_KEYS[ruleKey];
  if (!meta) return { ok: false as const, error: 'Pick a rule.' };

  if (meta.type === 'num') {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false as const, error: 'Enter a numeric value of zero or greater.' };
    }
    return { ok: true as const, numValue: value, boolValue: null, textValue: null };
  }

  if (meta.type === 'bool') {
    if (rawValue !== 'true' && rawValue !== 'false') {
      return { ok: false as const, error: 'Choose true or false.' };
    }
    return { ok: true as const, numValue: null, boolValue: rawValue === 'true', textValue: null };
  }

  if (meta.options && !meta.options.includes(rawValue)) {
    return { ok: false as const, error: 'Choose a valid value.' };
  }

  return { ok: true as const, numValue: null, boolValue: null, textValue: rawValue };
}

export async function addRule(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
  return withCorrelationId(generateCorrelationId(), async () => {
    await requireStaff();

    const parsed = addRuleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const { scope, ruleKey, clientId, effectiveFrom, effectiveTo, clauseRef } = parsed.data;
    const meta = RULE_KEYS[ruleKey];
    const carrierScac = scope === 'global' ? null : parsed.data.carrierScac;
    const serviceLevel = parsed.data.serviceLevel;

    if (scope === 'carrier' && !carrierScac) return fail('Carrier override needs a SCAC.');
    if (scope === 'contract' && !clientId) return fail('Contract needs a client.');
    if (meta.serviceScoped && !serviceLevel) return fail(`This rule needs a ${meta.serviceLabel || 'service level'}.`);
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) return fail('Effective to must be on or after effective from.');

    const value = parseRuleValue(ruleKey, parsed.data.value);
    if (!value.ok) return fail(value.error);

    const { numValue, boolValue, textValue } = value;

    try {
      await createRulebookRow({
        scope,
        clientId: scope === 'contract' ? clientId : null,
        carrierScac: scope === 'global' ? null : carrierScac,
        serviceLevel,
        ruleKey,
        numValue,
        boolValue,
        textValue,
        effectiveFrom,
        effectiveTo,
        clauseRef,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) {
        return { ok: false, error: 'A matching rule already exists (same scope/carrier/client/service/dates).' };
      }
      log.error('rulebook addRule failed', { err: err as Error, scope, ruleKey });
      return { ok: false, error: msg };
    }

    log.info('rulebook rule added', { scope, ruleKey, carrierScac, clientId });
    revalidatePath('/console/rulebook');
    return { ok: true };
  });
}

export const editRule = withAction(
  'rulebook.editRule',
  async (actionLog, id: string, patch: {
    numValue?: number | null; boolValue?: boolean | null; textValue?: string | null;
    effectiveFrom?: string | null; effectiveTo?: string | null; clauseRef?: string | null;
  }) => {
    await requireStaff();
    await updateRulebookRow(id, patch);
    actionLog.info('rulebook rule edited', { ruleId: id });
    revalidatePath('/console/rulebook');
    return { ok: true };
  },
);

export const removeRule = withAction(
  'rulebook.removeRule',
  async (actionLog, id: string) => {
    await requireStaff();
    await deleteRulebookRow(id);
    actionLog.info('rulebook rule removed', { ruleId: id });
    revalidatePath('/console/rulebook');
    return { ok: true };
  },
);
