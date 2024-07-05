import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium " +
  "transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-surface-muted " +
  "disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover shadow-sm",
  secondary: "bg-surface text-foreground border border-border-strong hover:bg-surface-muted",
  ghost: "text-foreground hover:bg-surface-muted",
  quiet: "text-muted-foreground hover:text-foreground hover:bg-surface-muted",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  "aria-label"?: string;
};

/** Same visual contract as Button, for navigation. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
