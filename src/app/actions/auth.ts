"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signIn, signOut } from "@/lib/auth";
import type { ActionState } from "@/lib/action-types";

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  if (!email || !password) {
    return { ok: false, message: "Preencha o email e a palavra-passe." };
  }
  let user = null;
  try {
    const h = await headers();
    user = await signIn(email, password, h.get("user-agent") ?? "");
  } catch (error) {
    console.error("[login]", error);
    return { ok: false, message: "Erro ao iniciar sessão. Tente novamente." };
  }
  if (!user) {
    return { ok: false, message: "Credenciais inválidas. Verifique o email e a palavra-passe." };
  }
  redirect(next.startsWith("/") ? next : "/admin");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
