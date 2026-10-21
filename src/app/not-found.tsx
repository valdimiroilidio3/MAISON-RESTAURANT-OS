import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <Logo />
      <p className="eyebrow mt-12">Erro 404</p>
      <h1 className="display-lg mt-3 max-w-xl">Esta mesa não existe.</h1>
      <p className="mt-4 max-w-md text-sm text-muted">
        A página que procura pode ter mudado de lugar. Volte ao início ou consulte o menu.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary btn-sm">Voltar ao início</Link>
        <Link href="/menu" className="btn btn-ghost btn-sm">Ver o menu</Link>
      </div>
    </main>
  );
}
