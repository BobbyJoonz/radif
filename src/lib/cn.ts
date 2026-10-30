/** Join class names, dropping falsy parts. Small on purpose: no dependency. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
