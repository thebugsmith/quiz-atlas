"use client";

import { useCallback, useEffect, useState } from "react";

type Paper = {
  slug: string;
  label: string;
  exam: string;
  year: number;
  status: "draft" | "published" | "archived";
  source_status: string;
  items: number;
  keyed: number;
  key_version: number | null;
  key_status: string | null;
  rule_version: number | null;
  attempts: number;
  results: number;
};

type Attempt = { attempt_id: string; submitted_at: string; total_exact: string; regrades: number };

const field = "border-border bg-background h-9 rounded-[var(--radius-control)] border px-2 text-sm";

export function ExamAdmin() {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [position, setPosition] = useState("1");
  const [accepted, setAccepted] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<{ papers?: Paper[]; error?: string }> => {
    const response = await fetch("/api/admin/exams", { cache: "no-store" });
    if (response.status === 403) {
      return { error: "This account is not an admin." };
    }
    if (!response.ok) {
      return { error: "Could not load papers." };
    }
    const data = (await response.json()) as { papers: Paper[] };
    return { papers: data.papers };
  }, []);

  useEffect(() => {
    const start = async () => {
      const result = await load();
      if (result.error) setError(result.error);
      if (result.papers) setPapers(result.papers);
    };
    void start();
  }, [load]);

  const loadAttempts = useCallback(async (slug: string) => {
    const response = await fetch(`/api/admin/exams/${slug}/attempts`, { cache: "no-store" });
    if (!response.ok) {
      setAttempts([]);
      return;
    }
    const data = (await response.json()) as { attempts: Attempt[] };
    setAttempts(data.attempts);
  }, []);

  const setStatus = async (slug: string, status: Paper["status"]) => {
    setMessage(null);
    const response = await fetch(`/api/admin/exams/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setMessage(
        data?.error?.startsWith("incomplete_key")
          ? "Key incomplete: every item needs an answer."
          : (data?.error ?? "Failed"),
      );
      return;
    }
    setMessage(`Set ${slug} to ${status}.`);
    const refreshed = await load();
    if (refreshed.papers) setPapers(refreshed.papers);
  };

  const amendKey = async (slug: string) => {
    setMessage(null);
    const ids = accepted
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const changes = ids.length ? [{ position: Number(position), accepted_option_ids: ids }] : [];
    if (changes.length === 0) {
      setMessage("Give at least one accepted option id.");
      return;
    }
    const response = await fetch(`/api/admin/exams/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "amend-key", publish: false, changes }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      key_version?: number;
    } | null;
    if (!response.ok) {
      setMessage(data?.error ?? "Amendment failed");
      return;
    }
    setMessage(`Key version ${data?.key_version} created for ${slug}.`);
    const refreshed = await load();
    if (refreshed.papers) setPapers(refreshed.papers);
  };

  const regrade = async (attemptId: string) => {
    setMessage(null);
    const response = await fetch(`/api/admin/exam-attempts/${attemptId}/regrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_version_id: null }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      total_exact?: string;
    } | null;
    setMessage(response.ok ? `Regraded: ${data?.total_exact}` : (data?.error ?? "Regrade failed"));
  };

  if (error) return <p className="text-sm font-medium">{error}</p>;
  if (!papers) return <p className="text-muted-foreground text-sm">Loading papers</p>;
  if (papers.length === 0) return <p className="text-sm">No papers yet.</p>;

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm font-medium">{message}</p> : null}
      <ul className="space-y-3">
        {papers.map((paper) => (
          <li
            key={paper.slug}
            className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {paper.exam} · {paper.label} ({paper.year})
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {paper.items} items · {paper.keyed} keyed · key v{paper.key_version ?? "—"} (
                  {paper.key_status ?? "none"}) · rule v{paper.rule_version ?? "—"} ·{" "}
                  {paper.attempts} attempts · {paper.results} results ·{" "}
                  {paper.source_status.replaceAll("_", " ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs uppercase">{paper.status}</span>
                <button
                  type="button"
                  className={field}
                  onClick={() => void setStatus(paper.slug, "published")}
                >
                  Publish
                </button>
                <button
                  type="button"
                  className={field}
                  onClick={() => void setStatus(paper.slug, "draft")}
                >
                  Unpublish
                </button>
                <button
                  type="button"
                  className={field}
                  onClick={() => {
                    setSelected(paper.slug);
                    void loadAttempts(paper.slug);
                  }}
                >
                  Review
                </button>
              </div>
            </div>

            {selected === paper.slug ? (
              <div className="border-border mt-3 space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground mb-1 block">Item position</span>
                    <input
                      className={field}
                      value={position}
                      onChange={(event) => setPosition(event.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground mb-1 block">
                      Accepted option ids (comma separated)
                    </span>
                    <input
                      className={`${field} w-64`}
                      value={accepted}
                      onChange={(event) => setAccepted(event.target.value)}
                      placeholder="b"
                    />
                  </label>
                  <button type="button" className={field} onClick={() => void amendKey(paper.slug)}>
                    Amend key
                  </button>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                    Submitted attempts
                  </p>
                  {attempts.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No submitted attempts.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {attempts.map((attempt) => (
                        <li key={attempt.attempt_id} className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            {new Date(attempt.submitted_at).toLocaleString()} ·{" "}
                            {attempt.total_exact} · {attempt.regrades} regrades
                          </span>
                          <button
                            type="button"
                            className={field}
                            onClick={() => void regrade(attempt.attempt_id)}
                          >
                            Regrade with latest key
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
