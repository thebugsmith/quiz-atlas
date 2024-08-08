import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { DailyShell } from "@/features/daily/daily-shell";

export const metadata: Metadata = {
  title: "Daily Challenge",
  description: "One shared set of ten questions per UTC day, ranked once per account.",
};

export default function DailyPage() {
  return (
    <Container width="narrow">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily Challenge</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Everyone answers the same ten questions in the same order. One ranked attempt per account;
          details stay hidden until the day closes.
        </p>
        <a
          href="/daily/leaderboard"
          className="text-primary mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          See the daily leaderboard
        </a>
      </header>
      <DailyShell />
    </Container>
  );
}
