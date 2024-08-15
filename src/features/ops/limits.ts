import "server-only";
import { rpc } from "@/features/quiz/api-helpers";

export type LimitResult = { allowed: boolean; used: number; limit: number; resetAt: string };

/**
 * Durable, shared counting. The row lives in Postgres, so two instances share one budget
 * and a restart does not hand an abuser a fresh window.
 */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const { data } = await rpc<{ allowed: boolean; used: number; limit: number; reset_at: string }>(
    "rate_limit_hit",
    { p_key: key, p_limit: limit, p_window_seconds: windowSeconds },
  );

  return {
    allowed: data?.allowed ?? false,
    used: data?.used ?? 0,
    limit: data?.limit ?? limit,
    resetAt: data?.reset_at ?? new Date().toISOString(),
  };
}

export const LIMITS = {
  /** Answers: a fast player answering every second is well under this. */
  answer: { limit: 240, window: 60 },
  /** Starting a daily attempt is a once-a-day action; the margin is for retries. */
  dailyStart: { limit: 10, window: 3600 },
  /** Uploads and reports are cheap to repeat by accident and expensive to repeat on purpose. */
  import: { limit: 20, window: 3600 },
  report: { limit: 20, window: 3600 },
} as const;
