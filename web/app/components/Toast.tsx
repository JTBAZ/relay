"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  onDismiss: () => void;
  duration?: number;
};

export default function Toast({ message, onDismiss, duration = 4000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-[#1a1410] border border-[#3d342b] rounded-lg px-4 py-3 shadow-xl flex items-center gap-3 max-w-sm">
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <p className="text-sm text-[#ede5da]">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[#8a7f72] hover:text-[#f0e6d8] text-xs ml-2 shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}
