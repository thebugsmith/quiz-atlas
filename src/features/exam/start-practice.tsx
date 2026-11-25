"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { localeLabel } from "./locales";

/**
 * Opening an untimed paper: one request creates or resumes the workspace and the client
 * navigates to it. The create key is generated per click, so a double click cannot make a
 * second attempt (and the database refuses one anyway).
 */
export function StartPractice({
  paper,
  mode = "study",
  sections,
  locales,
  disabled,
  label = mode === "timed" ? "Start timed paper" : "Start untimed practice",
}: {
  paper: string;
  mode?: "study" | "timed";
  /** Section ids to include; omitted means every section of the paper. */
  sections?: string[];
  /** Locales the paper can be served in; one option renders no picker. */
  locales?: string[];
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState(locales?.[0] ?? "en");

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/exam-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper,
          mode,
          create_key: crypto.randomUUID(),
          locale,
          ...(sections && sections.length > 0 ? { sections } : {}),
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
      {locales && locales.length > 1 ? (
        <LanguageChoice locales={locales} value={locale} onChange={setLocale} name={paper} />
      ) : null}
      <Button onClick={() => void start()} disabled={busy || disabled} size="sm">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      {error ? <p className="text-warning mt-2 text-xs">{error}</p> : null}
    </div>
  );
}

/** A small radio row; the paper's text is frozen in the chosen language at creation. */
export function LanguageChoice({
  locales,
  value,
  onChange,
  name,
}: {
  locales: string[];
  value: string;
  onChange: (locale: string) => void;
  name: string;
}) {
  return (
    <fieldset className="mb-3">
      <legend className="text-muted-foreground mb-1 text-xs">Language</legend>
      <div className="flex flex-wrap gap-1.5">
        {locales.map((code) => (
          <label
            key={code}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              code === value
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-border text-muted-foreground hover:bg-surface-muted",
            )}
          >
            <input
              type="radio"
              name={`locale-${name}`}
              className="sr-only"
              checked={code === value}
              onChange={() => onChange(code)}
            />
            {localeLabel(code)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
