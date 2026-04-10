"use client";

import { useState } from "react";
import { Heart, Play } from "lucide-react";
import type { DiscoverItem } from "@/lib/relay-fixtures";

interface DiscoverGridProps {
  items: DiscoverItem[];
  onItemClick: (item: DiscoverItem) => void;
}

export function DiscoverGrid({ items, onItemClick }: DiscoverGridProps) {
  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 p-3">
      {items.map((item, index) => (
        <DiscoverCard 
          key={item.id} 
          item={item} 
          onClick={() => onItemClick(item)} 
          animationDelay={index * 50}
        />
      ))}
    </div>
  );
}

interface DiscoverCardProps {
  item: DiscoverItem;
  onClick: () => void;
  animationDelay: number;
}

function DiscoverCard({ item, onClick, animationDelay }: DiscoverCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const aspectClasses = {
    square: "aspect-square",
    portrait: "aspect-[3/4]",
    landscape: "aspect-[4/3]",
    wide: "aspect-[16/10]",
  };

  return (
    <div
      className="relative mb-3 break-inside-avoid group cursor-pointer"
      style={{ 
        opacity: 1,
        transform: 'translateY(0)',
        animation: `fadeInUp 0.5s ease-out ${animationDelay}ms both`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`View ${item.title} by ${item.creator.displayName}`}
    >
      {/* Image container */}
      <div
        className={[
          "relative overflow-hidden rounded-lg bg-[#161616]",
          aspectClasses[item.aspectRatio],
        ].join(" ")}
      >
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Video indicator */}
        {item.mediaType === "video" && (
          <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
            <Play size={12} className="text-white fill-white ml-0.5" />
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={[
            "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent",
            "flex flex-col justify-end p-3 transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {/* Creator info */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0">
              <img
                src={item.creator.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs text-white/90 font-medium truncate">
              {item.creator.displayName}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug">
            {item.title}
          </h3>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-white/70">
              <Heart size={10} />
              {item.likeCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
