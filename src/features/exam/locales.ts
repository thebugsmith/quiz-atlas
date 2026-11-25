/**
 * Locale codes a paper can be served in, and how to name them. Kept out of `catalog.ts`
 * because that module is server-only and client components need these labels too.
 */
export function localeLabel(code: string): string {
  if (code === "en") return "English";
  if (code === "hi") return "हिंदी";
  return code.toUpperCase();
}
