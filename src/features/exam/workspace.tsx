"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Flag, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isAnswered, type Manifest, type ManifestItem, type ResponseValue } from "./manifest";
import { clearOtherOwners, dropEdit, pendingFor, queueEdit } from "./outbox";

type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

type Conflict = { itemId: string; local: ResponseValue | null; saved: ResponseValue | null };

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "Saving",
  saved: "Saved",
  error: "Not saved, retrying",
  offline: "Offline, changes on this device only",
};

/**
 * The untimed workspace.
 *
 * Every accepted edit is a small PATCH carrying the revision this client last saw. Edits
 * for one item are serialised, so two quick clicks cannot race each other into a stale
 * write. A conflict is shown to the player as a choice instead of being resolved by
 * silently keeping whichever request arrived last.
 */
export function ExamWorkspace({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [numericDraft, setNumericDraft] = useState<Record<string, string>>({});
  const [numbersVisible, setNumbersVisible] = useState(true);
  const [pinnedTab, setPinnedTab] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    itemId: string;
    status: string;
    award: string;
    explanation: string | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const [bookmarked, setBookmarked] = useState(false);

  const stateRef = useRef<Manifest | null>(null);
  const ackedRevision = useRef<Map<string, number>>(new Map());
  const savedValue = useRef<Map<string, string>>(new Map());
  const chain = useRef<Map<string, Promise<void>>>(new Map());

  const load = useCallback(async () => {
    const response = await fetch(`/api/exam-attempts/${attemptId}`, { cache: "no-store" });
    if (!response.ok) {
      setLoadError(
        response.status === 404
          ? "This paper is not open for this account."
          : "Could not load the paper.",
      );
      return;
    }
    const data = (await response.json()) as Manifest;
    stateRef.current = data;
    setManifest(data);
    setLoadError(null);
    for (const item of data.items) {
      ackedRevision.current.set(item.item_id, item.response?.revision ?? 0);
      savedValue.current.set(item.item_id, JSON.stringify(item.response?.value ?? null));
    }
    const index = data.cursor_item_id
      ? data.items.findIndex((item) => item.item_id === data.cursor_item_id)
      : 0;
    setCurrent(index >= 0 ? index : 0);
  }, [attemptId]);

  useEffect(() => {
    // The loader awaits its fetch before touching state; the rule cannot see through it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((data: { user: { id: string } | null }) => {
        if (!cancelled && data.user) setOwner(data.user.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => manifest?.items ?? [], [manifest]);
  const item: ManifestItem | undefined = items[current];

  const updateItem = useCallback((itemId: string, change: (item: ManifestItem) => ManifestItem) => {
    setManifest((previous) => {
      if (!previous) return previous;
      const next = {
        ...previous,
        items: previous.items.map((entry) => (entry.item_id === itemId ? change(entry) : entry)),
      };
      next.answered = next.items.filter((entry) => isAnswered(entry)).length;
      stateRef.current = next;
      return next;
    });
  }, []);

  /** Send one edit. Returns "saved", "conflict" or "offline". */
  const sendEdit = useCallback(
    async (
      itemId: string,
      value: ResponseValue | null,
      baseRevision: number,
      mutationKey: string,
    ): Promise<"saved" | "conflict" | "offline"> => {
      try {
        const response = await fetch(`/api/exam-attempts/${attemptId}/responses/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: value,
            expected_revision: baseRevision,
            mutation_key: mutationKey,
          }),
        });

        if (response.status === 409) {
          const payload = (await response.json()) as { error?: string; current?: number };
          if (payload.error === "stale_revision") {
            const fresh = await fetch(`/api/exam-attempts/${attemptId}`, { cache: "no-store" });
            if (fresh.ok) {
              const server = (await fresh.json()) as Manifest;
              const serverItem = server.items.find((entry) => entry.item_id === itemId);
              ackedRevision.current.set(itemId, serverItem?.response?.revision ?? 0);
              savedValue.current.set(itemId, JSON.stringify(serverItem?.response?.value ?? null));
              setConflict({
                itemId,
                local: value,
                saved: serverItem?.response?.value ?? null,
              });
              setSaveState("error");
              return "conflict";
            }
          }
          throw new Error("conflict");
        }

        if (!response.ok) throw new Error(String(response.status));

        const ack = (await response.json()) as { revision: number; response: ResponseValue | null };
        ackedRevision.current.set(itemId, ack.revision);
        savedValue.current.set(itemId, JSON.stringify(ack.response ?? null));
        updateItem(itemId, (entry) => ({
          ...entry,
          response: {
            ...(entry.response ?? { checked: false, revealed: false, visited: true }),
            value: ack.response,
            revision: ack.revision,
            visited: true,
            marked: entry.response?.marked ?? false,
          },
        }));
        setSaveState("saved");
        return "saved";
      } catch {
        setSaveState(navigator.onLine ? "error" : "offline");
        return "offline";
      }
    },
    [attemptId, updateItem],
  );

  /** Keep the pending count honest: unsynced edits are not saved work. */
  const refreshPending = useCallback(async () => {
    if (!owner) return;
    setPending((await pendingFor(owner, attemptId)).length);
  }, [attemptId, owner]);

  /** Send the current intent for one item, serialised with any in-flight save. */
  const flush = useCallback(
    async (itemId: string) => {
      const previous = chain.current.get(itemId) ?? Promise.resolve();
      const task = previous.then(async () => {
        const snapshot = stateRef.current?.items.find((entry) => entry.item_id === itemId);
        if (!snapshot) return;

        const intent = JSON.stringify(snapshot.response?.value ?? null);
        if (savedValue.current.get(itemId) === intent) return;

        setSaveState("saving");
        const baseRevision = ackedRevision.current.get(itemId) ?? 0;
        const mutationKey = crypto.randomUUID();
        const outcome = await sendEdit(
          itemId,
          snapshot.response?.value ?? null,
          baseRevision,
          mutationKey,
        );

        if (outcome === "offline" && owner) {
          await queueEdit({
            key: `${attemptId}:${itemId}`,
            owner,
            attemptId,
            itemId,
            value: snapshot.response?.value ?? null,
            baseRevision,
            mutationKey,
            queuedAt: Date.now(),
          });
        }
        await refreshPending();
      });

      chain.current.set(
        itemId,
        task.catch(() => undefined),
      );
      await task;
    },
    [attemptId, owner, refreshPending, sendEdit],
  );

  /** Apply queued edits after a reconnect, but only on the revision they were based on. */
  const flushOutbox = useCallback(async () => {
    if (!owner || !navigator.onLine) return;
    const entries = await pendingFor(owner, attemptId);
    for (const entry of entries) {
      const base = ackedRevision.current.get(entry.itemId) ?? 0;
      if (base !== entry.baseRevision) {
        // The item moved on while this edit waited: ask, do not overwrite.
        setConflict({ itemId: entry.itemId, local: entry.value, saved: null });
        await dropEdit(attemptId, entry.itemId);
        continue;
      }
      const outcome = await sendEdit(
        entry.itemId,
        entry.value,
        entry.baseRevision,
        entry.mutationKey,
      );
      if (outcome !== "offline") await dropEdit(attemptId, entry.itemId);
      if (outcome === "conflict") continue;
    }
    await refreshPending();
  }, [attemptId, owner, refreshPending, sendEdit]);

  const applyResponse = useCallback(
    (value: ResponseValue | null) => {
      if (!item) return;
      updateItem(item.item_id, (entry) => ({
        ...entry,
        response: {
          value,
          revision: entry.response?.revision ?? 0,
          marked: entry.response?.marked ?? false,
          visited: true,
          checked: entry.response?.checked ?? false,
          revealed: entry.response?.revealed ?? false,
        },
      }));
      void flush(item.item_id);
    },
    [flush, item, updateItem],
  );

  const goTo = useCallback(
    (index: number) => {
      const target = items[index];
      if (!target) return;
      setCurrent(index);
      setPinnedTab(null);
      setFeedback(null);
      setNoteState("idle");
      setNote("");
      setBookmarked(false);
      setNumericDraft((draft) => ({ ...draft, [target.item_id]: "" }));
      void fetch(`/api/exam-attempts/${attemptId}/cursor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: target.item_id }),
      });
    },
    [attemptId, items],
  );

  const toggleMarked = useCallback(async () => {
    if (!item) return;
    const next = !(item.response?.marked ?? false);
    updateItem(item.item_id, (entry) => ({
      ...entry,
      response: {
        value: entry.response?.value ?? null,
        revision: entry.response?.revision ?? 0,
        marked: next,
        visited: true,
        checked: entry.response?.checked ?? false,
        revealed: entry.response?.revealed ?? false,
      },
    }));
    const response = await fetch(`/api/exam-attempts/${attemptId}/marked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.item_id, marked: next }),
    });
    if (!response.ok) {
      updateItem(item.item_id, (entry) => ({
        ...entry,
        response: entry.response ? { ...entry.response, marked: !next } : entry.response,
      }));
      setSaveState("error");
    }
  }, [attemptId, item, updateItem]);

  const resolveConflict = useCallback(
    async (keepMine: boolean) => {
      if (!conflict) return;
      const target = conflict;
      setConflict(null);
      if (keepMine) {
        await flush(target.itemId);
        return;
      }
      updateItem(target.itemId, (entry) => ({
        ...entry,
        response: entry.response ? { ...entry.response, value: target.saved } : entry.response,
      }));
      savedValue.current.set(target.itemId, JSON.stringify(target.saved));
      setSaveState("saved");
    },
    [conflict, flush, updateItem],
  );

  useEffect(() => {
    if (!owner) return;
    // Runs after the first await, so no state is set during the effect itself.
    const prepare = async () => {
      await clearOtherOwners(owner);
      setPending((await pendingFor(owner, attemptId)).length);
      await flushOutbox();
    };
    void prepare();
  }, [attemptId, flushOutbox, owner]);

  useEffect(() => {
    if (!manifest?.deadline_at) return;
    // Server time, not the browser's: the offset is applied once and the countdown then
    // runs on a monotonic local interval, so changing the system clock does not help.
    const offset = manifest.server_now ? Date.parse(manifest.server_now) - Date.now() : 0;
    const deadline = Date.parse(manifest.deadline_at);
    const tick = () =>
      setRemaining(Math.max(0, Math.floor((deadline - (Date.now() + offset)) / 1000)));
    // First tick on the next macrotask: no state is set during the effect itself.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [manifest?.deadline_at, manifest?.server_now]);

  useEffect(() => {
    if (remaining !== 0 || !manifest || manifest.mode !== "timed" || manifest.state !== "active")
      return;
    const close = async () => {
      await fetch(`/api/exam-attempts/${attemptId}/submit`, { method: "POST" });
      router.push(`/exam-results/${attemptId}`);
    };
    void close();
  }, [attemptId, manifest, remaining, router]);

  useEffect(() => {
    const onOnline = () => void flushOutbox();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushOutbox]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight") goTo(Math.min(current + 1, items.length - 1));
      if (event.key === "ArrowLeft") goTo(Math.max(current - 1, 0));
      if (event.key.toLowerCase() === "m") void toggleMarked();
      if (item?.type === "single_choice") {
        const index = ["a", "b", "c", "d", "e"].indexOf(event.key.toLowerCase());
        const numeric = Number(event.key) - 1;
        const option = item.options[Number.isInteger(numeric) && numeric >= 0 ? numeric : index];
        if (option && (index >= 0 || Number.isInteger(numeric))) {
          applyResponse({ kind: "single", option_id: option.id });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyResponse, current, goTo, item, items.length, toggleMarked]);

  const sections = useMemo(() => {
    const seen = new Map<string, number[]>();
    items.forEach((entry, index) => {
      const key = entry.section ?? "Paper";
      seen.set(key, [...(seen.get(key) ?? []), index]);
    });
    return [...seen.entries()];
  }, [items]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <p className="text-sm font-medium">{loadError}</p>
        <Link href="/exams" className="text-primary mt-3 inline-block text-sm hover:underline">
          Back to exam library
        </Link>
      </div>
    );
  }

  if (!manifest || !item) {
    return (
      <div className="text-muted-foreground flex min-h-64 items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading paper
      </div>
    );
  }

  const answeredCount = manifest.items.filter(isAnswered).length;
  const markedCount = manifest.items.filter((entry) => entry.response?.marked).length;
  const activeTab = pinnedTab ?? item.section ?? sections[0]?.[0] ?? "";

  return (
    <div className="bg-exam-canvas min-h-dvh">
      <a
        href="#question"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to the question
      </a>
      <header className="border-exam-tile-border bg-exam-panel sticky top-0 z-20 border-b">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              {manifest.paper.label ?? manifest.paper.slug}
            </p>
            <p className="text-muted-foreground text-xs">
              {manifest.mode === "timed" ? "Timed paper" : "Untimed practice"} · {answeredCount} of{" "}
              {manifest.items.length} answered · {markedCount} marked
              {remaining !== null
                ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-xs",
                saveState === "error" || saveState === "offline"
                  ? "text-warning"
                  : "text-muted-foreground",
              )}
              aria-live="polite"
              role="status"
            >
              {pending > 0
                ? `${pending} change${pending === 1 ? "" : "s"} on this device only`
                : SAVE_LABEL[saveState]}
            </span>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="bg-primary text-primary-foreground inline-flex h-9 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium"
            >
              Finish paper
            </button>
            <button
              type="button"
              onClick={async () => {
                await flushOutbox();
                router.push("/exams");
              }}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-[var(--radius-control)] border px-3 text-sm font-medium"
            >
              Save &amp; exit
            </button>
          </div>
        </div>
      </header>

      {confirming ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="bg-surface border-border w-full max-w-md rounded-[var(--radius-card)] border p-5">
            <h2 className="text-lg font-semibold tracking-tight">Submit this paper?</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {answeredCount} answered · {manifest.items.length - answeredCount} unanswered ·{" "}
              {markedCount} marked for review.
            </p>
            {pending > 0 ? (
              <p className="text-warning mt-2 text-sm">
                {pending} change{pending === 1 ? " is" : "s are"} still on this device. Reconnect
                and save before submitting, or submit without them.
              </p>
            ) : null}
            <p className="text-muted-foreground mt-2 text-sm">
              Marks are calculated once. A submitted paper cannot be edited again.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Keep working
              </Button>
              <Button
                size="sm"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const response = await fetch(`/api/exam-attempts/${attemptId}/submit`, {
                      method: "POST",
                    });
                    if (!response.ok) throw new Error(String(response.status));
                    router.push(`/exam-results/${attemptId}`);
                  } catch {
                    setSaveState("error");
                    setConfirming(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Submitting" : "Submit and see result"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {conflict ? (
        <div className="border-warning bg-warning-soft mx-auto mt-3 flex max-w-[1200px] flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-sm">
          <span className="flex-1">
            This answer was also changed somewhere else. Which one should be kept?
          </span>
          <Button size="sm" onClick={() => void resolveConflict(true)}>
            Keep this device
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void resolveConflict(false)}>
            Use saved answer
          </Button>
          <button
            type="button"
            onClick={() => setConflict(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main id="question">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm disabled:opacity-40"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Previous
            </button>
            <p className="text-muted-foreground text-xs">
              {manifest.rule?.choices?.max_questions
                ? `Choose ${manifest.rule.choices.max_questions} · `
                : ""}
              Question {current + 1} of {manifest.items.length}
              {item.section ? ` · ${item.section}` : ""}
            </p>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === manifest.items.length - 1}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm disabled:opacity-40"
            >
              Save &amp; next
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <article className="mt-4">
            {item.stimulus ? (
              <div className="mb-4 grid gap-4 lg:grid-cols-2">
                <div className="border-border bg-background/60 max-h-[28rem] overflow-auto rounded-[var(--radius-control)] border p-4 text-sm leading-relaxed whitespace-pre-line">
                  <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                    {item.stimulus.kind === "passage" ? "Passage" : item.stimulus.kind}
                  </p>
                  {item.stimulus.body}
                  {item.stimulus.media_path ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      This item refers to a figure.
                    </p>
                  ) : null}
                </div>
                <div>
                  {item.stem ? (
                    <p className="text-muted-foreground mb-3 text-sm">{item.stem}</p>
                  ) : null}
                  <h1 className="text-[17px] leading-relaxed font-medium">{item.prompt}</h1>
                  {item.statements.length > 0 ? (
                    <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm">
                      {item.statements.map((statement) => (
                        <li key={statement}>{statement}</li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {item.stem ? (
                  <p className="text-muted-foreground mb-3 text-sm">{item.stem}</p>
                ) : null}
                <h1 className="text-[17px] leading-relaxed font-medium">{item.prompt}</h1>
                {item.statements.length > 0 ? (
                  <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5 text-sm">
                    {item.statements.map((statement) => (
                      <li key={statement}>{statement}</li>
                    ))}
                  </ol>
                ) : null}
              </>
            )}

            <div className="mt-5">
              {item.type === "single_choice" ? (
                <fieldset className="space-y-2">
                  <legend className="text-muted-foreground mb-1 text-xs">Choose one option</legend>
                  {item.options.map((option) => {
                    const selected =
                      item.response?.value?.kind === "single" &&
                      item.response.value.option_id === option.id;
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          "border-exam-tile-border bg-exam-tile hover:bg-exam-tile-hover flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-3 text-sm transition-colors",
                          selected && "border-primary bg-primary-soft",
                        )}
                      >
                        <input
                          type="radio"
                          name={`item-${item.item_id}`}
                          className="mt-0.5"
                          checked={selected}
                          onChange={() => applyResponse({ kind: "single", option_id: option.id })}
                        />
                        <span>
                          <span className="text-muted-foreground mr-2 font-medium">
                            {option.label}
                          </span>
                          {option.text}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              {item.type === "multiple_select" ? (
                <fieldset className="space-y-2">
                  <legend className="text-muted-foreground mb-1 text-xs">
                    Select every correct option
                  </legend>
                  {item.options.map((option) => {
                    const selectedIds =
                      item.response?.value?.kind === "multiple"
                        ? item.response.value.option_ids
                        : [];
                    const selected = selectedIds.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          "border-exam-tile-border bg-exam-tile hover:bg-exam-tile-hover flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-3 text-sm transition-colors",
                          selected && "border-primary bg-primary-soft",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected}
                          onChange={() => {
                            const next = selected
                              ? selectedIds.filter((id) => id !== option.id)
                              : [...selectedIds, option.id];
                            applyResponse({ kind: "multiple", option_ids: next });
                          }}
                        />
                        <span>
                          <span className="text-muted-foreground mr-2 font-medium">
                            {option.label}
                          </span>
                          {option.text}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              {item.type === "numerical" ? (
                <div>
                  <label className="block text-sm">
                    <span className="text-muted-foreground mb-1 block text-xs">
                      {item.input?.kind === "integer"
                        ? "Enter a whole number, for example -12"
                        : `Enter a decimal${
                            item.input?.max_decimal_places
                              ? ` to ${item.input.max_decimal_places} decimal places`
                              : ""
                          }, for example 1.41`}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        numericDraft[item.item_id] ??
                        (item.response?.value?.kind === "numerical"
                          ? (item.response.value.value ?? "")
                          : "")
                      }
                      onChange={(event) => {
                        const text = event.target.value;
                        setNumericDraft((draft) => ({ ...draft, [item.item_id]: text }));
                        const fallback =
                          item.response?.value?.kind === "numerical"
                            ? (item.response.value.value ?? "")
                            : "";
                        const valid = /^-?[0-9]{1,9}(\.[0-9]{1,6})?$/.test(text.trim());
                        if (text.trim() === "") {
                          if (fallback !== "") applyResponse({ kind: "numerical", value: null });
                          return;
                        }
                        // Malformed text stays local: it must not overwrite a saved answer.
                        if (!valid) return;
                        applyResponse({ kind: "numerical", value: text.trim() });
                      }}
                      onBlur={() => {
                        const text = numericDraft[item.item_id];
                        if (text === undefined) return;
                        const trimmed = text.trim();
                        if (trimmed !== "" && !/^-?[0-9]{1,9}(\.[0-9]{1,6})?$/.test(trimmed)) {
                          setNumericDraft((draft) => ({ ...draft, [item.item_id]: "" }));
                        }
                      }}
                      className="border-border bg-background h-11 w-full max-w-xs rounded-[var(--radius-control)] border px-3 text-sm"
                      aria-describedby={`hint-${item.item_id}`}
                    />
                  </label>
                  <p id={`hint-${item.item_id}`} className="text-muted-foreground mt-1 text-xs">
                    Negative signs and decimals are allowed. Leave it empty to clear the answer.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button
                variant={item.response?.marked ? "primary" : "secondary"}
                size="sm"
                onClick={() => void toggleMarked()}
                aria-pressed={item.response?.marked ?? false}
              >
                <Flag className="size-4" aria-hidden="true" />
                {item.response?.marked ? "Marked for review" : "Mark for review"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (item.type === "numerical") {
                    setNumericDraft((draft) => ({ ...draft, [item.item_id]: "" }));
                    applyResponse({ kind: "numerical", value: null });
                    return;
                  }
                  applyResponse(
                    item.type === "multiple_select"
                      ? { kind: "multiple", option_ids: [] }
                      : { kind: "single", option_id: null },
                  );
                }}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Clear response
              </Button>
              {manifest.mode === "study" ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isAnswered(item)}
                    onClick={async () => {
                      const response = await fetch(`/api/exam-attempts/${attemptId}/check`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ item_id: item.item_id }),
                      });
                      if (!response.ok) return;
                      const data = (await response.json()) as {
                        status: string;
                        award: string;
                        explanation: string | null;
                      };
                      setFeedback({ itemId: item.item_id, ...data });
                    }}
                  >
                    Check answer
                  </Button>
                </>
              ) : null}
              <Button
                variant="quiet"
                size="sm"
                aria-pressed={bookmarked}
                onClick={async () => {
                  const next = !bookmarked;
                  setBookmarked(next);
                  const response = await fetch(`/api/exam-attempts/${attemptId}/bookmarks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_id: item.item_id, on: next }),
                  });
                  if (!response.ok) setBookmarked(!next);
                }}
              >
                {bookmarked ? "Bookmarked" : "Bookmark"}
              </Button>
              <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                {isAnswered(item) ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" /> Answer saved
                  </>
                ) : (
                  "No answer yet"
                )}
              </span>
            </div>

            {feedback && feedback.itemId === item.item_id ? (
              <div
                className={cn(
                  "mt-4 rounded-[var(--radius-control)] border px-4 py-3 text-sm",
                  feedback.status === "correct"
                    ? "border-success/40 bg-success-soft"
                    : feedback.status === "partial"
                      ? "border-primary/40 bg-primary-soft"
                      : "border-warning/40 bg-warning-soft",
                )}
                role="status"
              >
                <p className="font-medium">
                  {feedback.status === "correct"
                    ? `Correct (+${feedback.award})`
                    : feedback.status === "partial"
                      ? `Partially correct (+${feedback.award})`
                      : feedback.status === "incorrect"
                        ? `Incorrect (${feedback.award})`
                        : "Explanation"}
                </p>
                {feedback.explanation ? (
                  <p className="text-muted-foreground mt-1">{feedback.explanation}</p>
                ) : null}
              </div>
            ) : null}

            <details className="border-border mt-4 border-t pt-3">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                Private note
              </summary>
              <div className="mt-2">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Only you can see this."
                  className="border-border bg-background w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      setNoteState("saving");
                      const response = await fetch(`/api/exam-attempts/${attemptId}/notes`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ item_id: item.item_id, body: note }),
                      });
                      setNoteState(response.ok ? "saved" : "idle");
                    }}
                  >
                    Save note
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    {noteState === "saving" ? "Saving" : noteState === "saved" ? "Saved" : ""}
                  </span>
                </div>
              </div>
            </details>
          </article>
        </main>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <button
            type="button"
            className="border-exam-tile-border bg-exam-panel flex w-full items-center justify-between rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium lg:hidden"
            onClick={() => setNumbersVisible((visible) => !visible)}
            aria-expanded={numbersVisible}
          >
            Question palette
            <span className="text-muted-foreground text-xs">
              {answeredCount}/{manifest.items.length}
            </span>
          </button>

          <div
            className={cn(
              "border-exam-tile-border bg-exam-panel mt-3 rounded-[var(--radius-card)] border p-3 lg:mt-0",
              !numbersVisible && "hidden lg:block",
            )}
            role="region"
            aria-label="Question palette"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Question palette
              </h2>
              <span className="text-muted-foreground text-xs">
                {answeredCount}/{items.length}
              </span>
            </div>

            <div role="tablist" aria-label="Subjects" className="mt-2 flex flex-wrap gap-1">
              {sections.map(([section, indexes]) => {
                const answeredIn = indexes.filter((index) => isAnswered(items[index])).length;
                const active = section === activeTab;
                return (
                  <button
                    key={section}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPinnedTab(section)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
                        : "border-exam-tile-border text-muted-foreground hover:bg-exam-tile-hover",
                    )}
                  >
                    {section}
                    <span className="opacity-70">
                      {answeredIn}/{indexes.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 max-h-[min(52vh,420px)] overflow-y-auto pr-1">
              <div className="grid grid-cols-6 gap-1.5">
                {(sections.find(([section]) => section === activeTab)?.[1] ?? []).map((index) => {
                  const entry = items[index];
                  const answered = isAnswered(entry);
                  const marked = entry.response?.marked ?? false;
                  return (
                    <button
                      key={entry.item_id}
                      type="button"
                      onClick={() => goTo(index)}
                      aria-current={index === current ? "true" : undefined}
                      aria-label={[
                        `Question ${index + 1}`,
                        answered ? "answered" : "not answered",
                        marked ? "marked for review" : null,
                        index === current ? "current" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      className={cn(
                        "relative flex h-9 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2",
                        answered
                          ? "border-[var(--exam-answered)] bg-[var(--exam-answered-soft)] text-[var(--exam-answered)]"
                          : marked
                            ? "bg-exam-tile border-[var(--exam-marked)] text-[var(--exam-marked)]"
                            : "border-exam-tile-border bg-exam-tile text-muted-foreground hover:bg-exam-tile-hover",
                        index === current && "shadow-[0_0_0_2px_var(--exam-ring)]",
                      )}
                    >
                      {index + 1}
                      {marked ? (
                        <span className="absolute -top-1 -right-1 size-2 rounded-full bg-[var(--exam-marked)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <dl className="border-exam-tile-border mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Answered</dt>
                <dd className="font-semibold text-[var(--exam-answered)]">{answeredCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Marked</dt>
                <dd className="font-semibold text-[var(--exam-marked)]">{markedCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Left</dt>
                <dd className="font-semibold">{items.length - answeredCount}</dd>
              </div>
            </dl>

            <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-[var(--exam-answered)]" />
                Answered
              </li>
              <li className="flex items-center gap-1.5">
                <span className="border-exam-tile-border bg-exam-tile inline-block size-2.5 rounded-sm border" />
                Not answered
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-[var(--exam-marked)]" />
                Marked
              </li>
            </ul>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Arrows move between questions, A to D chooses an option, M marks.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
