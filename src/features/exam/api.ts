import "server-only";
import { gameJson } from "@/features/quiz/api-helpers";

/**
 * Exam database errors to HTTP. The SQL functions raise short tagged messages, so the
 * browser gets a status it can act on without any SQL text leaking through.
 */
export function examError(message: string) {
  switch (message) {
    case "not_found":
      return gameJson({ error: "not_found" }, 404);
    case "invalid_response":
      return gameJson({ error: "invalid_response" }, 400);
    case "paper_not_published":
      return gameJson({ error: "paper_not_published" }, 409);
    case "paper_has_no_items":
      return gameJson({ error: "paper_not_ready" }, 409);
    case "unsupported_mode":
      return gameJson({ error: "unsupported_mode" }, 400);
    case "idempotency_mismatch":
      return gameJson({ error: "idempotency_mismatch" }, 409);
    default:
      if (message.startsWith("stale_revision:")) {
        return gameJson(
          { error: "stale_revision", current: Number(message.split(":")[1] ?? 0) },
          409,
        );
      }
      if (message.startsWith("attempt_not_active:")) {
        return gameJson({ error: "attempt_not_active", state: message.split(":")[1] }, 409);
      }
      return null;
  }
}
