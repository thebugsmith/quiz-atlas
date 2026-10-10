import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDuration, paperIdentity, type ExamPaperSummary } from "./catalog";

const coverage: Record<
  ExamPaperSummary["source_status"],
  { label: string; tone: "neutral" | "primary" | "warning" }
> = {
  official_verified: { label: "Official source", tone: "primary" },
  reviewed_reconstruction: { label: "Reviewed reconstruction", tone: "neutral" },
  synthetic: { label: "Development fixture", tone: "warning" },
};

const keyStatus: Record<
  ExamPaperSummary["key_status"],
  { label: string; tone: "neutral" | "success" | "warning" }
> = {
  published: { label: "Key checked", tone: "success" },
  draft: { label: "Key in review", tone: "neutral" },
  embedded: { label: "Key imported with the paper", tone: "neutral" },
  missing: { label: "No key yet", tone: "warning" },
};

export function PaperCard({ paper }: { paper: ExamPaperSummary }) {
  const duration = formatDuration(paper.duration_seconds);
  const identity = paperIdentity({
    edition: paper.edition,
    stage: paper.stage,
    paper_code: paper.paper_code,
    shift_label: paper.shift_label,
  });
  const review = coverage[paper.source_status];
  const key = keyStatus[paper.key_status];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {paper.year}
            {paper.edition ? ` · ${paper.edition}` : ""}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
            {paper.paper_label ?? paper.paper_code ?? "Paper"}
          </h3>
          {identity ? <p className="text-muted-foreground mt-1 text-sm">{identity}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {paper.status === "draft" ? <Badge tone="warning">In review</Badge> : null}
          <Badge tone={review.tone}>{review.label}</Badge>
          <Badge tone={key.tone}>{key.label}</Badge>
        </div>
      </div>

      <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt>Questions</dt>
          <dd className="text-foreground font-medium">{paper.question_count ?? "—"}</dd>
        </div>
        {duration ? (
          <div className="flex gap-1">
            <dt>Time</dt>
            <dd className="text-foreground font-medium">{duration}</dd>
          </div>
        ) : null}
        <div className="flex gap-1">
          <dt>Marks</dt>
          <dd className="text-foreground font-medium">
            +{String(paper.marks_correct ?? 1)} / {String(paper.marks_wrong ?? 0)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Languages</dt>
          <dd className="text-foreground font-medium">
            {paper.locales.length > 0 ? paper.locales.join(", ").toUpperCase() : "en"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-muted-foreground text-xs">
          {paper.supported_types
            .map((type) =>
              type === "single_choice"
                ? "single choice"
                : type === "multiple_select"
                  ? "multiple select"
                  : "numerical",
            )
            .join(" · ")}
        </span>
        <Link
          href={`/exam-papers/${paper.slug}`}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {paper.status === "published" ? "Open paper" : "See details"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
