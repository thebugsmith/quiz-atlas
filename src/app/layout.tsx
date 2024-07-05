import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Quiz Atlas",
    template: "%s · Quiz Atlas",
  },
  description: "Choose topics, pick a game format, play, and see how you improve.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* Sets data-theme before the app paints, so the palette never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
