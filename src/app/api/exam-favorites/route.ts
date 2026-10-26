import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedUser } from "@/lib/supabase/server";
import { gameJson, mapDatabaseError, rpc, unauthenticated } from "@/features/quiz/api-helpers";
import { examApiHidden } from "@/features/exam/api";

/** Favorites are private to the signed-in player; guests have nowhere to keep them. */
export async function GET() {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await getVerifiedUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<string[]>("exam_favorites_list", { p_owner: user.id });
  if (error) return mapDatabaseError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson({ papers: data ?? [] });
}

const body = z.object({ paper: z.string().min(1).max(120), favorite: z.boolean() });

export async function POST(request: Request) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await getVerifiedUser();
  if (!user) return unauthenticated();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { data, error } = await rpc<{ paper: string; favorite: boolean }>("exam_set_favorite", {
    p_owner: user.id,
    p_slug: parsed.data.paper,
    p_favorite: parsed.data.favorite,
  });
  if (error) return mapDatabaseError(error) ?? gameJson({ error: "failed" }, 500);
  return NextResponse.json(
    { paper: data?.paper, favorite: data?.favorite },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
