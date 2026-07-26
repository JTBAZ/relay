import type { Metadata } from "next";
import { PatronOnboardingClient } from "./PatronOnboardingClient";
import { resolvePatreonOAuthClientId } from "@/lib/resolve-patreon-oauth-client-id";

export const metadata: Metadata = {
  title: "Relay · Connect Patreon",
  description: "Connect your Patreon account to explore Relay as a supporter."
};

export default function PatronOnboardingPage() {
  return (
    <div
      className="flex min-h-dvh flex-1 flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <PatronOnboardingClient initialClientId={resolvePatreonOAuthClientId()} />
    </div>
  );
}
