"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "quiz-atlas-theme";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
    media.removeEventListener("change", listener);
  };
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private mode or blocked storage: fall back to the OS preference.
  }
  return "system";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The theme lives outside React (localStorage plus the OS media query), so it is
 * read through useSyncExternalStore rather than mirrored into state. The
 * pre-paint script in the root layout sets <html data-theme>; the effect below
 * keeps that attribute in sync after hydration.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    readPreference,
    () => "system",
  );
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    () => resolve(preference),
    () => "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference still applies for this page view.
    }
    document.documentElement.dataset.theme = resolve(next);
    emit();
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

/** Runs before paint to avoid a flash of the wrong palette. */
export const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("${STORAGE_KEY}");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme =
      stored === "light" || stored === "dark" ? stored : system;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;
