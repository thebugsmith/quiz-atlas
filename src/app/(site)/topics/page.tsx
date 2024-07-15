import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { TopicsBrowser } from "@/features/topics/topics-browser";

export const metadata: Metadata = {
  title: "Topics",
  description: "Browse every quiz topic in Quiz Atlas.",
};

export default function TopicsPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Topics</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Six topics at launch. Subtopics and tags widen the selection once the question bank is
          imported.
        </p>
      </header>
      <TopicsBrowser />
    </Container>
  );
}
