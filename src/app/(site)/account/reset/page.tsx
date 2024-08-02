import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ResetForm } from "@/features/account/reset-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password for your quiz account.",
};

export default function ResetPage() {
  return (
    <Container>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reset password</h1>
        <p className="text-muted-foreground mt-1.5 max-w-prose text-[15px]">
          Follow the link in your email, then choose a new password here.
        </p>
      </header>
      <ResetForm />
    </Container>
  );
}
