import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { examModeEnabled } from "@/features/exam/flags";
import { formatDuration, getPaperDetail } from "@/features/exam/catalog";
import { FavoriteButton } from "@/features/exam/favorite-button";
import { StartPractice } from "@/features/exam/start-practice";
import { getVerifiedUser } from "@/lib/supabase/server";
import { rpc } from "@/features/quiz/api-helpers";

// The catalog changes on import, not on deploy, so the route renders per request.
export const instant = false;

export const metadata = {
  title: "Paper",
  robots: { index: false, follow: false },
};

const sourceLabel = {
  official_verified: "Checked against the official paper",
  reviewed_reconstruction: "Reviewed reconstruction",
  synthetic: "Development fixture, not a previous-year paper",
} as const;

const keyLabel = {
  published: "Answer key checked and published",
  draft: "Answer key imported, still in review",
  embedded: "Answer key imported with the paper",
  missing: "No answer key attached",
} as const;

function marks(value: number | string | null) {
  return value === null || value === undefined ? "—" : String(value);
}

/** A paper's identity and terms before anyone starts: what it is, how it is marked. * Content changes on import, not on deploy, so the catalog is read per request.
 */
export default async function PaperPage({ params }: PageProps<"/exam-papers/[paperSlug]">) {
  if (!examModeEnabled) notFound();
  const { paperSlug } = await params;
  const paper = await getPaperDetail(paperSlug);
  if (!paper) notFound();

  const duration = formatDuration(paper.duration_seconds);
  const published = paper.status === "published";

  const user = await getVerifiedUser();
  const favorites = user
    ? ((await rpc<string[]>("exam_favorites_list", { p_owner: user.id })).data ?? [])
    : [];

  const open = user
    ? (
        await rpc<{
          attempt_id: string;
          answered: number;
          total: number;
          cursor_position: number | null;
        }>("exam_open_attempt", { p_owner: user.id, p_paper_slug: paper.slug })
      ).data
    : null;

  // A draft paper is startable only in development, and only when it is a synthetic
  // fixture: the same rule the create function enforces.
  const startable =
    paper.status === "published" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EXAM_ALLOW_DRAFT === "1" &&
      paper.source_status === "synthetic");

  return (
    <Container className="space-y-6">
      <div>
        <Link
          href={`/exams/${paper.exam.slug}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {paper.exam.name}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {paper.paper_label ?? paper.paper_code ?? "Paper"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            paper.edition?.label,
            paper.stage?.name,
            paper.shift_label,
            paper.session_label,
            paper.exam_date,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={published ? "success" : "warning"}>
            {published ? "Published" : "In review"}
          </Badge>
          <Badge tone={paper.source_status === "official_verified" ? "primary" : "neutral"}>
            {sourceLabel[paper.source_status]}
          </Badge>
          <Badge tone={paper.key_status === "published" ? "success" : "neutral"}>
            {keyLabel[paper.key_status]}
          </Badge>
          {paper.administration !== "regular" ? (
            <Badge tone="warning">{paper.administration}</Badge>
          ) : null}
        </div>
        {user ? (
          <div className="mt-3">
            <FavoriteButton paper={paper.slug} initial={favorites.includes(paper.slug)} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle className="text-base">Paper</CardTitle>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Questions</dt>
              <dd>{paper.items}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{duration ?? "Not declared"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Marking</dt>
              <dd>
                +{marks(paper.marks_correct)} / {marks(paper.marks_wrong)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Maximum marks</dt>
              <dd>{marks(paper.max_marks)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Languages</dt>
              <dd>
                {paper.locales.length > 0
                  ? paper.locales.map((locale) => locale.locale.toUpperCase()).join(", ")
                  : "English"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardTitle className="text-base">Sections</CardTitle>
          {paper.sections.length === 0 ? (
            <CardBody className="mt-2">No section split: the paper is one list.</CardBody>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {paper.sections.map((section) => (
                <li key={section.subject} className="flex justify-between gap-3">
                  <span>{section.subject}</span>
                  <span className="text-muted-foreground">
                    {section.items} {section.items === 1 ? "question" : "questions"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">Question types</CardTitle>
          <CardBody className="mt-2">
            {paper.supported_types
              .map((type) =>
                type === "single_choice"
                  ? "Single choice"
                  : type === "multiple_select"
                    ? "Multiple select"
                    : "Numerical",
              )
              .join(", ")}
          </CardBody>
          {paper.rule ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Navigation</dt>
                <dd>{paper.rule.navigation.kind === "free" ? "Any question" : "In order"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Partial credit</dt>
                <dd>{paper.rule.marking.partial?.policy.replaceAll("_", " ") ?? "none"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Rule version</dt>
                <dd>
                  v{paper.rule.version} ({paper.rule.status})
                </dd>
              </div>
            </dl>
          ) : (
            <CardBody className="mt-2">Marking rules are not attached yet.</CardBody>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">How do you want to practise?</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border-strong">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Untimed practice</CardTitle>
              <Badge tone="primary">Recommended</Badge>
            </div>
            <CardBody className="mt-2">
              Answer at your own pace. Every response is saved, so you can close the tab and come
              back to it. Checking an answer shows the explanation and is recorded as assisted.
            </CardBody>
            {open ? (
              <div className="mt-4">
                <ButtonLink href={`/exam-attempts/${open.attempt_id}`} size="sm">
                  Continue · {open.answered}/{open.total} answered
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <p className="text-muted-foreground mt-2 text-xs">
                  {open.cursor_position
                    ? `You left off at question ${open.cursor_position}.`
                    : "Your saved answers open where you left them."}
                </p>
              </div>
            ) : (
              <StartPractice paper={paper.slug} disabled={!startable} />
            )}
            {!startable ? (
              <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
                <Info className="size-3.5" aria-hidden="true" />
                This paper is still in review.
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Timed paper</CardTitle>
              <Badge tone="neutral">
                <Clock className="size-3" aria-hidden="true" />
                {duration ?? "No timer"}
              </Badge>
            </div>
            <CardBody className="mt-2">
              One sitting under the paper&apos;s own duration. The clock is owned by the server and
              runs whether or not this tab is open. Answers are locked when it ends.
            </CardBody>
            <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
              <Info className="size-3.5" aria-hidden="true" />
              Timed papers open with the timer milestone.
            </p>
          </Card>
        </div>
      </section>
    </Container>
  );
}
