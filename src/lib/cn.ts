/** Joins class names, dropping falsy values. Small enough to skip clsx. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
