"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/topics", label: "Topics" },
  { href: "/play", label: "Play" },
  { href: "/bookmarks", label: "Bookmarks" },
  { href: "/account", label: "Account" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-border bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
      <Container className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight"
        >
          <span className="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-lg">
            <Compass className="size-4" aria-hidden="true" />
          </span>
          Quiz Atlas
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </Container>
    </header>
  );
}
