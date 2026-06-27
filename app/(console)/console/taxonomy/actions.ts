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

async function requireTaxonomyAdmin() {
  const session = await auth();
  if (session?.user?.role !== 'staff') return null;
  if (!session.user.isTaxonomyAdmin) return null;
  return session;
}

// ── Schema ──────────────────────────────────────────────────────────

const promoteSchema = z.object({
  candidateId: z.string().trim().min(1),
});

const rejectSchema = z.object({
  candidateId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
});

// ── Promote (taxonomy_admin only) ───────────────────────────────────

export async function promoteCandidateAction(
  candidateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireTaxonomyAdmin();
  if (!session) {
    return { ok: false, error: 'Taxonomy admin access required. Staff without the taxonomy_admin flag cannot promote candidates.' };
  }

  const parsed = promoteSchema.safeParse({ candidateId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const sql = await getSql();
  await sql`
    UPDATE policy_taxonomy_candidates
    SET lifecycle_status = 'extractable',
        promoted_by = ${session.user.id},
        promoted_at = NOW(),
        updated_at = NOW()
    WHERE id = ${parsed.data.candidateId}
      AND deleted_at IS NULL
      AND lifecycle_status = 'captured'
  `;

  revalidatePath('/console/taxonomy');
  return { ok: true };
}

// ── Reject (staff can reject; taxonomy_admin can reject) ────────────

export async function rejectCandidateAction(
  candidateId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) {
    return { ok: false, error: 'Staff access required.' };
  }

  const parsed = rejectSchema.safeParse({ candidateId, reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const sql = await getSql();
  await sql`
    UPDATE policy_taxonomy_candidates
    SET lifecycle_status = 'rejected',
        rejected_by = ${session.user.id},
        rejected_at = NOW(),
        reject_reason = ${parsed.data.reason},
        updated_at = NOW()
    WHERE id = ${parsed.data.candidateId}
      AND deleted_at IS NULL
      AND lifecycle_status = 'captured'
  `;

  revalidatePath('/console/taxonomy');
  return { ok: true };
}
