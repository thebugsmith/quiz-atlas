"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opening an untimed paper: one request creates or resumes the workspace and the client
 * navigates to it. The create key is generated per click, so a double click cannot make a
 * second attempt (and the database refuses one anyway).
 */
export function StartPractice({ paper, disabled }: { paper: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/exam-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper,
          mode: "study",
          create_key: crypto.randomUUID(),
        }),
      });
      if (response.status === 401) {
        setError("Sign in, or start a guest session, to keep your progress.");
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          payload?.error === "paper_not_published"
            ? "This paper is still in review."
            : "Could not open the paper. Try again.",
        );
        return;
      }
      const data = (await response.json()) as { attempt_id: string };
      router.push(`/exam-attempts/${data.attempt_id}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <Button onClick={() => void start()} disabled={busy || disabled} size="sm">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Start untimed practice
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      {error ? <p className="text-warning mt-2 text-xs">{error}</p> : null}
    </div>
  );
}
