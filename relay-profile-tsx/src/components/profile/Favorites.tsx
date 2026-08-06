import { Heart } from "lucide-react";
import f1 from "@/assets/fav-1.jpg";
import f2 from "@/assets/fav-2.jpg";
import f3 from "@/assets/fav-3.jpg";
import f4 from "@/assets/fav-4.jpg";

const favorites = [
  { title: "Rose, Black Vase", artist: "M. Hale", img: f1 },
  { title: "Skylight Study II", artist: "I. Moreau", img: f2 },
  { title: "Figure in Repose", artist: "A. Reyn", img: f3 },
  { title: "Emerald Field", artist: "T. Lin", img: f4 },
];

export function Favorites() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 pb-24">
      <div className="mb-8 flex items-baseline gap-3">
        <Heart className="h-4 w-4 fill-primary text-primary" />
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Favorites
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {favorites.map((f) => (
          <figure
            key={f.title}
            className="group relative cursor-pointer overflow-hidden rounded-md bg-muted"
          >
            <div className="aspect-square overflow-hidden">
              <img
                src={f.img}
                alt={f.title}
                width={768}
                height={768}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-elegant)] group-hover:scale-110"
              />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-all duration-500 [transition-timing-function:var(--ease-elegant)] group-hover:translate-y-0 group-hover:opacity-100">
              <div className="rounded-md bg-background/80 p-3 backdrop-blur-md">
                <p className="text-xs font-medium text-foreground">{f.title}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.artist}
                </p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
