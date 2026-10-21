import "server-only";
import { ZodError } from "zod";
import { ApiError } from "./api";
import type { ActionState } from "./action-types";

export function errorState(error: unknown, fallback = "Não foi possível concluir a ação."): ActionState {
  if (error instanceof ApiError) return { ok: false, message: error.message };
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) fieldErrors[issue.path.join(".") || "form"] = issue.message;
    return { ok: false, message: Object.values(fieldErrors)[0] ?? "Dados inválidos.", fieldErrors };
  }
  if (error instanceof Error && error.message && !error.message.includes("NEXT_REDIRECT")) {
    return { ok: false, message: error.message };
  }
  console.error("[MAISON ACTION]", error);
  return { ok: false, message: fallback };
}
