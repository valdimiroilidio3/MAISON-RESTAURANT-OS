import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16_384;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, { N, r: 8, p: 1 }).toString("hex");
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, salt, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hashHex) return false;
    const n = Number(nStr) || N;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length, { N: n, r: 8, p: 1 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
