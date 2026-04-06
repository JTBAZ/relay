const QUOTES = [
  {
    body: '"Finally a place where my Patreon supporters and my own platform feel like one thing."',
    author: "Illustrator & printmaker",
    meta: "Early access creator"
  },
  {
    body: '"I stopped losing track of which Patreon tier I was on. Relay just shows me everything."',
    author: "Music fan & collector",
    meta: "Supporter beta tester"
  },
  {
    body: '"Setup took under ten minutes. My whole back catalogue was accessible to patrons the same day."',
    author: "Independent podcast host",
    meta: "Early access creator"
  }
];

export function SocialProof() {
  return (
    <section className="w-full" aria-label="What people are saying" style={{ borderTop: "1px solid #2A2A2A" }}>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 py-12 sm:py-16 md:grid-cols-3">
        {QUOTES.map(({ body, author, meta }) => (
          <figure
            key={author}
            className="flex flex-col gap-4 rounded-2xl border p-6"
            style={{
              background: "#141414",
              borderColor: "#222222",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)"
            }}
          >
            <div className="h-0.5 w-8 rounded-full" style={{ background: "#2D6A4F" }} />
            <blockquote className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
              {body}
            </blockquote>
            <figcaption className="mt-auto flex flex-col gap-0.5">
              <span className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
                {author}
              </span>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                {meta}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
