import { HeroSection } from "./hero-section";
import { ValueStory } from "./value-story";
import { SocialProof } from "./social-proof";
import { SiteFooter } from "./site-footer";

/** Marketing landing used at `/` (logged out) and `/landing`. */
export function LandingPageShell() {
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
