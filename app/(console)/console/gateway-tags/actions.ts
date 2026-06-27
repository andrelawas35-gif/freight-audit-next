'use server';

import { z } from 'zod';
import { getSql } from '@/lib/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') return null;
  return session;
}

// ── Schema ──────────────────────────────────────────────────────
const updateGatewayTagSchema = z.object({
  auditResultId: z.string().trim().min(1),
  preventability: z.enum(['PREVENTABLE_BY_GATEWAY', 'NON_PREVENTABLE_BY_GATEWAY', 'UNKNOWN']),
  category: z.string().trim().nullish(),
  ruleSuggestion: z.string().trim().max(2000).nullish(),
});

export type GatewayTagResult =
  | { ok: true; data: { id: string; preventability: string } }
  | { ok: false; error: string };

// ── Actions ─────────────────────────────────────────────────────

export async function updateGatewayTag(
  auditResultId: string,
  preventability: 'PREVENTABLE_BY_GATEWAY' | 'NON_PREVENTABLE_BY_GATEWAY' | 'UNKNOWN',
  category?: string | null,
  ruleSuggestion?: string | null,
): Promise<GatewayTagResult> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: 'Staff access required.' };

  const parsed = updateGatewayTagSchema.safeParse({ auditResultId, preventability, category, ruleSuggestion });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' };

  const sql = await getSql();
  await sql`
    UPDATE "Audit Results"
    SET
      "Gateway preventability" = ${parsed.data.preventability},
      "Gateway category" = ${parsed.data.category ?? null},
      "Gateway rule suggestion" = ${parsed.data.ruleSuggestion ?? null}
    WHERE id = ${parsed.data.auditResultId}
  `;

  revalidatePath('/gateway-tags');
  return { ok: true, data: { id: auditResultId, preventability } };
}

export async function bulkConfirmGatewayTags(
  auditResultIds: string[],
): Promise<{ ok: boolean; confirmed: number; error?: string }> {
  const session = await requireStaff();
  if (!session) return { ok: false, confirmed: 0, error: 'Staff access required.' };

  if (!auditResultIds.length) return { ok: false, confirmed: 0, error: 'No IDs provided.' };

  const sql = await getSql();
  await sql`
    UPDATE "Audit Results"
    SET "Gateway category" = 'confirmed'
    WHERE id = ANY(${auditResultIds})
      AND "Gateway preventability" IS NOT NULL
  `;

  revalidatePath('/gateway-tags');
  return { ok: true, confirmed: auditResultIds.length };
}
