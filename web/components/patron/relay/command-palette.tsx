"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Clock, User, FileText, X, ArrowRight } from "lucide-react";
import { SEARCH_SUGGESTIONS, type SearchSuggestion } from "@/lib/relay-fixtures";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const filtered = query
    ? SEARCH_SUGGESTIONS.filter((s) =>
        s.label.toLowerCase().includes(query.toLowerCase())
      )
    : SEARCH_SUGGESTIONS;

  const queries = filtered.filter((s) => s.kind === "query");
  const creators = filtered.filter((s) => s.kind === "creator");
  const posts = filtered.filter((s) => s.kind === "post");
  const hasResults = filtered.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75" aria-hidden="true" />

      {/* Panel */}
      <div
        className="relative w-full max-w-[600px] bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1E1E1E]">
          <Search size={17} className="text-[#4B5563] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators, posts, and more…"
            className="flex-1 bg-transparent text-[#F9FAFB] placeholder-[#4B5563] text-sm outline-none"
            aria-label="Search query"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150"
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto p-2">
          {!hasResults && (
            <div className="flex flex-col items-center py-12 text-center">
              <Search size={22} className="text-[#222222] mb-3" aria-hidden="true" />
              <p className="text-sm text-[#4B5563]">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {queries.length > 0 && (
            <SuggestionSection label="Recent">
              {queries.map((s) => (
                <SuggestionRow key={s.id}>
                  <Clock size={13} className="text-[#4B5563] shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-sm text-[#D1D5DB] text-left">{s.label}</span>
                  <ArrowRight
                    size={12}
                    className="text-[#2A2A2A] group-hover:text-[#4B5563] transition-colors duration-150"
                    aria-hidden="true"
                  />
                </SuggestionRow>
              ))}
            </SuggestionSection>
          )}

          {creators.length > 0 && (
            <SuggestionSection label="Creators">
              {creators.map((s) => (
                <SuggestionRow key={s.id}>
                  <Avatar suggestion={s} />
                  <div className="flex-1 text-left">
                    <div className="text-sm text-[#D1D5DB]">{s.label}</div>
                    {s.sublabel && (
                      <div className="text-xs text-[#4B5563]">{s.sublabel}</div>
                    )}
                  </div>
                  <User size={12} className="text-[#2A2A2A]" aria-hidden="true" />
                </SuggestionRow>
              ))}
            </SuggestionSection>
          )}

          {posts.length > 0 && (
            <SuggestionSection label="Posts">
              {posts.map((s) => (
                <SuggestionRow key={s.id}>
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center bg-[#1A1A1A] border border-[#222222] shrink-0"
                    aria-hidden="true"
                  >
                    <FileText size={13} className="text-[#4B5563]" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm text-[#D1D5DB]">{s.label}</div>
                    {s.sublabel && (
                      <div className="text-xs text-[#4B5563]">{s.sublabel}</div>
                    )}
                  </div>
                </SuggestionRow>
              ))}
            </SuggestionSection>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#1A1A1A] bg-[#0C0C0C]">
          <div className="flex items-center gap-4 text-[10px] text-[#333333] font-mono select-none">
            <span>↵ Open</span>
            <span>↑↓ Navigate</span>
            <span>Esc Close</span>
          </div>
          <kbd className="text-[10px] text-[#333333] font-mono">⌘K</kbd>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SuggestionSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-1" aria-label={label}>
      <div className="px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-widest font-medium text-[#3D3D3D]">
          {label}
        </span>
      </div>
      {children}
    </section>
  );
}

function SuggestionRow({ children }: { children: React.ReactNode }) {
  return (
    <button className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-[#1A1A1A] transition-colors duration-100 text-left">
      {children}
    </button>
  );
}

function Avatar({ suggestion }: { suggestion: SearchSuggestion }) {
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0">
      {suggestion.avatarUrl && (
        <img
          src={suggestion.avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          width={32}
          height={32}
        />
      )}
    </div>
  );
}
