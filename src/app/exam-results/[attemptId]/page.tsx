import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MatchLists } from "@/components/ui/match-lists";
import type { MatchBlock } from "@/components/ui/match-lists";
import { ArrowLeft, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVerifiedUser } from "@/lib/supabase/server";
import { rpc } from "@/features/quiz/api-helpers";
import type { Manifest, ManifestItem } from "@/features/exam/manifest";

export const metadata = {
  title: "Exam result",
  robots: { index: false, follow: false },
};

export const instant = false;

type ResultItem = {
  position: number;
  section: string | null;
  type: string;
  prompt: string;
  match?: MatchBlock | null;
  response: {
    kind: string;
    option_id?: string | null;
    option_ids?: string[];
    value?: string | null;
  } | null;
  status: "correct" | "partial" | "incorrect" | "unanswered" | "bonus";
  award: string;
  correct_answer: {
    accepted_option_ids?: string[] | null;
    correct_option_ids?: string[] | null;
    accepted_numeric_intervals?:
      { min: string; max: string; min_inclusive: boolean; max_inclusive: boolean }[] | null;
  } | null;
};

type Result = {
  attempt_id: string;
  submitted_at: string;
  total_exact: string;
  total_display: number | string;
  max_marks: number | string | null;
  correct: number;
  partial: number;
  incorrect: number;
  unanswered: number;
  bonus: number;
  paper: { slug: string; label: string | null; year: number };
  items: ResultItem[];
};

const statusLabel: Record<
  ResultItem["status"],
  { text: string; tone: "success" | "primary" | "warning" | "neutral" }
> = {
  correct: { text: "Correct", tone: "success" },
  partial: { text: "Partially correct", tone: "primary" },
  incorrect: { text: "Incorrect", tone: "warning" },
  unanswered: { text: "Not answered", tone: "neutral" },
  bonus: { text: "Bonus or excluded", tone: "neutral" },
};

function answerText(item: ResultItem, manifestItem: ManifestItem | undefined): string {
  if (!item.response) return "No answer";
  if (item.response.kind === "single") {
    const option = manifestItem?.options.find((entry) => entry.id === item.response?.option_id);
    return option
      ? `${option.label}. ${option.text}`
      : String(item.response.option_id ?? "cleared");
  }
  if (item.response.kind === "multiple") {
    const ids = item.response.option_ids ?? [];
    if (ids.length === 0) return "No answer";
    return ids
      .map((id) => {
        const option = manifestItem?.options.find((entry) => entry.id === id);
        return option ? `${option.label}. ${option.text}` : id;
      })
      .join("; ");
  }
  return item.response.value ? String(item.response.value) : "No answer";
}

function keyText(item: ResultItem, manifestItem: ManifestItem | undefined): string {
  const answer = item.correct_answer;
  if (!answer) return "—";
  const labels = (ids: string[] | null | undefined) =>
    (ids ?? [])
      .map((id) => {
        const option = manifestItem?.options.find((entry) => entry.id === id);
        return option ? option.label : id;
      })
      .join(", ");
  if (answer.accepted_option_ids?.length) return labels(answer.accepted_option_ids);
  if (answer.correct_option_ids?.length) return labels(answer.correct_option_ids);
  if (answer.accepted_numeric_intervals?.length) {
    return answer.accepted_numeric_intervals
      .map(
        (interval) =>
          `${interval.min_inclusive ? "[" : "("}${interval.min}, ${interval.max}${interval.max_inclusive ? "]" : ")"}`,
      )
      .join(" or ");
  }
  return "—";
}

/** Results are rendered per request: they are personal and must never be cached. */
export default async function ExamResultPage({ params }: PageProps<"/exam-results/[attemptId]">) {
  const { attemptId } = await params;
  const user = await getVerifiedUser();
  if (!user) redirect("/exams");

  const { data: result, error } = await rpc<Result | null>("exam_result", {
    p_attempt_id: attemptId,
    p_owner: user.id,
  });
  if (error || !result) {
    if (error === "not_found") notFound();
    return (
      <Container className="py-10">
        <Card>
          <CardTitle>This paper has not been submitted</CardTitle>
          <CardBody className="mt-2">
            Finish the paper from the workspace to see a marked result.
          </CardBody>
          <Link href="/exams" className="text-primary mt-4 inline-block text-sm hover:underline">
            Back to exam library
          </Link>
        </Card>
      </Container>
    );
  }

  const { data: manifest } = await rpc<Manifest | null>("exam_attempt_manifest", {
    p_attempt_id: attemptId,
    p_owner: user.id,
  });
  const byPosition = new Map((manifest?.items ?? []).map((item) => [item.position, item]));

  return (
    <Container className="space-y-6 py-8">
      <div>
        <Link
          href="/exams"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Exam library
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {result.paper.label ?? result.paper.slug}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {result.paper.year} · submitted {new Date(result.submitted_at).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Marks</p>
          <p className="mt-1 text-2xl font-semibold">
            {String(result.total_display)}
            <span className="text-muted-foreground text-base font-normal">
              {" "}
              / {result.max_marks ?? "—"}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Exact total {result.total_exact}</p>
        </Card>
        <Card>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Answered
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {result.correct + result.partial + result.incorrect}
            <span className="text-muted-foreground text-base font-normal">
              {" "}
              / {result.items.length}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {result.unanswered} left blank · {result.bonus} bonus
          </p>
        </Card>
        <Card>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Correct
          </p>
          <p className="mt-1 text-2xl font-semibold">{result.correct}</p>
          <p className="text-muted-foreground mt-1 text-xs">{result.partial} partially correct</p>
        </Card>
        <Card>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Incorrect
          </p>
          <p className="mt-1 text-2xl font-semibold">{result.incorrect}</p>
          <p className="text-muted-foreground mt-1 text-xs">Marks follow the paper&apos;s rules</p>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Every question</h2>
        <ul className="space-y-3">
          {result.items.map((item, index) => {
            const status = statusLabel[item.status];
            const manifestItem = byPosition.get(item.position);
            return (
              <li key={item.position}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {item.status === "correct" ? (
                        <CheckCircle2 className="text-success mt-0.5 size-4" aria-hidden="true" />
                      ) : item.status === "incorrect" ? (
                        <XCircle className="text-warning mt-0.5 size-4" aria-hidden="true" />
                      ) : (
                        <MinusCircle
                          className="text-muted-foreground mt-0.5 size-4"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Question {index + 1}
                          {item.section ? ` · ${item.section}` : ""}
                        </p>
                        {item.match ? <MatchLists match={item.match} /> : null}
                        <p className="mt-1 text-sm leading-relaxed">{item.prompt}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={status.tone}>{status.text}</Badge>
                      <Badge tone="neutral">{item.award}</Badge>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground text-xs">Your answer</dt>
                      <dd>{answerText(item, manifestItem)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Answer key</dt>
                      <dd>
                        {item.status === "bonus"
                          ? "Everyone receives the marks"
                          : keyText(item, manifestItem)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-muted-foreground text-xs">
        Marks are calculated from the paper&apos;s own rules. No percentile, rank or normalised
        score is implied.
      </p>
    </Container>
  );
}
