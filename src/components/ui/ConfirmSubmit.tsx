"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function ConfirmSubmit({
  children,
  className,
  confirmMessage,
  variant = "primary",
  size = "md",
  title,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
  variant?: "primary" | "gold" | "ghost" | "danger";
  size?: "md" | "sm" | "xs";
  title?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      disabled={pending || disabled}
      className={cn("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, className)}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
