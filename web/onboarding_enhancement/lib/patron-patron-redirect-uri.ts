export function patronPatronOAuthRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/patron/callback`;
}
