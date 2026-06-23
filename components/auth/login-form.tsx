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
      <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: '#EDEDEF' }}>Sign in</h1>
      <ErrorNote message={state?.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 16 }}>
        No account?{' '}
        <Link href="/signup" style={{ color: '#4ade80', fontWeight: 600, textDecoration: 'none' }}>
          Create one
        </Link>
      </p>
    </form>
  );
}
