/*
  app/(console)/users/actions.ts — staff-only user & access management.

  All actions verify the caller is staff before mutating.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { createRecord } from '@/lib/airtable';
import {
  setUserRole, setUserClient, getUserByEmail, createUser, generateTempPassword,
} from '@/lib/users';
import { log, withCorrelationId, generateCorrelationId } from '@/lib/logger';
import { withAction } from '@/lib/action-handler';

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
  return session;
}

// ── change role (client <-> staff) ───────────────────────────
export const changeRole = withAction(
  'users.changeRole',
  async (actionLog, userId: string, role: 'staff' | 'client') => {
    const session = await requireStaff();
    if (session.user?.id === userId && role !== 'staff') {
      return { ok: false, error: 'You can’t remove your own staff access.' };
    }
    await setUserRole(userId, role);
    actionLog.info('user role changed', { userId, role });
    revalidatePath('/users');
    return { ok: true };
  },
);

// ── link / unlink a user to a Client company ─────────────────
export const changeClient = withAction(
  'users.changeClient',
  async (actionLog, userId: string, clientId: string | null) => {
    await requireStaff();
    await setUserClient(userId, clientId || null);
    actionLog.info('user client changed', { userId, clientId });
    revalidatePath('/users');
    return { ok: true };
  },
);

// ── invite a client (create account + temp password) ─────────
export type InviteResult =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string }
  | undefined;

export async function inviteClient(
  _prev: InviteResult,
  formData: FormData
): Promise<InviteResult> {
  return withCorrelationId(generateCorrelationId(), async () => {
    await requireStaff();

    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const existingClientId = String(formData.get('clientId') || '').trim();
    const newCompany = String(formData.get('company') || '').trim();

    if (!name || !email) return { ok: false, error: 'Name and email are required.' };
    if (!existingClientId && !newCompany) {
      return { ok: false, error: 'Pick an existing company or enter a new one.' };
    }

    const dup = await getUserByEmail(email);
    if (dup) return { ok: false, error: 'A user with that email already exists.' };

    let clientId = existingClientId;
    if (!clientId && newCompany) {
      const client = await createRecord('Clients', {
        'Company name': newCompany,
        'Contract active': true,
      });
      clientId = client.id;
    }

    const tempPassword = generateTempPassword();
    await createUser({ email, password: tempPassword, name, role: 'client', clientId });

    log.info('client invited', { email, clientId });
    revalidatePath('/users');
    return { ok: true, email, tempPassword };
  });
}
