import { Bebas_Neue, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import PreviewizerClient from "@/app/components/previewizer";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap"
});

const playfairDisplay = Playfair_Display({
  weight: ["700"],
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap"
});

export default function PreviewizerDevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH !== "true"
  ) {
    notFound();
  }

  return (
    <div className={`previewizer-font-scope ${bebasNeue.variable} ${playfairDisplay.variable}`}>
      <PreviewizerClient />
    </div>
  );
}
