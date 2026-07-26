import type { Metadata } from "next";
import {
  DM_Sans,
  Newsreader,
  Outfit,
  Source_Sans_3,
  Space_Grotesk
} from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap"
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap"
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap"
});

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
    <html
      lang="en"
      className={[
        outfit.variable,
        sourceSans.variable,
        dmSans.variable,
        spaceGrotesk.variable,
        newsreader.variable
      ].join(" ")}
    >
      <body>{children}</body>
    </html>
  );
}
