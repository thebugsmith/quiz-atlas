"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/topics", label: "Topics", Icon: LayoutGrid },
  { href: "/play", label: "Play", Icon: Compass },
];

/** Thumb-reachable navigation on phones; hidden during gameplay by the game layout. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Quick navigation"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
