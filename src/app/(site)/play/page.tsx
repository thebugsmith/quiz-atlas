import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { GuestSessionProvider } from "@/features/auth/guest-session";
import { GuestNotice } from "@/features/auth/guest-notice";
import { SetupShell } from "@/features/quiz/setup-shell";
import { parseSetupParams } from "@/features/quiz/setup-params";

export const metadata: Metadata = {
  title: "Play",
  description: "Choose topics, difficulty, and a game format.",
};

// The setup is shareable through the URL, so this route is rendered per request
// instead of being generated once with an empty selection.
export const instant = false;

/**
 * Everything a player chooses can arrive in the URL (`/play?topics=geography&
 * difficulty=hard&count=20`), which makes the setup shareable and resumable. With
 * `quick=1` the screen collapses to a summary and a single Start button.
 */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const setup = parseSetupParams(await searchParams);

  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {setup.quick ? "Quick play" : "Set up a quiz"}
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          {setup.quick
            ? "Ten mixed questions from every topic. Change the setup if you want something else."
            : "Nothing here is permanent — you can change any of it before the first question."}
        </p>
      </header>
      <GuestSessionProvider>
        <GuestNotice />
        <SetupShell
          initialTopics={setup.topics}
          initialDifficulty={setup.difficulty}
          initialCount={setup.count}
          quick={setup.quick}
          problems={setup.problems}
        />
      </GuestSessionProvider>
    </Container>
  );
}
