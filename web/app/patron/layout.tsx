import type { ReactNode } from "react";

import "./feed/patron-mock.css";

export default function PatronLayout({ children }: { children: ReactNode }) {
  return (
    <div className="patron-mock-root dark min-h-screen bg-background text-foreground antialiased">
      {children}
    </div>
  );
}
