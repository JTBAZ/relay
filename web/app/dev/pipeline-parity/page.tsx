import PipelineParityClient from "./PipelineParityClient";

export default function PipelineParityPage() {
  const enabled =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_PIPELINE_PARITY_UI === "1";

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-zinc-300">
        <h1 className="text-lg font-semibold">Pipeline parity</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Disabled in this build. Run{" "}
          <code className="rounded bg-zinc-800 px-1 text-xs">next dev</code> or set{" "}
          <code className="rounded bg-zinc-800 px-1 text-xs">NEXT_PUBLIC_PIPELINE_PARITY_UI=1</code>.
        </p>
      </div>
    );
  }

  return <PipelineParityClient />;
}
