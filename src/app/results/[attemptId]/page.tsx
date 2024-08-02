import type { Metadata } from "next";
import { ResultsScreen } from "@/features/quiz/results-screen";

export const metadata: Metadata = {
  title: "Result",
  robots: { index: false },
};

// One result per URL, so no static prerender with a placeholder id.
export const instant = false;

export default async function ResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <ResultsScreen attemptId={attemptId} />;
}
