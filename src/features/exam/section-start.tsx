"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageChoice } from "./start-practice";

type Section = { id: string; subject: string; items: number };

/**
 * Choosing which parts of a paper to practise. Every section starts selected, so the default
 * is still "the whole paper"; unticking a subject narrows the attempt to the rest. The scope
 * is sent once, at creation, and the attempt keeps only those items.
 */
export function SectionStart({
  paper,
  sections,
  locales,
}: {
  paper: string;
  sections: Section[];
  locales?: string[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(() => sections.map((section) => section.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState(locales?.[0] ?? "en");

  const all = sections.reduce((total, section) => total + section.items, 0);
  const picked = sections
    .filter((section) => chosen.includes(section.id))
    .reduce((total, section) => total + section.items, 0);

  const toggle = (id: string) => {
    setChosen((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const start = async () => {
    if (chosen.length === 0) return;
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
          locale,
          sections: chosen,
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
    <div className="mt-4 space-y-3">
      {locales && locales.length > 1 ? (
        <LanguageChoice locales={locales} value={locale} onChange={setLocale} name={paper} />
      ) : null}
      <fieldset>
        <legend className="text-muted-foreground mb-2 text-xs font-medium">
          Subjects to include
        </legend>
        <ul className="space-y-1.5">
          {sections.map((section) => {
            const on = chosen.includes(section.id);
            return (
              <li key={section.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-1 py-1 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(section.id)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {section.subject}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {section.items} {section.items === 1 ? "question" : "questions"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <p className="text-muted-foreground text-xs">
        {picked} of {all} questions selected
      </p>

      <Button onClick={() => void start()} disabled={busy || chosen.length === 0} size="sm">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Start {chosen.length === sections.length ? "the paper" : "selected subjects"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      {error ? <p className="text-warning text-xs">{error}</p> : null}
    </div>
  );
}
