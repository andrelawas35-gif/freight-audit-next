/*
  lib/users.ts — data access for portal user accounts (app_users table).

  Server-only. Uses the same Neon connection as lib/airtable.ts.
  Passwords are bcrypt-hashed; we never store or return plaintext.
*/

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;          // 'client' | 'staff'
  client_id: string | null;
};

type UserRow = AppUser & { password_hash: string };

// ── lookups ──────────────────────────────────────────────────
export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const sql = getSql();
  const rows = (await sql.query(
    'SELECT id, email, name, role, client_id, password_hash FROM app_users WHERE lower(email) = lower($1) LIMIT 1',
    [email]
  )) as UserRow[];
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const sql = getSql();
  const rows = (await sql.query(
    'SELECT id, email, name, role, client_id FROM app_users WHERE id = $1 LIMIT 1',
    [id]
  )) as AppUser[];
  return rows[0] ?? null;
}

// ── account creation ─────────────────────────────────────────
export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
  role?: string;
  clientId?: string | null;
}): Promise<AppUser> {
  const sql = getSql();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const rows = (await sql.query(
    `INSERT INTO app_users (email, password_hash, name, role, client_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, client_id`,
    [
      input.email.trim().toLowerCase(),
      passwordHash,
      input.name?.trim() || null,
      input.role || 'client',
      input.clientId ?? null,
    ]
  )) as AppUser[];
  return rows[0];
}

// ── credential check ─────────────────────────────────────────
export async function verifyCredentials(
  email: string,
  password: string
): Promise<AppUser | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  // Strip the hash before returning
  const { password_hash, ...safe } = user;
  return safe;
}
