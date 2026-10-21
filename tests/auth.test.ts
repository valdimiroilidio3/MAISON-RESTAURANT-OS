import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
let lastCookieOptions: Record<string, unknown> | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, value);
      lastCookieOptions = options ?? null;
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

import { all, get, run } from "@/lib/db";
import { can, getSessionUser, requireRole, requireUser, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, newToken, verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/types";

function sessionFor(email: string, overrides: { expiresAt?: string; userId?: number } = {}) {
  const user = get<{ id: number }>("SELECT id FROM users WHERE email = ?", email);
  if (!user) throw new Error(`missing seeded user ${email}`);
  const token = newToken(24);
  run(
    "INSERT INTO sessions (id,user_id,expires_at,created_at,user_agent) VALUES (?,?,?,?,?)",
    token,
    overrides.userId ?? user.id,
    overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    new Date().toISOString(),
    "vitest",
  );
  jar.set(SESSION_COOKIE, token);
  return token;
}

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const stored = hashPassword("Maison!2026");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("Maison!2026");
    expect(verifyPassword("Maison!2026", stored)).toBe(true);
    expect(verifyPassword("maison!2026", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("salts every hash so identical passwords differ on disk", () => {
    const a = hashPassword("Maison!2026");
    const b = hashPassword("Maison!2026");
    expect(a).not.toBe(b);
    expect(verifyPassword("Maison!2026", a)).toBe(true);
    expect(verifyPassword("Maison!2026", b)).toBe(true);
  });

  it("fails closed on malformed or truncated hashes", () => {
    expect(verifyPassword("Maison!2026", "")).toBe(false);
    expect(verifyPassword("Maison!2026", "plain-text")).toBe(false);
    expect(verifyPassword("Maison!2026", "scrypt$16384$deadbeef")).toBe(false);
    expect(verifyPassword("Maison!2026", "bcrypt$16384$salt$hash")).toBe(false);
  });
});

describe("seeded credentials", () => {
  it("hashes every demo password and stores no plaintext", () => {
    const users = all<{ email: string; password_hash: string; role: Role; active: number }>(
      "SELECT email, password_hash, role, active FROM users ORDER BY id",
    );
    expect(users.length).toBeGreaterThanOrEqual(5);
    for (const user of users) {
      expect(user.active).toBe(1);
      expect(user.password_hash.startsWith("scrypt$")).toBe(true);
      expect(verifyPassword("Maison!2026", user.password_hash), user.email).toBe(true);
      expect(verifyPassword("errada", user.password_hash), user.email).toBe(false);
    }
  });

  it("seeds exactly one manager, one primary waiter and one primary chef", () => {
    const roles = all<{ role: Role }>("SELECT role FROM users").map((u) => u.role);
    expect(roles.filter((r) => r === "manager")).toHaveLength(1);
    expect(roles.filter((r) => r === "waiter").length).toBeGreaterThanOrEqual(1);
    expect(roles.filter((r) => r === "chef").length).toBeGreaterThanOrEqual(1);
  });
});

describe("sign in", () => {
  beforeEach(() => {
    jar.clear();
    lastCookieOptions = null;
  });

  it("creates a session, sets an httpOnly cookie and writes an audit entry", async () => {
    const { signIn } = await import("@/lib/auth");
    const before = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login'")!.n;

    const user = await signIn("  Manager@Maison.pt ", "Maison!2026", "vitest-agent");
    expect(user?.role).toBe("manager");
    expect(user?.email).toBe("manager@maison.pt");

    const token = jar.get(SESSION_COOKIE);
    expect(token).toBeTruthy();
    expect(lastCookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });

    const row = get<{ user_agent: string; expires_at: string }>("SELECT user_agent, expires_at FROM sessions WHERE id = ?", token!);
    expect(row?.user_agent).toBe("vitest-agent");
    expect(new Date(row!.expires_at).getTime()).toBeGreaterThan(Date.now());

    const after = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login'")!.n;
    expect(after).toBe(before + 1);
    expect((await getSessionUser())?.email).toBe("manager@maison.pt");
  });

  it("does not create a session for a wrong password or an inactive user", async () => {
    const { signIn } = await import("@/lib/auth");
    expect(await signIn("manager@maison.pt", "errada")).toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    run("UPDATE users SET active = 0 WHERE email = ?", "waiter@maison.pt");
    expect(await signIn("waiter@maison.pt", "Maison!2026")).toBeNull();
    run("UPDATE users SET active = 1 WHERE email = ?", "waiter@maison.pt");

    expect(await signIn("nao-existe@maison.pt", "Maison!2026")).toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("session resolution", () => {
  beforeEach(() => {
    jar.clear();
  });

  it("returns the signed-in user for a valid session cookie", async () => {
    sessionFor("waiter@maison.pt");
    const user = await getSessionUser();
    expect(user?.email).toBe("waiter@maison.pt");
    expect(user?.role).toBe("waiter");
    expect(user?.restaurantName).toBeTruthy();
  });

  it("returns null without a cookie and for unknown tokens", async () => {
    expect(await getSessionUser()).toBeNull();
    jar.set(SESSION_COOKIE, newToken(24));
    expect(await getSessionUser()).toBeNull();
  });

  it("rejects and deletes expired sessions", async () => {
    const token = sessionFor("manager@maison.pt", { expiresAt: new Date(Date.now() - 1_000).toISOString() });
    expect(await getSessionUser()).toBeNull();
    expect(get<{ id: string }>("SELECT id FROM sessions WHERE id = ?", token)).toBeUndefined();
  });

  it("rejects sessions belonging to deactivated users", async () => {
    sessionFor("chef@maison.pt");
    run("UPDATE users SET active = 0 WHERE email = ?", "chef@maison.pt");
    expect(await getSessionUser()).toBeNull();
    run("UPDATE users SET active = 1 WHERE email = ?", "chef@maison.pt");
  });

  it("clears the token when signing out", async () => {
    const token = sessionFor("manager@maison.pt");
    const { signOut } = await import("@/lib/auth");
    await signOut();
    expect(get<{ id: string }>("SELECT id FROM sessions WHERE id = ?", token)).toBeUndefined();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("role guards", () => {
  beforeEach(() => {
    jar.clear();
  });

  it("sends anonymous visitors to the login page", async () => {
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("sends the wrong role to the denied screen", async () => {
    sessionFor("chef@maison.pt");
    await expect(requireRole("manager")).rejects.toThrow("NEXT_REDIRECT:/admin?denied=1");
    const user = await requireRole("chef");
    expect(user.role).toBe("chef");
  });

  it("allows managers everywhere and waiters on the floor", async () => {
    sessionFor("manager@maison.pt");
    expect((await requireRole("manager", "waiter", "chef")).role).toBe("manager");

    jar.clear();
    sessionFor("waiter@maison.pt");
    expect((await requireRole("manager", "waiter")).role).toBe("waiter");
    await expect(requireRole("chef")).rejects.toThrow("NEXT_REDIRECT:/admin?denied=1");
  });

  it("keeps the can() matrix in sync with the seeded roles", () => {
    expect(can(null, "manager")).toBe(false);
    const chef = { id: 1, name: "x", email: "x", role: "chef" as Role, restaurantId: 1, restaurantName: "MAISON" };
    expect(can(chef, "chef")).toBe(true);
    expect(can(chef, "manager")).toBe(false);
    expect(can(chef, "manager", "waiter")).toBe(false);
  });
});
