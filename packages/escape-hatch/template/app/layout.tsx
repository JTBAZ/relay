import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escape Hatch Gallery",
  description: "Soft-gate preview of an Escape Hatch site kit"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
