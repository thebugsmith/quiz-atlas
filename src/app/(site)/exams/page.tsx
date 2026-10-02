import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { examModeEnabled } from "@/features/exam/flags";

export const metadata = {
  title: "Exam mode",
  robots: { index: false, follow: false },
};

/**
 * The exam-mode entry point. It exists before the library does so the flag, the route
 * and the navigation can be exercised together; EX02 replaces this placeholder with the
 * real catalog. With the flag off the route is simply not there.
 */
export default function ExamsPage() {
  if (!examModeEnabled) notFound();

  return (
    <Container>
      <SectionHeading
        title="Exam mode"
        description="Previous-year objective papers, marked under each paper's own rules."
      />
      <Card className="max-w-xl">
        <CardTitle>Building the paper library</CardTitle>
        <CardBody className="mt-2">
          Papers appear here once their questions, key and marking rules have been checked against
          the official paper. Exam practice is separate from the quiz modes and does not affect your
          quiz score or the daily leaderboard.
        </CardBody>
        <div className="mt-5">
          <ButtonLink href="/play" variant="secondary" size="sm">
            Back to practice
          </ButtonLink>
        </div>
      </Card>
    </Container>
  );
}
