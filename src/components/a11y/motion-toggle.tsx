"use client";

import { useSyncExternalStore } from "react";
import { Waves } from "lucide-react";
import {
  getMotionServerSnapshot,
  getMotionSnapshot,
  setMotionReduced,
  subscribeMotion,
} from "./preferences";
import { cn } from "@/lib/cn";

/**
 * Motion is reduced by request, never forced. The button reports state through
 * aria-pressed; the CSS that honours it lives in globals.css.
 */
export function MotionToggle({ className }: { className?: string }) {
  const reduced = useSyncExternalStore(subscribeMotion, getMotionSnapshot, getMotionServerSnapshot);

  return (
    <button
      type="button"
      aria-pressed={reduced}
      title={reduced ? "Motion reduced" : "Reduce motion"}
      onClick={() => setMotionReduced(!reduced)}
      className={cn(
        "text-muted-foreground hover:bg-surface-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-full transition-colors",
        reduced && "bg-primary-soft text-primary",
        className,
      )}
    >
      <Waves className="size-4" aria-hidden="true" />
      <span className="sr-only">{reduced ? "Motion is reduced" : "Reduce motion"}</span>
    </button>
  );
}
