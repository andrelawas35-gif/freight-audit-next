'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { runThreePLAudit } from '@/lib/audit/3pl-engine';

export type RunResult = { ok: boolean; linesChecked?: number; findingsCreated?: number; totalVariance?: number; error?: string } | undefined;

export async function runThreePLAuditAction(_prev: RunResult, _formData: FormData): Promise<RunResult> {
  const session = await auth();
  if (session?.user?.role !== 'staff') return { ok: false, error: 'Staff access required.' };

  try {
    const summary = await runThreePLAudit({ triggeredBy: session.user?.email ?? null });
    revalidatePath('/console/ingestion/3pl');
    revalidatePath('/console/queue');
    revalidatePath('/console/engine');
    return { ok: true, ...summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
