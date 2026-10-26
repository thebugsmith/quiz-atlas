import { ExamWorkspace } from "@/features/exam/workspace";

export const metadata = {
  title: "Exam paper",
  robots: { index: false, follow: false },
};

// Every visit is a different attempt, so nothing here is prerendered.
export const instant = false;

/** The solver lives outside the site shell: no header navigation, no bottom bar. */
export default async function ExamAttemptPage({ params }: PageProps<"/exam-attempts/[attemptId]">) {
  const { attemptId } = await params;
  return <ExamWorkspace attemptId={attemptId} />;
}
