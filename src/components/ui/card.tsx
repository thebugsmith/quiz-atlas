import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-border bg-surface rounded-[var(--radius-card)] border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted-foreground text-sm leading-relaxed", className)} {...props} />
  );
}
