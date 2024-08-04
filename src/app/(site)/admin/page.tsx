import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { AdminShell } from "@/features/admin/admin-shell";

export const metadata: Metadata = {
  title: "Content",
  description: "Editor tools for the question bank.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Content</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Editing creates a new version; the published one players answered stays untouched until
          you publish the draft.
        </p>
      </header>
      <AdminShell />
    </Container>
  );
}
