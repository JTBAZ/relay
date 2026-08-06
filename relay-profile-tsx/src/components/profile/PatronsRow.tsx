import p1 from "@/assets/patreon-1.jpg";
import p2 from "@/assets/patreon-2.jpg";
import p3 from "@/assets/patreon-3.jpg";
import p4 from "@/assets/patreon-4.jpg";
import p5 from "@/assets/patreon-5.jpg";
import p6 from "@/assets/patreon-6.jpg";

const patrons = [
  { name: "Marcus Hale", img: p1 },
  { name: "Iris Moreau", img: p2 },
  { name: "August Reyn", img: p3 },
  { name: "Theo Lin", img: p4 },
  { name: "Niko Brandt", img: p5 },
  { name: "Sava Ortiz", img: p6 },
];

export function PatronsRow() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Patronage
        </h2>
        <button className="text-xs text-muted-foreground transition-colors hover:text-primary">
          View all
        </button>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {patrons.map((p) => (
          <button
            key={p.name}
            className="group flex shrink-0 flex-col items-center gap-2 transition-transform duration-500 [transition-timing-function:var(--ease-elegant)] hover:-translate-y-1"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full ring-1 ring-border transition-all duration-500 group-hover:ring-primary group-hover:shadow-[var(--shadow-glow)] md:h-20 md:w-20">
              <img
                src={p.img}
                alt={p.name}
                width={512}
                height={512}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-[11px] tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
              {p.name.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
