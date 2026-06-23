/*
  app/(auth)/actions.ts — server actions for login + signup.
*/

'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { createRecord } from '@/lib/airtable';
import { getUserByEmail, createUser } from '@/lib/users';

export type FormState = { error?: string } | undefined;

// ── Login ────────────────────────────────────────────────────
export async function authenticate(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  if (!email || !password) return { error: 'Email and password are required.' };

  try {
    await signIn('credentials', { email, password, redirectTo: '/portal' });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Invalid email or password.' };
    }
    throw err; // re-throw NEXT_REDIRECT and anything else
  }
  return undefined;
}

// ── Signup ───────────────────────────────────────────────────
// Self-service client signup: creates a Client record + a portal user
// linked to it, then signs the user in.
export async function register(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get('name') || '').trim();
  const company = String(formData.get('company') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (!name || !company || !email || !password) {
    return { error: 'All fields are required.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const existing = await getUserByEmail(email);
  if (existing) return { error: 'An account with that email already exists.' };

  // Create the client org this user belongs to
  const client = await createRecord('Clients', {
    'Company name': company,
    'Contract active': true,
  });

  await createUser({
    email,
    password,
    name,
    role: 'client',
    clientId: client.id,
  });

  try {
    await signIn('credentials', { email, password, redirectTo: '/portal' });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Account created, but automatic sign-in failed. Please log in.' };
    }
    throw err;
  }
  return undefined;
}
