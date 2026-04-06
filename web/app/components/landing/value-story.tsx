import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    number: "1",
    label: "Patreon flows in",
    body: "Connect once. Your posts, tiers, and media sync continuously — paywalls included. Nothing changes on Patreon's side."
  },
  {
    number: "2",
    label: "You shape the gallery",
    body: "Tag, arrange, and design sections your way. What you hide stays hidden. What you spotlight gets seen."
  },
  {
    number: "3",
    label: "Fans browse better",
    body: "Supporters use their existing Patreon tier here — searchable library, clean layout, no chronological scroll."
  }
];

function FlowArrow() {
  return (
    <div className="hidden items-center justify-center px-2 md:flex">
      <ArrowRight size={20} style={{ color: "#2D6A4F" }} />
    </div>
  );
}

export function ValueStory() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16" aria-label="How Relay works">
      <div className="flex items-center gap-4">
        <div className="h-px flex-1" style={{ background: "#222222" }} />
        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "#6B7280" }}>
          What Relay does
        </span>
        <div className="h-px flex-1" style={{ background: "#222222" }} />
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.number} className="flex flex-1 items-stretch">
            <div
              className="flex flex-1 flex-col gap-3 rounded-2xl border p-5"
              style={{ background: "#141414", borderColor: "#222222" }}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
                style={{ background: "#0D1F17", color: "#40916C" }}
              >
                {step.number}
              </div>
              <h3 className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
                {step.label}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                {step.body}
              </p>
            </div>
            {i < STEPS.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>
    </section>
  );
}
