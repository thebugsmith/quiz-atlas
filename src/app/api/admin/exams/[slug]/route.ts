import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/features/admin/guard";
import { rpc } from "@/features/quiz/api-helpers";

const body = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("status"), status: z.enum(["draft", "published", "archived"]) })
    .strict(),
  z
    .object({
      action: z.literal("amend-key"),
      publish: z.boolean().default(false),
      changes: z
        .array(
          z
            .object({
              position: z.number().int().min(1),
              accepted_option_ids: z.array(z.string()).optional(),
              correct_option_ids: z.array(z.string()).optional(),
              accepted_numeric_intervals: z
                .array(
                  z.object({
                    min: z.string(),
                    max: z.string(),
                    min_inclusive: z.boolean(),
                    max_inclusive: z.boolean(),
                  }),
                )
                .optional(),
              exceptional_policy: z.enum(["exclude", "award_all", "award_attempted"]).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
]);

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { slug } = await ctx.params;
  const { data, error } =
    parsed.data.action === "status"
      ? await rpc<unknown>("exam_admin_set_status", {
          p_actor: actor.id,
          p_paper_slug: slug,
          p_status: parsed.data.status,
        })
      : await rpc<unknown>("exam_admin_amend_key", {
          p_actor: actor.id,
          p_paper_slug: slug,
          p_changes: parsed.data.changes,
          p_publish: parsed.data.publish,
        });

  if (error) {
    const status = error.startsWith("incomplete_key") || error === "rules_missing" ? 409 : 400;
    return NextResponse.json({ error, detail: error }, { status });
  }
  return NextResponse.json(data);
}
