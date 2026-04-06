import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Relay — Artist & Patron Access in One Place",
  description:
    "Relay brings creators and their supporters together under one seamless access model. Connect your Patreon, grow your community, and support the artists you love.",
  openGraph: {
    title: "Relay — Artist & Patron Access in One Place",
    description:
      "Connect creators and supporters under one seamless platform. Built for artists. Built for fans.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Relay" }],
    siteName: "Relay",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Artist & Patron Access in One Place",
    description: "Connect creators and supporters under one seamless platform.",
    images: ["/og-image.png"]
  },
  keywords: ["relay", "patreon", "creator", "patron", "artist", "supporter", "membership"]
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark"
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
