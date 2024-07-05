"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme-provider";
import { cn } from "@/lib/cn";

const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Segmented theme control. Later milestones surface the same preference in
 * settings; this compact version keeps both palettes reachable while building.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "border-border bg-surface inline-flex items-center gap-0.5 rounded-full border p-0.5",
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            title={`${label} theme`}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{label} theme</span>
          </button>
        );
      })}
    </div>
  );
}
