'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { register, type FormState } from '@/app/(auth)/actions';
import { Field, SubmitButton, ErrorNote } from './auth-ui';

export function SignupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    register,
    undefined
  );

  return (
    <form action={formAction}>
      <h1 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Create your account</h1>
      <ErrorNote message={state?.error} />
      <Field label="Your name" name="name" autoComplete="name" placeholder="Jane Doe" />
      <Field label="Company" name="company" autoComplete="organization" placeholder="Acme Logistics" />
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" />
      <Field label="Password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 15 }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--blue-ink)', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
