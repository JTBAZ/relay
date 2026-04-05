import type { Metadata } from "next";
import { AuthHub } from "@/app/components/auth/auth-hub";

export const metadata: Metadata = {
  title: "Relay · Sign in",
  description: "Connect your Patreon or sign in with email to access Relay."
};

export default function LoginPage() {
  return (
    <div className="login-shell min-h-dvh flex-1">
      <AuthHub />
    </div>
  );
}
