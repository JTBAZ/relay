/** Tiny class merge — avoids pulling clsx/tailwind-merge for onboarding-only UI. */
export function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ");
}
