"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type EditorQuestion = {
  questionId: string | null;
  externalId: string;
  topicSlug: string;
  difficulty: "easy" | "medium" | "hard";
  type: "mcq" | "comprehension";
  stem: string;
  statements: string[];
  prompt: string;
  options: { id: number; text: string }[];
  correctOptionId: number;
  explanation: string;
};

const field =
  "border-border bg-surface focus-visible:outline-primary w-full rounded-[var(--radius-control)] border px-3 py-2 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2";

export function emptyQuestion(topicSlug: string): EditorQuestion {
  return {
    questionId: null,
    externalId: "",
    topicSlug,
    difficulty: "medium",
    type: "mcq",
    stem: "",
    statements: [],
    prompt: "",
    options: [
      { id: 1, text: "" },
      { id: 2, text: "" },
      { id: 3, text: "" },
      { id: 4, text: "" },
    ],
    correctOptionId: 1,
    explanation: "",
  };
}

export function QuestionEditor({
  value,
  topics,
  onChange,
  onSaved,
  onCancel,
}: {
  value: EditorQuestion;
  topics: { slug: string; name: string }[];
  onChange: (next: EditorQuestion) => void;
  onSaved: (result: { questionId: string; unchanged: boolean }) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = <K extends keyof EditorQuestion>(key: K, next: EditorQuestion[K]) =>
    onChange({ ...value, [key]: next });

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: value.questionId,
        externalId: value.externalId,
        topicSlug: value.topicSlug,
        difficulty: value.difficulty,
        type: value.type,
        stem: value.stem.trim() === "" ? null : value.stem,
        statements: value.statements.filter((line) => line.trim() !== ""),
        prompt: value.prompt,
        options: value.options,
        correctOptionId: value.correctOptionId,
        explanation: value.explanation.trim() === "" ? null : value.explanation,
      }),
    });

    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok || !body) {
      setError(
        body?.issues?.join("; ") ??
          body?.error ??
          "Could not save this question. Check the fields.",
      );
      return;
    }

    setNotice(
      body.unchanged
        ? "No changes — the published version already matches."
        : body.question_id && value.questionId === null
          ? "Saved as a draft. Publish it to make it playable."
          : "Saved a new draft version. Publish it to make it playable.",
    );
    onSaved({ questionId: body.question_id, unchanged: Boolean(body.unchanged) });
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-[var(--radius-card)] border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="admin-external-id" className="mb-1 block text-sm font-medium">
            External id
          </label>
          <input
            id="admin-external-id"
            className={field}
            value={value.externalId}
            onChange={(event) => set("externalId", event.target.value)}
            disabled={value.questionId !== null}
            placeholder="history-0001"
          />
        </div>
        <div>
          <label htmlFor="admin-topic" className="mb-1 block text-sm font-medium">
            Topic
          </label>
          <select
            id="admin-topic"
            className={field}
            value={value.topicSlug}
            onChange={(event) => set("topicSlug", event.target.value)}
          >
            {topics.map((topic) => (
              <option key={topic.slug} value={topic.slug}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="admin-difficulty" className="mb-1 block text-sm font-medium">
            Difficulty
          </label>
          <select
            id="admin-difficulty"
            className={field}
            value={value.difficulty}
            onChange={(event) =>
              set("difficulty", event.target.value as EditorQuestion["difficulty"])
            }
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-type" className="mb-1 block text-sm font-medium">
            Type
          </label>
          <select
            id="admin-type"
            className={field}
            value={value.type}
            onChange={(event) => set("type", event.target.value as EditorQuestion["type"])}
          >
            <option value="mcq">mcq</option>
            <option value="comprehension">comprehension</option>
          </select>
        </div>
      </div>

      {value.type === "comprehension" ? (
        <>
          <div>
            <label htmlFor="admin-stem" className="mb-1 block text-sm font-medium">
              Stem (optional lead-in)
            </label>
            <textarea
              id="admin-stem"
              className={field}
              rows={2}
              value={value.stem}
              onChange={(event) => set("stem", event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="admin-statements" className="mb-1 block text-sm font-medium">
              Statements — one per line
            </label>
            <textarea
              id="admin-statements"
              className={field}
              rows={4}
              value={value.statements.join("\n")}
              onChange={(event) => set("statements", event.target.value.split("\n"))}
            />
          </div>
        </>
      ) : null}

      <div>
        <label htmlFor="admin-prompt" className="mb-1 block text-sm font-medium">
          Prompt
        </label>
        <textarea
          id="admin-prompt"
          className={field}
          rows={2}
          value={value.prompt}
          onChange={(event) => set("prompt", event.target.value)}
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Options — mark the correct one</legend>
        <div className="space-y-2">
          {value.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="admin-correct"
                id={`admin-correct-${option.id}`}
                checked={value.correctOptionId === option.id}
                onChange={() => set("correctOptionId", option.id)}
                className="size-4"
              />
              <label htmlFor={`admin-correct-${option.id}`} className="sr-only">
                Option {option.id} is correct
              </label>
              <input
                aria-label={`Option ${option.id} text`}
                className={field}
                value={option.text}
                onChange={(event) => {
                  const next = [...value.options];
                  next[index] = { ...option, text: event.target.value };
                  set("options", next);
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="admin-explanation" className="mb-1 block text-sm font-medium">
          Explanation (optional)
        </label>
        <textarea
          id="admin-explanation"
          className={field}
          rows={2}
          value={value.explanation}
          onChange={(event) => set("explanation", event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save version"}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={busy}>
          Close
        </Button>
      </div>

      {notice ? (
        <p className="text-success text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
