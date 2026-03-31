import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import AppNav from "./components/AppNav";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
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
        className={`${display.variable} ${body.variable} font-[family-name:var(--font-body)] antialiased`}
      >
        <AppNav />
        {children}
      </body>
    </html>
  );
}
