import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { BookmarksList } from "@/features/quiz/bookmarks-list";

export const metadata: Metadata = {
  title: "Bookmarks",
  description: "Questions you saved while playing.",
};

export default function BookmarksPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bookmarks</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Saved questions live in this browser&rsquo;s guest identity until you create an account.
        </p>
      </header>
      <BookmarksList />
    </Container>
  );
}
