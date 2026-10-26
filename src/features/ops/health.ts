import "server-only";
import { getServiceClient } from "@/server/supabase";

export type HealthCheck = { name: string; ok: boolean; detail?: string };

/**
 * Cheap checks an uptime monitor can call: is the database answering, and is there anything
 * to serve. No secrets, no personal counts. The daily challenge is hidden from the UI, so a
 * missing set for today is not a degraded service.
 */
export async function runHealthChecks(): Promise<{ ok: boolean; checks: HealthCheck[] }> {
  const supabase = getServiceClient();
  const checks: HealthCheck[] = [];

  const topics = await supabase.rpc("topic_summaries");
  checks.push({
    name: "database",
    ok: !topics.error,
    detail: topics.error ? "unreachable" : undefined,
  });

  const rows = Array.isArray(topics.data) ? topics.data : [];
  const available = rows.reduce((sum, row) => sum + Number(row.available ?? 0), 0);
  checks.push({ name: "content_available", ok: available >= 10, detail: `${available} live` });

  return { ok: checks.every((check) => check.ok), checks };
}
