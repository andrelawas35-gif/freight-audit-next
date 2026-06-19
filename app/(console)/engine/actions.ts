/*
  app/(console)/engine/actions.ts — trigger the audit engine from the console.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { runAudit } from '@/lib/audit/engine';
import { recordRun } from '@/lib/audit/runs';
import { fetchRecord } from '@/lib/airtable';
import type { Client } from '@/lib/types';

export type TriggerResult = {
  ok: boolean;
  invoicesChecked?: number;
  findingsCreated?: number;
  totalVariance?: number;
  errors?: string[];
  error?: string;
};

export async function triggerAudit(
  _prev: TriggerResult | undefined,
  formData: FormData
): Promise<TriggerResult> {
  const session = await auth();
  if (session?.user?.role !== 'staff') {
    return { ok: false, error: 'Staff access required.' };
  }

  const clientIdRaw = String(formData.get('clientId') || '').trim();
  const clientId = clientIdRaw || undefined;
  const dryRun = formData.get('dryRun') === 'on';

  // Resolve a friendly client name for the run log (best-effort)
  let clientName: string | null = null;
  if (clientId) {
    try {
      const c = (await fetchRecord('Clients', clientId)) as Client;
      clientName = c?.['Company name'] ?? null;
    } catch {
      /* ignore */
    }
  }

  try {
    const summary = await runAudit({ clientId, dryRun });

    await recordRun({
      clientId: clientId ?? null,
      clientName: clientId ? clientName : 'All clients',
      dryRun,
      status: 'success',
      invoicesChecked: summary.invoicesChecked,
      findingsCreated: summary.findingsCreated,
      totalVariance: summary.totalVariance,
      errors: summary.errors,
      triggeredBy: session.user?.email ?? null,
    });

    revalidatePath('/engine');
    revalidatePath('/queue');
    revalidatePath('/');

    return {
      ok: true,
      invoicesChecked: summary.invoicesChecked,
      findingsCreated: summary.findingsCreated,
      totalVariance: summary.totalVariance,
      errors: summary.errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRun({
      clientId: clientId ?? null,
      clientName: clientId ? clientName : 'All clients',
      dryRun,
      status: 'error',
      invoicesChecked: 0,
      findingsCreated: 0,
      totalVariance: 0,
      errors: [message],
      triggeredBy: session.user?.email ?? null,
    });
    revalidatePath('/engine');
    return { ok: false, error: message };
  }
}
