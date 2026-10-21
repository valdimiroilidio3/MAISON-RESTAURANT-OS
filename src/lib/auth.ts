import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { get, all, run, transaction, bool } from "./db";
import { verifyPassword, newToken } from "./password";
import { nowIso } from "./dates";
import type { Role, SessionUser } from "./types";
import { getRestaurant } from "./restaurant";

export { getRestaurant };

export const SESSION_COOKIE = "maison_session";
const SESSION_HOURS = 10;

export interface UserRow {
  id: number;
  restaurant_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: number;
  restaurant_name: string;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = get<{
    id: number;
    name: string;
    email: string;
    role: Role;
    restaurant_id: number;
    restaurant_name: string;
    expires_at: string;
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.restaurant_id, r.name AS restaurant_name, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN restaurants r ON r.id = u.restaurant_id
     WHERE s.id = ? AND u.active = 1`,
    token,
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", token);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/admin?denied=1");
  return user;
}

export function can(user: SessionUser | null, ...roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}

export async function signIn(email: string, password: string, userAgent = ""): Promise<SessionUser | null> {
  const row = get<UserRow>(
    `SELECT u.*, r.name AS restaurant_name FROM users u
     JOIN restaurants r ON r.id = u.restaurant_id
     WHERE lower(u.email) = lower(?)`,
    email.trim(),
  );
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  const token = newToken(32);
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  transaction(() => {
    run(
      "INSERT INTO sessions (id,user_id,expires_at,created_at,user_agent) VALUES (?,?,?,?,?)",
      token,
      row.id,
      expires.toISOString(),
      nowIso(),
      userAgent.slice(0, 200),
    );
    run(
      "INSERT INTO audit_log (restaurant_id,actor_id,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)",
      row.restaurant_id,
      row.id,
      "auth.login",
      "session",
      token.slice(0, 8),
      `${row.name} iniciou sessão (${row.role})`,
      nowIso(),
    );
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
  };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = get<{ user_id: number }>("SELECT user_id FROM sessions WHERE id = ?", token);
    run("DELETE FROM sessions WHERE id = ?", token);
    if (session) {
      run(
        "INSERT INTO audit_log (restaurant_id,actor_id,action,entity,entity_id,detail,created_at) SELECT restaurant_id, id, 'auth.logout', 'session', ?, 'Sessão terminada', ? FROM users WHERE id = ?",
        token.slice(0, 8),
        nowIso(),
        session.user_id,
      );
    }
  }
  jar.delete(SESSION_COOKIE);
}

export async function ensureNotSignedIn(): Promise<void> {
  const user = await getSessionUser();
  if (user) redirect("/admin");
}

export function listStaff(restaurantId: number) {
  return all<{ id: number; name: string; role: Role }>(
    "SELECT id, name, role FROM users WHERE restaurant_id = ? AND active = 1 ORDER BY role, name",
    restaurantId,
  );
}
