import { createHash } from "node:crypto";
import type { ImportQuestion } from "./schema";

/**
 * Stable fingerprint of the question body. Option order and option ids are
 * normalised away, so re-sharing a question with the same meaning does not look
 * like a new question, and re-importing an unchanged file is a no-op.
 */
export function questionFingerprint(question: ImportQuestion): string {
  const options = question.options
    .map((option) => option.text.trim().toLowerCase().replace(/\s+/g, " "))
    .sort();

  const canonical = JSON.stringify({
    type: question.type,
    stem: question.stem?.trim().toLowerCase() ?? "",
    statements: question.statements.map((statement) =>
      statement.trim().toLowerCase().replace(/\s+/g, " "),
    ),
    prompt: question.prompt.trim().toLowerCase().replace(/\s+/g, " "),
    options,
    correct: question.options
      .find((option) => option.id === question.correct_option_id)
      ?.text.trim()
      .toLowerCase()
      .replace(/\s+/g, " "),
  });

  return createHash("sha256").update(canonical).digest("hex");
}
