import { useEffect, useState } from "react";

/**
 * Debounces a value for API-backed search/filter (matches visitor gallery `SEARCH_DEBOUNCE_MS` pattern).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
