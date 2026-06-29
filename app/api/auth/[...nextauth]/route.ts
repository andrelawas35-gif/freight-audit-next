/*
  app/api/auth/[...nextauth]/route.ts
  Auth.js endpoint handlers (sign in/out, session, csrf, callbacks).
*/

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
