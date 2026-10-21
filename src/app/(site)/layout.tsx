import { getRestaurant } from "@/lib/restaurant";
import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { ToastProvider } from "@/components/ui/Toast";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const restaurant = getRestaurant();
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-ink">
        <SiteHeader />
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <SiteFooter restaurant={restaurant} />
      </div>
    </ToastProvider>
  );
}
