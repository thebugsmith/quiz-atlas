import type { Metadata } from "next";
import { GameScreen } from "@/features/quiz/game-screen";

export const metadata: Metadata = {
  title: "Quiz",
  robots: { index: false },
};

// Every visit is a different attempt, so the route is rendered per request rather
// than prerendered with a placeholder attempt id.
export const instant = false;

/**
 * Gameplay lives outside the site shell: no header navigation, no bottom bar.
 * The attempt id comes from the URL; the server decides whether the caller owns it.
 */
export default async function QuizPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <GameScreen attemptId={attemptId} />;
}
