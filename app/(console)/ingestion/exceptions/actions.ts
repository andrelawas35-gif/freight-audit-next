/*
  app/(console)/ingestion/exceptions/actions.ts
  Staff-only: resolve an unmapped-code exception (writes a learned mapping +
  clears the queue) or dismiss it.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { resolveException, dismissException, setExceptionSuggestion, listExceptions, loadLearnedMappings } from '@/lib/ingestion/mappings';
import { suggestMapping, clerkEnabled } from '@/lib/ingestion/data-clerk';

async function staffEmail() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
  return session.user?.email ?? 'staff';
}

export async function resolveExceptionAction(id: string, standardCode: string) {
  const by = await staffEmail();
  if (!standardCode.trim()) return { ok: false, error: 'Pick a standard code.' };
  await resolveException(id, standardCode.trim(), by);
  revalidatePath('/ingestion/exceptions');
  revalidatePath('/ingestion');
  return { ok: true };
}

export async function dismissExceptionAction(id: string) {
  const by = await staffEmail();
  await dismissException(id, by);
  revalidatePath('/ingestion/exceptions');
  return { ok: true };
}

// On-demand AI Data Clerk suggestion for a single exception (suggest-only).
export async function suggestExceptionAction(id: string) {
  await staffEmail();
  if (!clerkEnabled()) {
    return { ok: false, error: 'AI suggestions are off — set ANTHROPIC_API_KEY to enable.' };
  }
  const rows = await listExceptions('open', 500);
  const exc = rows.find((r) => r.id === id);
  if (!exc) return { ok: false, error: 'Exception not found.' };

  const learned = await loadLearnedMappings().catch(() => []);
  const s = await suggestMapping({
    mappingType: exc.mapping_type,
    carrierScac: exc.carrier_scac,
    rawCode: exc.raw_code,
    examples: learned,
  });
  if (!s) return { ok: false, error: 'No suggestion returned.' };

  await setExceptionSuggestion(id, s.standardCode, s.reasoning, s.confidence);
  revalidatePath('/ingestion/exceptions');
  return { ok: true, ...s };
}
