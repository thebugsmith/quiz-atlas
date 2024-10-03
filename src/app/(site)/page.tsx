import Link from "next/link";
import { ArrowRight, Clock3, Flame, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { HomeTopicGrid } from "@/features/topics/home-topic-grid";

export default function Home() {
  return (
    <div className="space-y-12">
      <section>
        <Container>
          <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6 sm:p-8">
            <Badge tone="primary" className="mb-4">
              <Sparkles className="size-3.5" aria-hidden="true" />
              10 questions · mixed difficulty
            </Badge>
            <h1 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Test what you know, then learn what you missed.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl text-[15px] leading-relaxed">
              Pick a topic, pick a format, and play. Every answer comes with an explanation, so a
              wrong guess is still a useful one.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href="/play?quick=1" size="lg">
                Play now
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/topics" variant="secondary" size="lg">
                Browse topics
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      <section>
        <Container>
          <SectionHeading
            title="Choose a topic"
            description="All topics, or just the ones you feel like today."
            action={
              <Link
                href="/topics"
                className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                See all topics
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <HomeTopicGrid />
        </Container>
      </section>

      <section>
        <Container className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex items-center gap-2">
                  <Flame className="text-warning size-4" aria-hidden="true" />
                  Daily Challenge
                </CardTitle>
                <CardBody className="mt-1.5">
                  One fixed set of questions per day, scored on a shared leaderboard. Sign in to
                  enter.
                </CardBody>
              </div>
              <Badge>Daily</Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ButtonLink href="/daily" variant="secondary" size="sm">
                How it works
              </ButtonLink>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Clock3 className="size-3.5" aria-hidden="true" />
                Resets at 00:00 UTC
              </span>
            </div>
          </Card>

          <Card>
            <CardTitle>Your progress</CardTitle>
            <CardBody className="mt-1.5">
              No games yet. Play a round and your recent scores will show up here.
            </CardBody>
            <div className="mt-4">
              <ButtonLink href="/play" size="sm">
                Start your first quiz
              </ButtonLink>
            </div>
          </Card>
        </Container>
      </section>
    </div>
  );
}
