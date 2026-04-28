import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import ConditionalAppNav from "./components/ConditionalAppNav";
import { StudioSessionRoot } from "./components/studio/studio-session-root";
import { SupabaseHashRedirect } from "./components/SupabaseHashRedirect";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

function siteOrigin(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(explicit);
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`);
  return new URL("http://127.0.0.1:3000");
}

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: "Relay · Creator Editor",
  description: "Creator-owned media gallery and page designer"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} flex min-h-dvh flex-col font-[family-name:var(--font-body)] antialiased`}
      >
        <StudioSessionRoot>
          <SupabaseHashRedirect />
          <ConditionalAppNav />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </StudioSessionRoot>
      </body>
    </html>
  );
}
