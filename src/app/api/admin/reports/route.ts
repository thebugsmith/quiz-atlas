import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

export async function GET(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const status = new URL(request.url).searchParams.get("status") ?? "open";
  const { data, error } = await rpc<{ reports: unknown[] }>("admin_report_queue", {
    p_actor: actor.id,
    p_status: status,
  });

  if (error || !data) {
    return adminError(error ?? "") ?? NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
