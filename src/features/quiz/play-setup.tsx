"use client";

import { useSearchParams } from "next/navigation";
import { SetupShell } from "./setup-shell";

/**
 * Reads the shared setup from the URL (`/play?topics=geography`), so a link from the
 * home page or a bookmark opens the same quiz configuration.
 */
export function PlaySetup() {
  const params = useSearchParams();
  const raw = params.get("topics") ?? "";
  const topics = raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .slice(0, 8);

  return <SetupShell initialTopics={topics} />;
}
