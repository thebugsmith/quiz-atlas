import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * The browsing shell: header, footer and thumb-reachable navigation. The game
 * route deliberately sits outside this group so play has no navigation.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1 pt-6 pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileNav />
    </>
  );
}
