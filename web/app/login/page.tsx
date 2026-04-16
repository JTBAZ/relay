import type { Metadata } from "next";
import { LoginPageClient } from "./LoginPageClient";

export const metadata: Metadata = {
  title: "Relay · Sign in",
  description: "Sign in to your Relay studio, then connect Patreon to sync your library."
};

export default function LoginPage() {
  return <LoginPageClient />;
}
