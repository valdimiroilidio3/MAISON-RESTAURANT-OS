"use client";

import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { signInAction } from "@/app/actions/auth";
import { idleAction } from "@/lib/action-types";

const DEMO = [
  { role: "Gestão", email: "manager@maison.pt", hint: "acesso total, pagamentos, relatórios" },
  { role: "Sala", email: "waiter@maison.pt", hint: "comandas, mesas, reservas" },
  { role: "Cozinha", email: "chef@maison.pt", hint: "KDS, stock, receitas" },
];

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, idleAction);

  return (
    <div className="w-full max-w-sm">
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? "/admin"} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue="manager@maison.pt"
            className="field"
            placeholder="nome@maison.pt"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Palavra-passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="Maison!2026"
            className="field"
            placeholder="••••••••"
          />
        </div>
        {state.message && (
          <p role="alert" className="rounded-md border border-alert/30 bg-alert/10 px-3 py-2 text-xs text-alert">
            {state.message}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
          Entrar no MAISON OS
        </button>
      </form>

      <div className="mt-8 rounded-xl border border-line bg-surface-2/50 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Contas de demonstração</p>
        <ul className="mt-2 space-y-1.5">
          {DEMO.map((account) => (
            <li key={account.email} className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-cream-dim">{account.role}</span>
              <span className="text-muted">{account.email}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 border-t border-line pt-2.5 text-[10px] text-muted">
          Palavra-passe comum: <span className="text-gold-soft">Maison!2026</span>. As sessões são assinadas em cookie HttpOnly e
          expiram ao fim de 10 horas.
        </p>
      </div>
    </div>
  );
}
