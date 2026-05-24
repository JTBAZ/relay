import { ArrowUpRight, Plus } from "lucide-react";
import hands from "@/assets/collection-hands.jpg";
import lighting from "@/assets/collection-lighting.jpg";
import portraits from "@/assets/collection-portraits.jpg";
import landscapes from "@/assets/collection-landscapes.jpg";

const collections = [
  { title: "Hand Studies", count: 24, cover: hands, year: "2019 — 2024" },
  { title: "Lighting", count: 38, cover: lighting, year: "2020 — 2024" },
  { title: "Portraits in Green", count: 17, cover: portraits, year: "2022 — 2024" },
  { title: "Quiet Landscapes", count: 29, cover: landscapes, year: "2018 — 2024" },
];

export function Collections() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Collections
          </h2>
          <p className="mt-2 text-2xl font-light tracking-tight text-foreground">
            Curated over the years
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" /> New collection
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {collections.map((c) => (
          <article
            key={c.title}
            className="group relative cursor-pointer overflow-hidden rounded-lg bg-card transition-all duration-700 [transition-timing-function:var(--ease-elegant)] hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={c.cover}
                alt={c.title}
                width={768}
                height={768}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-elegant)] group-hover:scale-105"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent opacity-90" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium text-foreground">{c.title}</h3>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {c.count} pieces · {c.year}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
