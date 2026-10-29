import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StartPractice } from "@/features/exam/start-practice";
import { formatDuration, paperIdentity, type ExamPaperSummary } from "./catalog";

/**
 * One paper inside a year. A published paper with a single section starts straight from the
 * card; a paper split into subjects sends the reader to its own page to pick them, and a
 * draft offers details only.
 */
export function PaperCard({ paper }: { paper: ExamPaperSummary }) {
  const duration = formatDuration(paper.duration_seconds);
  const sections = paper.sections ?? [];
  const published = paper.status === "published";
  const identity = paperIdentity({
    edition: paper.edition,
    stage: paper.stage,
    paper_code: paper.paper_code,
    shift_label: paper.shift_label,
  });
  const subjects = sections.map((section) => `${section.subject} ${section.items}`).join(" · ");

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">
            {paper.paper_label ?? paper.paper_code ?? "Paper"}
          </h3>
          {identity ? <p className="text-muted-foreground mt-1 text-sm">{identity}</p> : null}
        </div>
        {!published ? <Badge tone="warning">In review</Badge> : null}
      </div>

      <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt>Questions</dt>
          <dd className="text-foreground font-medium">{paper.question_count ?? "—"}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Time</dt>
          <dd className="text-foreground font-medium">{duration ?? "—"}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Marks</dt>
          <dd className="text-foreground font-medium">
            +{String(paper.marks_correct ?? "—")} / {String(paper.marks_wrong ?? "—")}
          </dd>
        </div>
      </dl>

      {subjects ? <p className="text-muted-foreground text-xs">{subjects}</p> : null}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        {!published ? (
          <ButtonLink href={`/exam-papers/${paper.slug}`} variant="secondary" size="sm">
            See details
          </ButtonLink>
        ) : sections.length > 1 ? (
          <ButtonLink href={`/exam-papers/${paper.slug}`} size="sm">
            Choose subjects
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        ) : (
          <StartPractice paper={paper.slug} label="Start paper" />
        )}
        {published ? (
          <Link
            href={`/exam-papers/${paper.slug}`}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Details
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
