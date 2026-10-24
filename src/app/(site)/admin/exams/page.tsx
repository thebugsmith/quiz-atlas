import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ExamAdmin } from "@/features/admin/exam-admin";

export const metadata: Metadata = {
  title: "Exam papers",
  robots: { index: false, follow: false },
};

export const instant = false;

export default function AdminExamsPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Exam papers</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Publication is gated on a complete key and a rule version. A key amendment creates a new
          key version; regrading records a separate result and leaves the original marks alone.
        </p>
      </header>
      <ExamAdmin />
    </Container>
  );
}
