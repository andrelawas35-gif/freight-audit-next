/*
  types/next-auth.d.ts — augment Auth.js session + JWT with our custom fields.
*/

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      clientId: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    clientId: string | null;
  }
}
