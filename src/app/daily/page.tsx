import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Daily Challenge",
  description: "One shared set of questions per day, reset at 00:00 UTC.",
};

export default function DailyPage() {
  return (
    <Container width="narrow">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily Challenge</h1>
          <Badge>Not open yet</Badge>
        </div>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Everyone answers the same questions on the same day and is ranked on speed and accuracy.
        </p>
      </header>

      <Card>
        <CardTitle>How it will work</CardTitle>
        <CardBody className="mt-2">
          The set is fixed per UTC day, so a slow answer costs points rather than questions. Your
          score appears on the leaderboard once the day closes; nobody can see live scores, and
          detailed answers unlock after the reset.
        </CardBody>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Resets</dt>
            <dd className="font-medium">00:00 UTC</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entry</dt>
            <dd className="font-medium">Signed-in accounts only</dd>
          </div>
        </dl>
        <p className="bg-surface-muted text-muted-foreground mt-4 rounded-[var(--radius-control)] p-3 text-xs leading-relaxed">
          Daily play opens in a later milestone, after accounts and the daily backend are in place.
          This page is a placeholder for that state.
        </p>
      </Card>
    </Container>
  );
}
