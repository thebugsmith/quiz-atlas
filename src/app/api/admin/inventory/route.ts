import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

export async function GET() {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const { data, error } = await rpc<Record<string, unknown>>("admin_inventory", {
    p_actor: actor.id,
  });

  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "inventory_failed" }, { status: 500 })
    );
  }
  return NextResponse.json(data);
}
