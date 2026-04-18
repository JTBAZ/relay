import { vi } from "vitest";

/** Mutable state for tests; reset in `beforeEach`. */
export const nextNavigationMock = {
  replace: vi.fn(),
  pathname: "/gallery",
  search: new URLSearchParams("foo=bar")
};

export function useRouter() {
  return { replace: nextNavigationMock.replace };
}

export function usePathname() {
  return nextNavigationMock.pathname;
}

export function useSearchParams() {
  return nextNavigationMock.search;
}
