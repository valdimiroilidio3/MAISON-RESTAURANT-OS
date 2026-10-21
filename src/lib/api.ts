import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "./auth";
import type { Role, SessionUser } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "error", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, "bad_request", details);
export const notFound = (message = "Não encontrado") => new ApiError(404, message, "not_found");
export const conflict = (message: string) => new ApiError(409, message, "conflict");
export const forbidden = (message = "Sem permissão para esta ação") => new ApiError(403, message, "forbidden");
export const unauthorized = () => new ApiError(401, "Sessão inválida ou expirada", "unauthorized");

export async function requireApiUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (roles.length && !roles.includes(user.role)) throw forbidden();
  return user;
}

export function assertRole(user: SessionUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        code: "validation_error",
        details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  const message = error instanceof Error ? error.message : "Erro inesperado";
  console.error("[MAISON API]", error);
  return NextResponse.json({ error: message, code: "internal" }, { status: 500 });
}

/** Wrap an API route handler with consistent error mapping. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Corpo do pedido inválido; esperado JSON.");
  }
}
