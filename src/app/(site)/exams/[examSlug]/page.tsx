import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getExamCatalog } from "@/features/exam/catalog";
import { PaperCard } from "@/features/exam/paper-card";

// The catalog changes on import, not on deploy, so the route renders per request.
export const instant = false;

export const metadata = {
  title: "Exam",
  robots: { index: false, follow: false },
};

/**
 * One exam: every paper it has, newest year first. The year is the only grouping here; the
 * subjects of a paper are chosen on the paper's own page, and a paper with a single subject
 * starts from its card.
 */
export default async function ExamPage({ params }: PageProps<"/exams/[examSlug]">) {
  const { examSlug } = await params;
  const exams = await getExamCatalog();
  const exam = exams.find((entry) => entry.slug === examSlug);
  if (!exam) notFound();

  const years = [...new Set(exam.papers.map((paper) => paper.year))].sort((a, b) => b - a);

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
            description={exam.authority ?? "Previous-year papers, newest first."}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          {exam.paper_count} {exam.paper_count === 1 ? "paper" : "papers"}
          {exam.years.length > 0 ? ` · ${exam.years.join(", ")}` : ""}
          {exam.question_count > 0 ? ` · ${exam.question_count} questions` : ""}
        </p>
      </div>

      {exam.papers.length === 0 ? (
        <Card>
          <p className="text-sm font-medium">No papers published for this exam yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            A paper is listed once its content and answer key have been reviewed.
          </p>
        </Card>
      ) : null}

      {years.map((year) => {
        const papers = exam.papers.filter((paper) => paper.year === year);
        return (
          <section key={year} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{year}</h2>
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
