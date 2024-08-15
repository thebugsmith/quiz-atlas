import { NextResponse } from "next/server";
import { runHealthChecks } from "@/features/ops/health";

/**
 * For an uptime monitor. 200 when every check passes, 503 otherwise, never cached.
 */
export async function GET() {
  const { ok, checks } = await runHealthChecks();

  return NextResponse.json(
    { ok, checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
