import "server-only";
import { getServiceClient } from "@/server/supabase";

export type HealthCheck = { name: string; ok: boolean; detail?: string };

/**
 * Cheap checks an uptime monitor can call: is the database answering, is there anything
 * to serve, and does today's daily challenge exist. No secrets, no personal counts.
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

  const today = new Date().toISOString().slice(0, 10);
  const daily = await supabase
    .from("daily_challenges")
    .select("id")
    .eq("challenge_date", today)
    .maybeSingle();
  checks.push({
    name: "daily_prepared",
    ok: !daily.error && Boolean(daily.data),
    detail: daily.error ? "query failed" : daily.data ? undefined : "not prepared for today",
  });

  return { ok: checks.every((check) => check.ok), checks };
}
