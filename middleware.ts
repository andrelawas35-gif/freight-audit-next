/*
  middleware.ts — route protection via Auth.js + correlation IDs.

  Uses the edge-safe authConfig (no DB / bcrypt) so it can run in the
  Edge runtime. The `authorized` callback in authConfig decides access.

  Every request gets a unique x-correlation-id header propagated to
  downstream API routes and server components for structured logging.
*/

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default auth((req: NextRequest & { auth?: unknown }) => {
  const correlationId = req.headers.get('x-correlation-id') ?? generateId();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
