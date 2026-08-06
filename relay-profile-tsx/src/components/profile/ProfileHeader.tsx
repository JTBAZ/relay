import { useState } from "react";
import { Check, Plus, Share2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import avatar from "@/assets/profile-avatar.jpg";
import banner from "@/assets/profile-banner.jpg";

export function ProfileHeader() {
  const [following, setFollowing] = useState(false);

  return (
    <header className="relative">
      <div className="relative h-64 w-full overflow-hidden md:h-80">
        <img
          src={banner}
          alt=""
          width={1920}
          height={640}
          className="h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-[var(--gradient-fade)]" />
      </div>

      <div className="mx-auto -mt-20 max-w-6xl px-6 md:-mt-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col items-start gap-5 md:flex-row md:items-end">
            <div className="relative h-32 w-32 overflow-hidden rounded-full ring-4 ring-background md:h-40 md:w-40">
              <img
                src={avatar}
                alt="Elena Voss avatar"
                width={512}
                height={512}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="pb-2">
              <p className="text-xs uppercase tracking-[0.2em] text-primary">Curator</p>
              <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground md:text-4xl">
                Elena Voss
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">@elena.voss</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Brooklyn, NY
                </span>
                <span>1,284 followers</span>
                <span>328 following</span>
                <span>47 collected</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <Button
              onClick={() => setFollowing(!following)}
              variant={following ? "secondary" : "default"}
              className="min-w-32 transition-all"
            >
              {following ? (
                <>
                  <Check className="h-4 w-4" /> Following
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Follow
                </>
              )}
            </Button>
            <Button variant="outline" size="icon" aria-label="Share profile">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Independent curator and lifelong patron. Collecting quiet moments, light studies,
          and the spaces between brushstrokes.
        </p>
      </div>
    </header>
  );
}
