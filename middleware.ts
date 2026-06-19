/*
  middleware.ts — route protection via Auth.js.

  Uses the edge-safe authConfig (no DB / bcrypt) so it can run in the
  Edge runtime. The `authorized` callback in authConfig decides access.
*/

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  // (API ingest/audit routes have their own secret-based auth.)
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
