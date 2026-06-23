/*
  lib/users.ts — data access for portal user accounts (app_users table).

  Server-only. Uses the same Neon connection as lib/airtable.ts.
  Passwords are bcrypt-hashed; we never store or return plaintext.
*/

import bcrypt from 'bcryptjs';
import { getSql } from '@/lib/db';

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

// ── admin: list / manage users ───────────────────────────────
export type AdminUser = AppUser & {
  client_name: string | null;
  created_at: string;
};

export async function listUsers(limit = 200): Promise<AdminUser[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT u.id, u.email, u.name, u.role, u.client_id,
            c."Company name" AS client_name, u.created_at
       FROM app_users u
       LEFT JOIN "Clients" c ON c.id = u.client_id
      ORDER BY u.created_at DESC
      LIMIT $1`,
    [limit]
  )) as AdminUser[];
}

export async function setUserRole(id: string, role: 'staff' | 'client'): Promise<void> {
  const sql = getSql();
  await sql.query('UPDATE app_users SET role = $1 WHERE id = $2', [role, id]);
}

export async function setUserClient(id: string, clientId: string | null): Promise<void> {
  const sql = getSql();
  await sql.query('UPDATE app_users SET client_id = $1 WHERE id = $2', [clientId, id]);
}

export function generateTempPassword(): string {
  // readable-ish, 12 chars
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
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
