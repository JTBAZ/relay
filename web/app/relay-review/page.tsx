"use client";
import { useRef, useState } from "react";
import { GoalsChatPopover } from "@/app/components/goals-lab/GoalsChatPopover";
export default function ReviewPreview() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <main className="min-h-screen bg-[#050706] p-10 text-[#e8e8e8]">
    <p className="text-xs uppercase tracking-widest text-[#9bf0c4]">Local review · sample data</p>
    <h1 className="my-5 text-4xl">Relay conversational UX</h1>
    <p className="mb-8 max-w-xl text-[#aaa]">This is the existing Goals Coach component from the published repository. Its conversation is scripted; it does not edit a gallery.</p>
    <button ref={trigger} onClick={() => setOpen(true)} className="rounded-full bg-[#9bf0c4] px-6 py-3 text-black">Open existing Coach</button>
    <a href="/relay-editor.html" className="ml-6 text-[#9bf0c4] underline">Explore proposed gallery editor</a>
    <GoalsChatPopover open={open} onClose={() => setOpen(false)} triggerRef={trigger}/>
  </main>;
}
