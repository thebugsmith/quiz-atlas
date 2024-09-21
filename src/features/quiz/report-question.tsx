"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";

const reasons = [
  { value: "incorrect_answer", label: "The answer is wrong" },
  { value: "ambiguous", label: "The question is ambiguous" },
  { value: "outdated", label: "The fact is out of date" },
  { value: "typo", label: "Typo or formatting" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
] as const;

const field =
  "border-border bg-surface focus-visible:outline-primary w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Reports are tied to the exact version on screen, so a moderator can act on what this
 * player saw without touching anything already answered.
 */
export function ReportQuestion({
  questionVersionId,
  attemptId,
}: {
  questionVersionId: string;
  attemptId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number]["value"]>("incorrect_answer");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionVersionId,
        attemptId,
        reason,
        details: details.trim() === "" ? null : details,
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(
        body?.error === "already_reported"
          ? "You already reported this question. It is with the moderators."
          : body?.error === "too_many_reports"
            ? "That is a lot of reports in a short time. Try again later."
            : body?.error === "invalid_request"
              ? "Please shorten the detail to 1000 characters."
              : "Could not send that report. Check your connection.",
      );
      return;
    }

    setMessage("Thanks. The moderators will look at this version.");
    setDetails("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
        >
          <Flag className="size-3.5" aria-hidden="true" />
          Report a problem with this question
        </button>
        {message ? (
          <p className="text-success mt-1 text-xs" role="status">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-border bg-surface-muted mt-4 space-y-2 rounded-[var(--radius-control)] border p-3"
    >
      <label htmlFor="report-reason" className="block text-sm font-medium">
        What is wrong?
      </label>
      <select
        id="report-reason"
        className={field}
        value={reason}
        onChange={(event) => setReason(event.target.value as typeof reason)}
      >
        {reasons.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      <label htmlFor="report-details" className="block text-sm font-medium">
        Details (optional, up to 1000 characters)
      </label>
      <textarea
        id="report-details"
        className={field}
        rows={3}
        maxLength={1000}
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>

      {error ? (
        <p className="text-danger text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
