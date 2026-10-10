import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { examModeEnabled } from "@/features/exam/flags";
import { getExamCatalog } from "@/features/exam/catalog";
import { PaperCard } from "@/features/exam/paper-card";

// The catalog changes on import, not on deploy, so the route renders per request.
export const instant = false;

export const metadata = {
  title: "Exam mode",
  robots: { index: false, follow: false },
};

type Search = { exam?: string; year?: string; q?: string };

/**
 * The library: every exam the bank knows about, with its papers filtered by exam, year or
 * a text search. Filters live in the URL, so a filtered view is a shareable link and the
 * back button restores it. With the flag off the route is simply not there.
 * Content changes on import, not on deploy, so the catalog is read per request.
 */
export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  if (!examModeEnabled) notFound();
  const params = (await searchParams) as Search;
  const exams = await getExamCatalog();

  const query = (params.q ?? "").trim().toLowerCase();
  const yearFilter = params.year ? Number(params.year) : null;
  const examFilter = params.exam ?? null;

  const visible = exams
    .filter((exam) => !examFilter || exam.slug === examFilter)
    .map((exam) => ({
      ...exam,
      papers: exam.papers.filter((paper) => {
        if (yearFilter && paper.year !== yearFilter) return false;
        if (!query) return true;
        return [
          exam.name,
          paper.paper_label,
          paper.paper_code,
          paper.stage,
          paper.edition,
          paper.shift_label,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      }),
    }))
    .filter((exam) => exam.papers.length > 0);

  const years = [...new Set(exams.flatMap((exam) => exam.papers.map((paper) => paper.year)))].sort(
    (a, b) => b - a,
  );
  const paperCount = exams.reduce((total, exam) => total + exam.papers.length, 0);

  return (
    <Container className="space-y-8">
      <div>
        <SectionHeading
          title="Exam mode"
          description="Previous-year objective papers, marked under each paper's own rules."
        />
        <p className="text-muted-foreground max-w-2xl text-sm">
          Choose an exam, then a cycle and a paper. Exam practice is separate from the quiz modes:
          it has its own progress and does not touch your quiz score or the daily leaderboard.
        </p>
      </div>

      <form
        method="get"
        className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border p-4"
      >
        <label className="flex-1 text-sm">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">
            Search papers
          </span>
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Exam, year or shift"
            className="border-border bg-background h-10 w-full rounded-[var(--radius-control)] border px-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Exam</span>
          <select
            name="exam"
            defaultValue={params.exam ?? ""}
            className="border-border bg-background h-10 rounded-[var(--radius-control)] border px-3 text-sm"
          >
            <option value="">All exams</option>
            {exams.map((exam) => (
              <option key={exam.slug} value={exam.slug}>
                {exam.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Year</span>
          <select
            name="year"
            defaultValue={params.year ?? ""}
            className="border-border bg-background h-10 rounded-[var(--radius-control)] border px-3 text-sm"
          >
            <option value="">All years</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-10 rounded-[var(--radius-control)] px-4 text-sm font-medium"
        >
          Apply
        </button>
      </form>

      {paperCount === 0 ? (
        <Card>
          <p className="text-sm font-medium">No papers yet</p>
          <CardBody className="mt-1">
            Papers appear here after their questions, key and marking rules have been checked
            against the official paper. Nothing is shown as a complete paper until it is.
          </CardBody>
        </Card>
      ) : null}

      {visible.map((exam) => (
        <section key={exam.slug} className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{exam.name}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {exam.authority ? `${exam.authority} · ` : ""}
                {exam.papers.length} {exam.papers.length === 1 ? "paper" : "papers"}
                {exam.editions.length > 0
                  ? ` · ${exam.editions.map((edition) => edition.label).join(", ")}`
                  : ""}
              </p>
            </div>
            <Link
              href={`/exams/${exam.slug}`}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Open exam
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {exam.papers.map((paper) => (
              <PaperCard key={paper.slug} paper={paper} />
            ))}
          </div>
        </section>
      ))}

      {paperCount > 0 && visible.length === 0 ? (
        <Card>
          <p className="text-sm font-medium">Nothing matches those filters</p>
          <CardBody className="mt-1">
            Clear the search or choose another exam. The year list only offers years that have
            papers.
          </CardBody>
        </Card>
      ) : null}
    </Container>
  );
}
