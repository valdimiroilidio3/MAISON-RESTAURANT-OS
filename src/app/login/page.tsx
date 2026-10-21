import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { ensureNotSignedIn } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await ensureNotSignedIn();
  const params = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <Image
          src="/images/interior-bar.jpg"
          alt="Balcão do restaurante MAISON iluminado a âmbar"
          fill
          priority
          sizes="55vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="eyebrow">Restaurant OS</p>
          <h1 className="display-lg mt-3 max-w-md">
            O salão, a cozinha e a conta — no mesmo sistema.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-dim">
            Comandas transacionais, KDS em tempo real, reservas sem conflitos e um salão 3D com os clientes sentados à mesa.
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Logo href="/" />
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-cream">
            <ArrowLeft className="size-3.5" aria-hidden /> Website
          </Link>
        </div>

        <div className="mx-auto w-full max-w-sm py-12">
          <p className="eyebrow">Acesso equipa</p>
          <h2 className="mt-2 font-display text-3xl text-cream">Bem-vindo de volta.</h2>
          <p className="mt-2 mb-8 text-sm text-muted">
            Autentique-se para operar o salão, a cozinha e o back office.
          </p>
          <LoginForm next={params.next} />
        </div>

        <p className="text-[10px] text-muted">
          MAISON® Restaurant OS · Demonstração com dados reais em SQLite. Nenhum pagamento real é processado.
        </p>
      </div>
    </main>
  );
}
