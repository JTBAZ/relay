import { HeroSection } from "@/app/components/landing/hero-section";
import { ValueStory } from "@/app/components/landing/value-story";
import { SocialProof } from "@/app/components/landing/social-proof";
import { SiteFooter } from "@/app/components/landing/site-footer";

export default function LandingPage() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <main className="flex flex-1 flex-col items-center">
        <HeroSection />
        <ValueStory />
        <SocialProof />
      </main>
      <SiteFooter />
    </div>
  );
}
