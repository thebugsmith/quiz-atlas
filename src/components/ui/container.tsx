import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Centred content region: 640px reading, 1080px for grids. */
export function Container({
  width = "wide",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { width?: "narrow" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        width === "narrow" ? "max-w-2xl" : "max-w-[1080px]",
        className,
      )}
      {...props}
    />
  );
}
