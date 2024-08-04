import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ProgressScreen } from "@/features/progress/progress-screen";

export const metadata: Metadata = {
  title: "Progress",
  description: "Your quizzes, accuracy by topic, streaks and achievements.",
};

export default function ProgressPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Progress</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Built from the answers you submitted. Practice runs and revealed answers stay out of these
          numbers.
        </p>
      </header>
      <ProgressScreen />
    </Container>
  );
}
