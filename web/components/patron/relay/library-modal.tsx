"use client";

import { useState } from "react";
import { X, Zap } from "lucide-react";
import { LIBRARY_COLLECTIONS, type LibraryImage } from "@/lib/relay-fixtures";

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchVibe: (image: LibraryImage) => void;
}

export function LibraryModal({
  isOpen,
  onClose,
  onMatchVibe,
}: LibraryModalProps) {
  const [selectedImage, setSelectedImage] = useState<LibraryImage | null>(null);
  const [activeTab, setActiveTab] = useState<string>("col1");

  if (!isOpen) return null;

  const activeCollection = LIBRARY_COLLECTIONS.find(
    (col) => col.id === activeTab
  );
  const allImages = activeCollection?.images || [];

  const handleMatchVibe = () => {
    if (selectedImage) {
      onMatchVibe(selectedImage);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Library"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/95"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#0E0E0E] rounded-xl border border-[#1A1A1A] flex flex-col shadow-2xl animate-[scaleIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-lg font-semibold text-[#E0E0E0]">Your Library</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#555555] hover:text-[#888888] transition-colors"
            aria-label="Close library"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-[#1A1A1A]">
          {LIBRARY_COLLECTIONS.map((collection) => (
            <button
              key={collection.id}
              onClick={() => {
                setActiveTab(collection.id);
                setSelectedImage(null);
              }}
              className={[
                "px-4 py-2 text-sm font-medium transition-colors border-b-2",
                activeTab === collection.id
                  ? "text-[#40916C] border-[#40916C]"
                  : "text-[#555555] border-transparent hover:text-[#888888]",
              ].join(" ")}
            >
              {collection.name} ({collection.imageCount})
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allImages.map((image) => (
              <button
                key={image.id}
                onClick={() => setSelectedImage(image)}
                className={[
                  "relative group rounded-lg overflow-hidden aspect-square transition-all",
                  selectedImage?.id === image.id
                    ? "ring-2 ring-[#40916C]"
                    : "hover:ring-1 hover:ring-[#1B4332]",
                ].join(" ")}
              >
                <img
                  src={image.imageUrl}
                  alt={image.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <p className="text-xs font-medium text-white truncate">
                    {image.title}
                  </p>
                  <p className="text-[10px] text-[#888888]">
                    by {image.creator.displayName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#1A1A1A] px-6 py-4 flex items-center justify-between gap-3">
          {selectedImage && (
            <div className="flex-1 text-left">
              <p className="text-xs text-[#E0E0E0] font-medium">
                {selectedImage.title}
              </p>
              <p className="text-xs text-[#555555]">
                Vibe: <span className="capitalize text-[#40916C]">{selectedImage.vibe}</span>
              </p>
            </div>
          )}
          <button
            onClick={handleMatchVibe}
            disabled={!selectedImage}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all",
              selectedImage
                ? "bg-[#40916C] text-[#0E0E0E] hover:bg-[#55a87b]"
                : "bg-[#1A1A1A] text-[#555555] cursor-not-allowed",
            ].join(" ")}
          >
            <Zap size={14} />
            Match Vibe
          </button>
        </div>
      </div>
    </div>
  );
}
