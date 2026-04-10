"use client";

import type { PositionalComment } from "@/lib/relay-fixtures";
import { CommentPin } from "./comment-pin";

type Props = {
  stackRef?: React.Ref<HTMLDivElement>;
  imageSrc: string;
  title: string;
  comments: PositionalComment[];
  pinLayerVisible: boolean;
  ghostPins: boolean;
  /** Per-pin cascade */
  cascadeEnter: (index: number) => number;
  cascadeExit: (index: number) => number;
  surfaceClassName: string;
  imgClassName: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  role?: string;
  tabIndex?: number;
  "aria-label"?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Shared image + absolute pin layer — same % box for letterbox and expanded overlay */
export function GalleryMediaStack({
  stackRef,
  imageSrc,
  title,
  comments,
  pinLayerVisible,
  ghostPins,
  cascadeEnter,
  cascadeExit,
  surfaceClassName,
  imgClassName,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
  role,
  tabIndex,
  "aria-label": ariaLabel,
  style,
  children
}: Props) {
  return (
    <div
      ref={stackRef}
      role={role as React.AriaRole | undefined}
      tabIndex={tabIndex}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={style}
      className={surfaceClassName}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixture / relay URLs */}
      <img
        src={imageSrc}
        alt={title}
        className={imgClassName}
        crossOrigin="anonymous"
        draggable={false}
      />
      <div className="absolute inset-0 pointer-events-auto">
        {comments.map((comment, index) => (
          <CommentPin
            key={comment.id}
            comment={comment}
            index={index}
            variant={ghostPins ? "ghost" : "default"}
            layerVisible={pinLayerVisible}
            cascadeDelayMs={
              pinLayerVisible ? cascadeEnter(index) : cascadeExit(index)
            }
          />
        ))}
      </div>
      {children}
    </div>
  );
}
