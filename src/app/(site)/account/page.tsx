import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { AccountShell } from "@/features/account/account-shell";

export const metadata: Metadata = {
  title: "Account",
  description: "Create an account or sign in to keep your quizzes.",
};

export default function AccountPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Guests can play everything. An account keeps the results, bookmarks and daily runs.
        </p>
      </header>
      <Suspense
        fallback={
          <p className="text-muted-foreground text-sm" role="status">
            Loading…
          </p>
        }
      >
        <AccountShell />
      </Suspense>
    </Container>
  );
}
