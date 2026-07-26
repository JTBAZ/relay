import { Heart } from "lucide-react";
import { PATRON_PROFILE_DRAFT_FAVORITES } from "./patron-profile-draft-fixtures";

export function PatronProfileDraftFavorites() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 pb-24">
      <div className="mb-8 flex items-baseline gap-3">
        <Heart className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Favorites</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {PATRON_PROFILE_DRAFT_FAVORITES.map((favorite) => (
          <figure
            key={favorite.id}
            className="group relative cursor-pointer overflow-hidden rounded-md bg-muted"
          >
            <div className="aspect-square overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- draft fixture */}
              <img
                src={favorite.imageUrl}
                alt={favorite.title}
                width={768}
                height={768}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-elegant)] group-hover:scale-110"
              />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-all duration-500 [transition-timing-function:var(--ease-elegant)] group-hover:translate-y-0 group-hover:opacity-100">
              <div className="rounded-md bg-background/80 p-3 backdrop-blur-md">
                <p className="text-xs font-medium text-foreground">{favorite.title}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {favorite.artist}
                </p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
