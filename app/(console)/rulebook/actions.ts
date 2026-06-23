/*
  app/(console)/rulebook/actions.ts — staff-only rulebook editing.

  The rulebook drives the audit engine thresholds with
  contract → carrier → global precedence (see lib/audit/rulebook.ts).
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  createRulebookRow, updateRulebookRow, deleteRulebookRow,
} from '@/lib/audit/rulebook';
import { RULE_KEYS } from '@/lib/audit/rule-keys';

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
}

export type SaveResult = { ok: boolean; error?: string } | undefined;

export async function addRule(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
  await requireStaff();

  const scope = String(formData.get('scope') || '') as 'global' | 'carrier' | 'contract';
  const ruleKey = String(formData.get('ruleKey') || '');
  const meta = RULE_KEYS[ruleKey];
  if (!scope || !meta) return { ok: false, error: 'Pick a scope and rule.' };

  const clientId = String(formData.get('clientId') || '').trim() || null;
  const carrierScac = String(formData.get('carrierScac') || '').trim().toUpperCase() || null;
  const serviceLevel = String(formData.get('serviceLevel') || '').trim() || null;
  const effectiveFrom = String(formData.get('effectiveFrom') || '').trim() || null;
  const effectiveTo = String(formData.get('effectiveTo') || '').trim() || null;
  const clauseRef = String(formData.get('clauseRef') || '').trim() || null;
  const rawValue = String(formData.get('value') || '').trim();

  if (scope === 'carrier' && !carrierScac) return { ok: false, error: 'Carrier override needs a SCAC.' };
  if (scope === 'contract' && !clientId) return { ok: false, error: 'Contract needs a client.' };
  if (meta.serviceScoped && !serviceLevel) return { ok: false, error: `This rule needs a ${meta.serviceLabel || 'service level'}.` };

  let numValue: number | null = null;
  let boolValue: boolean | null = null;
  let textValue: string | null = null;
  if (meta.type === 'num') {
    const n = parseFloat(rawValue);
    if (isNaN(n)) return { ok: false, error: 'Enter a numeric value.' };
    numValue = n;
  } else if (meta.type === 'bool') {
    boolValue = rawValue === 'true';
  } else {
    if (!rawValue) return { ok: false, error: 'Enter a value.' };
    textValue = rawValue;
  }

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
    return { ok: false, error: msg };
  }

  revalidatePath('/rulebook');
  return { ok: true };
}

export async function editRule(
  id: string,
  patch: {
    numValue?: number | null; boolValue?: boolean | null; textValue?: string | null;
    effectiveFrom?: string | null; effectiveTo?: string | null; clauseRef?: string | null;
  }
) {
  await requireStaff();
  await updateRulebookRow(id, patch);
  revalidatePath('/rulebook');
  return { ok: true };
}

export async function removeRule(id: string) {
  await requireStaff();
  await deleteRulebookRow(id);
  revalidatePath('/rulebook');
  return { ok: true };
}
