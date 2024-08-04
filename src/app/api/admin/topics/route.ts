import { z } from "zod";
import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

const topicSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase words separated by hyphens"),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/** Topics are data, so adding one needs neither a deploy nor a migration. */
export async function GET() {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const { data, error } = await rpc<Record<string, unknown>>("admin_inventory", {
    p_actor: actor.id,
  });
  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "topics_failed" }, { status: 500 })
    );
  }
  return NextResponse.json({ topics: data.topics });
}

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const parsed = topicSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { data, error } = await rpc<{ topic_id: string; slug: string }>("admin_topic_save", {
    p_actor: actor.id,
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_is_active: input.isActive,
    p_sort_order: input.sortOrder,
  });

  if (error || !data) {
    return adminError(error ?? "") ?? NextResponse.json({ error: "topic_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
