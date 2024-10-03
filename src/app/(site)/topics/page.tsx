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
          Every topic is live from the question bank, with its current inventory shown. Pick one to
          start, or mix them all on the setup screen.
        </p>
      </header>
      <TopicsBrowser />
    </Container>
  );
}
