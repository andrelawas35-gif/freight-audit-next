/*
  auth.ts — full Auth.js setup (Node runtime).

  Adds the Credentials provider (email + password) on top of the edge-safe
  authConfig. Exports the helpers used across the app:
    - handlers  → wired into app/api/auth/[...nextauth]/route.ts
    - auth      → read the session in Server Components / actions
    - signIn / signOut → used by login/logout server actions
*/

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { verifyCredentials } from '@/lib/users';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const email = creds?.email ? String(creds.email) : '';
        const password = creds?.password ? String(creds.password) : '';
        if (!email || !password) return null;

        const user = await verifyCredentials(email, password);
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          client_id: user.client_id,
          is_taxonomy_admin: user.is_taxonomy_admin,
        };
      },
    }),
  ],
});
