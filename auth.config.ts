/*
  auth.config.ts — edge-safe Auth.js config.

  This file is imported by middleware (which runs in the Edge runtime), so it
  must NOT import anything Node-only (no bcrypt, no DB driver). The actual
  Credentials provider with DB lookups is added in auth.ts.

  The `authorized` callback here is what protects routes:
    - /login, /signup           → public (redirect away if already signed in)
    - /portal/*                 → any signed-in user (clients + staff)
    - everything else (console) → staff only
*/

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  // Trust the deployment host (required for self-hosted / `next start`;
  // Vercel sets this automatically, but being explicit is safe everywhere).
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  providers: [], // real providers are added in auth.ts (keeps this edge-safe)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as { role?: string } | undefined)?.role;
      const { pathname } = nextUrl;

      const isAuthPage =
        pathname.startsWith('/login') || pathname.startsWith('/signup');

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(
            new URL(role === 'staff' ? '/' : '/portal', nextUrl)
          );
        }
        return true;
      }

      if (!isLoggedIn) return false; // → redirected to signIn page

      // Portal is open to any authenticated user
      if (pathname.startsWith('/portal')) return true;

      // Everything else is the staff console — staff only
      if (role !== 'staff') {
        return Response.redirect(new URL('/portal', nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          id?: string;
          role?: string;
          client_id?: string | null;
          clientId?: string | null;
        };
        token.id = u.id ?? token.id;
        token.role = u.role ?? 'client';
        token.clientId = u.client_id ?? u.clientId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? 'client';
        session.user.clientId = (token.clientId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
