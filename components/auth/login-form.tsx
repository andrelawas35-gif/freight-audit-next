'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { authenticate, type FormState } from '@/app/(auth)/actions';
import { Field, SubmitButton, ErrorNote } from './auth-ui';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    authenticate,
    undefined
  );

  return (
    <form action={formAction}>
      <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Sign in</h1>
      <ErrorNote message={state?.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 15 }}>
        No account?{' '}
        <Link href="/signup" style={{ color: 'var(--blue-ink)', fontWeight: 600 }}>
          Create one
        </Link>
      </p>
    </form>
  );
}
