import Link from "next/link";
import { cn } from "@/lib/cn";

export function Monogram({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-gold/40 bg-gold/[0.06] font-display text-[15px] text-gold-soft",
        className,
      )}
    >
      M
    </span>
  );
}

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="MAISON, início">
      <Monogram />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[19px] tracking-[0.14em] text-cream">
          MAISON<sup className="ml-0.5 align-super text-[8px] tracking-normal text-gold">®</sup>
        </span>
        {!compact && (
          <span className="mt-1 text-[8px] uppercase tracking-brand text-muted">Restaurant OS</span>
        )}
      </span>
    </Link>
  );
}
