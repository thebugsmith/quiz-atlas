import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/supabase/server";

/** Who the caller is, according to a server-verified session. */
export async function GET() {
  const user = await getVerifiedUser();

  return NextResponse.json(
    { user },
    {
      status: user ? 200 : 401,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
