import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { DailyLeaderboard } from "@/features/daily/leaderboard";

// The board depends on the current UTC day, so it is rendered per request.
export const instant = false;

export const metadata: Metadata = {
  title: "Daily leaderboard",
  description: "Ranked results for each daily challenge.",
};

export default function DailyLeaderboardPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily leaderboard</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Equal scores share a rank. Abandoned, expired and voided attempts are not listed, and
          other modes never enter this board.
        </p>
      </header>
      <Suspense
        fallback={
          <p className="text-muted-foreground text-sm" role="status">
            Loading the board…
          </p>
        }
      >
        <DailyLeaderboard />
      </Suspense>
    </Container>
  );
}
