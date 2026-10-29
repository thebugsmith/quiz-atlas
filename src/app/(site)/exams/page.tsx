import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getExamCatalog } from "@/features/exam/catalog";

// The catalog changes on import, not on deploy, so the route renders per request.
export const instant = false;

export const metadata = {
  title: "Exams",
  robots: { index: false, follow: false },
};

type Search = { q?: string };

const familyLabel: Record<string, string> = {
  "civil-services": "Civil services",
  medical: "Medical",
  engineering: "Engineering",
  banking: "Banking",
  teaching: "Teaching",
};

/**
 * The exam list: one tile per exam, the way the topics page lists topics. Years, papers and
 * subjects belong one level down, so nothing here is split by subject or year.
 */
export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  const params = (await searchParams) as Search;
  const query = (params.q ?? "").trim().toLowerCase();

  const exams = (await getExamCatalog()).filter(
    (exam) => !query || `${exam.name} ${exam.family ?? ""}`.toLowerCase().includes(query),
  );

  return (
    <Container className="space-y-6">
      <div>
        <SectionHeading
          title="Exams"
          description="Previous-year objective papers, marked under each paper's own rules."
        />
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Pick an exam to see its papers by year. Exam practice is separate from the quiz modes: it
          has its own progress and does not touch your quiz score or the daily leaderboard.
        </p>
      </div>

      <form method="get" className="max-w-sm">
        <label className="block text-sm">
          <span className="sr-only">Search exams</span>
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search exams"
            className="border-border bg-background h-10 w-full rounded-[var(--radius-control)] border px-3 text-sm"
          />
        </label>
      </form>

      {exams.length === 0 ? (
        <Card>
          <p className="text-sm font-medium">No exams yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            An exam appears once one of its papers has been imported and published.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {exams.map((exam) => (
            <li key={exam.slug}>
              <Link href={`/exams/${exam.slug}`} className="block">
                <Card className="flex h-full flex-col gap-2 transition-colors hover:border-[var(--color-border-strong)]">
                  {exam.family ? (
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {familyLabel[exam.family] ?? exam.family}
                    </p>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[15px] font-semibold tracking-tight">{exam.name}</h2>
                    <ArrowRight
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {exam.paper_count} {exam.paper_count === 1 ? "paper" : "papers"}
                    {exam.years.length > 0 ? ` · ${exam.years.join(", ")}` : ""}
                    {exam.question_count > 0 ? ` · ${exam.question_count} questions` : ""}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
