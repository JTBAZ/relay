/**
 * Test-only stub for `@/app/components/RoleSwitcher`. The real component fetches
 * `/me/session` on mount and returns null when no session is present, which makes it
 * invisible in tests that focus on the surrounding shell. The stub renders a marker so
 * tests can assert mount-position without exercising the role-switch logic.
 */

export function RoleSwitcher() {
  return <div data-testid="role-switcher-stub" />;
}
