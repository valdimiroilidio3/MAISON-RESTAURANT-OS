"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[MAISON]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <Logo />
      <div className="mt-12 flex size-11 items-center justify-center rounded-full border border-alert/40 bg-alert/10">
        <AlertTriangle className="size-5 text-alert" aria-hidden />
      </div>
      <h1 className="display-md mt-5">Algo falhou no serviço.</h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        O erro foi registado. Pode tentar novamente ou voltar ao início. Se continuar, contacte a equipa técnica.
      </p>
      {error.digest && <p className="mt-2 text-[10px] text-muted">Referência: {error.digest}</p>}
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary btn-sm">
          <RotateCcw className="size-3.5" aria-hidden /> Tentar novamente
        </button>
        <Link href="/" className="btn btn-ghost btn-sm">Início</Link>
      </div>
    </main>
  );
}
