"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QuestionEditor,
  emptyQuestion,
  type EditorQuestion,
} from "@/features/admin/question-editor";

type InventoryTopic = {
  slug: string;
  name: string;
  is_active: boolean;
  live: number;
  drafts: number;
  archived: number;
};

type AdminQuestion = {
  question_id: string;
  external_id: string;
  prompt: string;
  topic_slug: string;
  topic_name: string;
  difficulty: string;
  question_type: string;
  state: "live" | "draft" | "archived";
  has_draft: boolean;
  version_count: number;
  updated_at: string;
};

type ImportRow = {
  row: number;
  externalId: string;
  outcome: "created" | "updated" | "unchanged" | "failed";
  detail?: string;
};

const field =
  "border-border bg-surface focus-visible:outline-primary w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";

export function AdminShell() {
  const [tab, setTab] = useState<"questions" | "reports" | "topics" | "import">("questions");
  const [inventory, setInventory] = useState<{
    topics: InventoryTopic[];
    low_inventory: string[];
  } | null>(null);
  const [denied, setDenied] = useState<"role" | "session" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/inventory", { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) {
        setDenied("session");
        return;
      }
      if (response.status === 403) {
        setDenied("role");
        return;
      }
      if (response.ok) setInventory(await response.json());
      else setDenied("role");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) {
    return (
      <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
        <h2 className="font-semibold">{denied === "session" ? "Sign in first" : "Editors only"}</h2>
        {denied === "session" ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Content tools need a permanent account with an editing role.{" "}
            <a href="/account" className="text-primary underline-offset-4 hover:underline">
              Go to your account
            </a>
            .
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">
            This account does not have an editing role. Ask an administrator to grant one with
            <code className="bg-surface-muted mx-1 rounded px-1.5 py-0.5 text-xs">
              pnpm admin:grant --email …
            </code>
            .
          </p>
        )}
      </div>
    );
  }

  if (!inventory) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading the question bank…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Content management" className="flex flex-wrap gap-2">
        {(
          [
            { value: "questions", label: "Questions" },
            { value: "reports", label: "Reports" },
            { value: "topics", label: "Topics" },
            { value: "import", label: "Import" },
          ] as const
        ).map((item) => (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={
              tab === item.value
                ? "bg-primary-soft text-primary rounded-full px-3.5 py-1.5 text-sm font-medium"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground rounded-full px-3.5 py-1.5 text-sm font-medium"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {inventory.low_inventory.length > 0 ? (
        <p className="border-warning-border bg-warning-soft text-foreground rounded-[var(--radius-card)] border px-4 py-3 text-sm">
          Thin inventory (fewer than five live questions): {inventory.low_inventory.join(", ")}.
        </p>
      ) : null}

      {tab === "questions" ? <QuestionsTab topics={inventory.topics} /> : null}
      {tab === "reports" ? <ReportsTab /> : null}
      {tab === "topics" ? (
        <TopicsTab topics={inventory.topics} onSaved={() => location.reload()} />
      ) : null}
      {tab === "import" ? <ImportTab /> : null}
    </div>
  );
}

function QuestionsTab({ topics }: { topics: InventoryTopic[] }) {
  const [rows, setRows] = useState<AdminQuestion[] | null>(null);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [state, setState] = useState("live");
  const [editing, setEditing] = useState<EditorQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ state, query, topic, difficulty, type, limit: "100" });
    const response = await fetch(`/api/admin/questions?${params}`, { cache: "no-store" });
    if (response.ok) {
      const body = await response.json();
      setRows(body.questions ?? []);
    }
  }, [state, query, topic, difficulty, type]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function openEditor(questionId: string) {
    const response = await fetch(`/api/admin/questions/${questionId}`, { cache: "no-store" });
    if (!response.ok) return;
    const detail = await response.json();
    const source = detail.draft ?? detail.current;
    if (!source) return;

    setEditing({
      questionId: detail.question_id,
      externalId: detail.external_id,
      topicSlug: source.topic_slug,
      difficulty: source.difficulty,
      type: source.question_type,
      stem: source.stem ?? "",
      statements: source.statements ?? [],
      prompt: source.prompt,
      options: source.options,
      correctOptionId: source.correct_option_id,
      explanation: source.explanation ?? "",
    });
  }

  async function act(questionId: string, action: "publish" | "archive" | "restore") {
    const body =
      action === "archive"
        ? { action: "archive", archived: true }
        : action === "restore"
          ? { action: "archive", archived: false }
          : { action: "publish" };
    const response = await fetch(`/api/admin/questions/${questionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setNotice(
      response.ok
        ? action === "publish"
          ? "Published the newest version."
          : action === "archive"
            ? "Archived — it can no longer be dealt."
            : "Restored. Publish it again to make it playable."
        : (payload?.error ?? "That action failed."),
    );
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          aria-label="Search questions"
          className={field}
          placeholder="Search prompt or id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter by topic"
          className={field}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        >
          <option value="">All topics</option>
          {topics.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by difficulty"
          className={field}
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="">Any difficulty</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <select
          aria-label="Filter by type"
          className={field}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">Any type</option>
          <option value="mcq">mcq</option>
          <option value="comprehension">comprehension</option>
        </select>
        <select
          aria-label="Filter by state"
          className={field}
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="live">Live</option>
          <option value="draft">Drafts</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing(emptyQuestion(topics[0]?.slug ?? "history"))}>
          <Plus className="size-4" aria-hidden="true" />
          New question
        </Button>
        {notice ? (
          <p className="text-muted-foreground text-sm" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      {editing ? (
        <QuestionEditor
          value={editing}
          topics={topics.map((item) => ({ slug: item.slug, name: item.name }))}
          onChange={setEditing}
          onSaved={(result) => {
            setEditing({ ...editing, questionId: result.questionId });
            void load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {rows === null ? (
        <p className="text-muted-foreground text-sm" role="status">
          Loading questions…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No questions match those filters.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.question_id}
              className="border-border bg-surface rounded-[var(--radius-card)] border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        row.state === "live"
                          ? "success"
                          : row.state === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {row.state}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {row.topic_name} · {row.difficulty} · {row.question_type} · v
                      {row.version_count}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm break-words">{row.prompt ?? "(no prompt yet)"}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{row.external_id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="quiet" size="sm" onClick={() => openEditor(row.question_id)}>
                    Edit
                  </Button>
                  {row.state !== "live" && row.state !== "archived" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => act(row.question_id, "publish")}
                    >
                      Publish
                    </Button>
                  ) : null}
                  {row.state === "archived" ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => act(row.question_id, "restore")}
                    >
                      <ArchiveRestore className="size-4" aria-hidden="true" />
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => act(row.question_id, "archive")}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ReportRow = {
  report_id: string;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  question_id: string;
  question_version_id: string;
  version_number: number;
  prompt: string;
  external_id: string;
  topic_name: string;
  quarantined: boolean;
  archived: boolean;
  resolution_note: string | null;
  resolved_at: string | null;
};

function ReportsTab() {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/reports?status=${status}`, { cache: "no-store" });
    if (response.ok) {
      const body = await response.json();
      setRows(body.reports ?? []);
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/reports?status=${status}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { reports: [] }))
      .then((body) => {
        if (!cancelled) setRows(body.reports ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function resolve(reportId: string, next: "resolved" | "dismissed") {
    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next, note: notes[reportId] ?? null }),
    });
    setNotice(response.ok ? `Report ${next}.` : "Could not record that decision.");
    if (response.ok) void load();
  }

  async function quarantine(questionId: string, quarantined: boolean) {
    const response = await fetch(`/api/admin/questions/${questionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "quarantine", quarantined, note: "From the report queue" }),
    });
    setNotice(
      response.ok
        ? quarantined
          ? "Quarantined — no new quiz will include it."
          : "Released back into the pool."
        : "Could not change quarantine.",
    );
    if (response.ok) void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Filter reports by status"
          className={field}
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
        {notice ? (
          <p className="text-muted-foreground text-sm" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        Each report names the version the player saw. Resolving or dismissing records a note and an
        audit entry; it never changes an answer, a score or a stored result. Quarantine only stops
        the question being dealt to new quizzes.
      </p>

      {rows === null ? (
        <p className="text-muted-foreground text-sm" role="status">
          Loading reports…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.report_id}
              className="border-border bg-surface rounded-[var(--radius-card)] border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    row.status === "open"
                      ? "warning"
                      : row.status === "resolved"
                        ? "success"
                        : "neutral"
                  }
                >
                  {row.status}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {row.reason.replace(/_/g, " ")} · {row.topic_name} · v{row.version_number} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </span>
                {row.quarantined ? <Badge tone="neutral">quarantined</Badge> : null}
              </div>
              <p className="mt-1.5 text-sm break-words">{row.prompt}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{row.external_id}</p>
              {row.details ? (
                <p className="bg-surface-muted mt-2 rounded p-2 text-sm">{row.details}</p>
              ) : null}
              {row.resolution_note ? (
                <p className="text-muted-foreground mt-2 text-xs">Note: {row.resolution_note}</p>
              ) : null}

              {row.status === "open" ? (
                <div className="mt-2 space-y-2">
                  <input
                    aria-label={`Resolution note for ${row.external_id}`}
                    className={field}
                    placeholder="Resolution note (optional)"
                    value={notes[row.report_id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [row.report_id]: event.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => resolve(row.report_id, "resolved")}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => resolve(row.report_id, "dismissed")}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => quarantine(row.question_id, !row.quarantined)}
                    >
                      {row.quarantined ? "Release" : "Quarantine"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicsTab({ topics, onSaved }: { topics: InventoryTopic[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<
    { slug: string; name: string; isActive: boolean; sortOrder: number }[]
  >(
    topics.map((topic, index) => ({
      slug: topic.slug,
      name: topic.name,
      isActive: topic.is_active,
      sortOrder: index,
    })),
  );
  const [notice, setNotice] = useState<string | null>(null);

  async function save(topic: { slug: string; name: string; isActive: boolean; sortOrder: number }) {
    const response = await fetch("/api/admin/topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...topic, description: "" }),
    });
    setNotice(response.ok ? `Saved ${topic.slug}.` : `Could not save ${topic.slug}.`);
    if (response.ok) onSaved();
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Topics are data: a new or renamed topic needs no deploy. Inactive topics stop being dealt
        and disappear from the picker.
      </p>
      <ul className="space-y-2">
        {draft.map((topic, index) => {
          const counts = topics.find((item) => item.slug === topic.slug);
          return (
            <li
              key={topic.slug}
              className="border-border bg-surface flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border p-3"
            >
              <div className="min-w-32">
                <p className="text-muted-foreground text-xs">{topic.slug}</p>
                <input
                  aria-label={`Name for ${topic.slug}`}
                  className={field}
                  value={topic.name}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...topic, name: event.target.value };
                    setDraft(next);
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={topic.isActive}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...topic, isActive: event.target.checked };
                    setDraft(next);
                  }}
                />
                active
              </label>
              <span className="text-muted-foreground text-xs">
                {counts ? `${counts.live} live · ${counts.drafts} drafts` : "0 live"}
              </span>
              <Button variant="quiet" size="sm" onClick={() => save(topic)}>
                Save
              </Button>
            </li>
          );
        })}
      </ul>
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function ImportTab() {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [content, setContent] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setSummary(null);
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, format, dryRun }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok || !body) {
      setSummary(body?.detail ?? body?.error ?? "Import failed.");
      setRows(null);
      return;
    }

    setRows(body.outcomes ?? []);
    setSummary(
      `${dryRun ? "Preview" : "Imported"}: ${body.valid} valid, ${body.failed} rejected of ${body.total}.`,
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Upload the same JSON shape as{" "}
        <code className="bg-surface-muted rounded px-1.5 py-0.5 text-xs">
          data/questions/*.json
        </code>
        , or a CSV with columns{" "}
        <code className="bg-surface-muted rounded px-1.5 py-0.5 text-xs">
          external_id, topic, difficulty, type, prompt, option_1…option_4, correct_option_id
        </code>
        . Rows are validated by the import schema before anything is written; new rows arrive as
        drafts.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={format === "json"} onChange={() => setFormat("json")} />
          JSON
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} />
          CSV
        </label>
        <input
          type="file"
          accept=".json,.csv,text/csv,application/json"
          aria-label="Choose a file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setContent(await file.text());
            setFormat(file.name.endsWith(".csv") ? "csv" : "json");
          }}
          className="text-sm"
        />
      </div>

      <textarea
        aria-label="Rows to import"
        className={field}
        rows={10}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder='{"questions": [ … ]}'
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => run(true)}
          disabled={busy || content.trim() === ""}
        >
          Preview
        </Button>
        <Button onClick={() => run(false)} disabled={busy || content.trim() === ""}>
          <Upload className="size-4" aria-hidden="true" />
          Import
        </Button>
      </div>

      {summary ? (
        <p className="text-sm" role="status">
          {summary}
        </p>
      ) : null}

      {rows ? (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.row} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                tone={
                  row.outcome === "failed"
                    ? "warning"
                    : row.outcome === "unchanged"
                      ? "neutral"
                      : "success"
                }
              >
                {row.outcome}
              </Badge>
              <span className="text-muted-foreground">
                row {row.row} · {row.externalId || "(no id)"}
              </span>
              {row.detail ? (
                <span className="text-muted-foreground text-xs">{row.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
