'use client'

import {
  Layers,
  GalleryHorizontal,
  MessageSquarePlus,
  Settings,
  Sparkles,
  ChevronLeft,
  Home,
} from 'lucide-react'

import Link from 'next/link'

interface EditorSidebarProps {
  onPostUpdate?: () => void
  onCurateGallery?: () => void
}

export function EditorSidebar({ onPostUpdate, onCurateGallery }: EditorSidebarProps) {
  return (
    <aside className="w-16 bg-surface-1 border-r border-border flex flex-col items-center py-4 gap-1">
      {/* Back to Action Center */}
      <Link
        href="/"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors mb-4"
        title="Back to Action Center"
      >
        <ChevronLeft className="w-5 h-5" />
      </Link>

      {/* Divider */}
      <div className="w-8 h-px bg-border mb-3" />

      {/* POST UPDATE — communication tool, distinct green accent */}
      <button
        onClick={onPostUpdate}
        className="group relative w-10 h-10 rounded-xl flex items-center justify-center bg-accent/10 text-accent hover:bg-accent hover:text-primary-foreground transition-colors"
        title="Post Update — publish a status to your billboard"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </button>

      {/* Spacer between communication and gallery tools */}
      <div className="w-6 h-px bg-border my-2" />

      {/* CURATE GALLERY — gallery/artwork tool, gold styling */}
      <button
        onClick={onCurateGallery}
        className="group w-10 h-10 rounded-xl flex items-center justify-center text-text-lo hover:text-gold hover:bg-gold-soft transition-colors"
        title="Curate Gallery — manage artwork in your gallery"
      >
        <GalleryHorizontal className="w-5 h-5" />
      </button>

      {/* Add Collection */}
      <button
        className="group w-10 h-10 rounded-xl flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
        title="Add Collection"
      >
        <Layers className="w-5 h-5" />
      </button>

      {/* Page Settings */}
      <button
        className="group w-10 h-10 rounded-xl flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
        title="Page Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Suggested Stacks */}
      <div 
        className="w-10 h-10 rounded-xl flex items-center justify-center text-gold hover:bg-gold-soft transition-colors cursor-pointer" 
        title="Suggested Variant Stacks"
      >
        <Sparkles className="w-5 h-5" />
      </div>

      {/* Page outline */}
      <button
        className="w-10 h-10 rounded-xl flex items-center justify-center text-text-mute hover:text-text-lo hover:bg-surface-2 transition-colors mt-2"
        title="Page Outline"
      >
        <Home className="w-4 h-4" />
      </button>
    </aside>
  )
}
