const STORAGE_KEY = "relay.libraryOnboarding.v1";

export type LibraryOnboardingStep = "welcome" | "after_clean" | "completed";

export type LibraryOnboardingState = {
  creator_id: string;
  step: LibraryOnboardingStep;
};

export function loadLibraryOnboarding(creatorId: string): LibraryOnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryOnboardingState;
    if (parsed?.creator_id !== creatorId) return null;
    if (parsed.step !== "welcome" && parsed.step !== "after_clean" && parsed.step !== "completed") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLibraryOnboarding(state: LibraryOnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearLibraryOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
