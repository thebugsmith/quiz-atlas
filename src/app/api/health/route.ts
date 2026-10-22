import { NextResponse } from "next/server";
import { runHealthChecks } from "@/features/ops/health";
import { rpc } from "@/features/quiz/api-helpers";

/**
 * For an uptime monitor. 200 when every check passes, 503 otherwise, never cached.
 */
export async function GET() {
  // Lazy safety net for timed papers: a deadline that passed while nobody was looking is
  // finalized from the answers already saved. Best effort; the health verdict ignores it.
  const sweep = await rpc<{ finalized: number; failed: number }>("exam_finalize_expired", {});

  const { ok, checks } = await runHealthChecks();

  return NextResponse.json(
    {
      ok,
      checks,
      exam_expiry: sweep.data ?? { finalized: 0, failed: 0 },
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
