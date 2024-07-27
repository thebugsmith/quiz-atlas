import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { GuestSessionProvider } from "@/features/auth/guest-session";
import { GuestNotice } from "@/features/auth/guest-notice";
import { SetupShell } from "@/features/quiz/setup-shell";

export const metadata: Metadata = {
  title: "Play",
  description: "Choose topics, difficulty, and a game format.",
};

// The setup is shareable through the URL, so this route is rendered per request
// instead of being generated once with an empty selection.
export const instant = false;

/**
 * Topics arrive from the home page (`/play?topics=geography` or `?topics=a,b`).
 * Without the parameter the player gets the mixed setup, where they can narrow the
 * selection themselves.
 */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ topics?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.topics) ? params.topics.join(",") : (params.topics ?? "");
  const selectedTopics = raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .slice(0, 8);

  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up a quiz</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Nothing here is permanent — you can change any of it before the first question.
        </p>
      </header>
      <GuestSessionProvider>
        <GuestNotice />
        <SetupShell initialTopics={selectedTopics} />
      </GuestSessionProvider>
    </Container>
  );
}
