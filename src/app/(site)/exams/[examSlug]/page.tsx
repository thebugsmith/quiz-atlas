import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { examModeEnabled } from "@/features/exam/flags";
import { getExamCatalog } from "@/features/exam/catalog";
import { PaperCard } from "@/features/exam/paper-card";

// The catalog changes on import, not on deploy, so the route renders per request.
export const instant = false;

export const metadata = {
  title: "Exam",
  robots: { index: false, follow: false },
};

/** One exam: its cycles, then its papers grouped by stage, newest first. * Content changes on import, not on deploy, so the catalog is read per request.
 */
export default async function ExamPage({ params }: PageProps<"/exams/[examSlug]">) {
  if (!examModeEnabled) notFound();
  const { examSlug } = await params;
  const exams = await getExamCatalog();
  const exam = exams.find((entry) => entry.slug === examSlug);
  if (!exam) notFound();

  const stages = [...new Set(exam.papers.map((paper) => paper.stage ?? "Papers"))];

  return (
    <Container className="space-y-8">
      <div>
        <Link
          href="/exams"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All exams
        </Link>
        <div className="mt-3">
          <SectionHeading
            title={exam.name}
            description={exam.authority ? `${exam.authority}` : undefined}
          />
        </div>
        {exam.editions.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Cycles: {exam.editions.map((edition) => edition.label).join(", ")}
          </p>
        ) : null}
      </div>

      {exam.papers.length === 0 ? (
        <Card>
          <p className="text-sm font-medium">No papers published for this exam yet</p>
          <CardBody className="mt-1">
            A paper is listed once its content, key and marking rules have been reviewed.
          </CardBody>
        </Card>
      ) : null}

      {stages.map((stage) => {
        const papers = exam.papers.filter((paper) => (paper.stage ?? "Papers") === stage);
        return (
          <section key={stage} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{stage}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {papers.map((paper) => (
                <PaperCard key={paper.slug} paper={paper} />
              ))}
            </div>
          </section>
        );
      })}
    </Container>
  );
}
