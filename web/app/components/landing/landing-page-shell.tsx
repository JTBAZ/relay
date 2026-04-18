import { HeroSection } from "./hero-section";
import { RelayLogoAnimation } from "./relay-logo-animation";
import { ValueStory } from "./value-story";
import { SocialProof } from "./social-proof";
import { SiteFooter } from "./site-footer";

/** Marketing landing used at `/` (logged out) and `/landing`. */
export function LandingPageShell() {
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="aspect-square h-[min(120vmin,960px)] w-[min(120vmin,960px)] max-h-[900px] max-w-[900px] opacity-[0.22] sm:opacity-[0.28]">
          <RelayLogoAnimation />
        </div>
      </div>
      <div className="relative z-10 flex flex-1 flex-col">
        <main className="flex flex-1 flex-col items-center">
          <HeroSection />
          <ValueStory />
          <SocialProof />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
