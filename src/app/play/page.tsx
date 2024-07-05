import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SetupShell } from "@/features/quiz/setup-shell";

export const metadata: Metadata = {
  title: "Play",
  description: "Choose topics, difficulty, and a game format.",
};

export default function PlayPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up a quiz</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Nothing here is permanent — you can change any of it before the first question.
        </p>
      </header>
      <SetupShell />
    </Container>
  );
}
