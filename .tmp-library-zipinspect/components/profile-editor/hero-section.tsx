'use client'

import { Camera, Edit3, ExternalLink, Twitter, Instagram, Globe } from 'lucide-react'
import type { ViewMode } from '@/app/designer/page'
import type { HeroStyle } from '@/lib/profile-theme'

interface HeroSectionProps {
  viewMode: ViewMode
  isSelected: boolean
  heroStyle?: HeroStyle
  heroHeight?: 'compact' | 'standard' | 'tall'
  showBio?: boolean
  showSocials?: boolean
}

const HEIGHT_CLASSES = {
  compact: 'h-32',
  standard: 'h-48',
  tall: 'h-64',
}

export function HeroSection({ 
  viewMode, 
  isSelected,
  heroStyle = 'full',
  heroHeight = 'standard',
  showBio = true,
  showSocials = true,
}: HeroSectionProps) {
  const heightClass = HEIGHT_CLASSES[heroHeight]
  return (
    <div className="relative rounded-2xl overflow-hidden bg-surface-1">
      {/* Cover Image */}
      <div className={`relative ${heightClass} bg-gradient-to-br from-surface-2 via-surface-3 to-surface-2 transition-all duration-300`}>
        {/* Edit cover affordance */}
        {isSelected && (
          <button
            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-surface-0/80 backdrop-blur-sm border border-border text-xs font-medium text-text-mid hover:text-text-hi hover:bg-surface-1 transition-colors flex items-center gap-1.5"
            onClick={e => e.stopPropagation()}
          >
            <Camera className="w-3.5 h-3.5" />
            Change Cover
          </button>
        )}
      </div>

      {/* Profile Info */}
      <div className="relative px-6 pb-6">
        {/* Avatar */}
        <div className="absolute -top-12 left-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-surface-3 border-4 border-surface-1 flex items-center justify-center text-2xl font-bold text-text-lo">
              EA
            </div>
            {isSelected && (
              <button
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-3 transition-colors"
                onClick={e => e.stopPropagation()}
                data-tooltip="Change avatar"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Text content */}
        <div className="pt-16">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-text-hi tracking-tight flex items-center gap-2">
                Elena Adler
                {isSelected && (
                  <button
                    className="text-text-mute hover:text-select transition-colors"
                    onClick={e => e.stopPropagation()}
                    data-tooltip="Edit name"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </h1>
              <p className="text-sm text-text-mid mt-1">Digital artist and illustrator</p>
              {showBio && (
                <p className="text-sm text-text-lo mt-3 leading-relaxed max-w-md transition-opacity duration-300">
                  Creating surreal digital paintings inspired by dreams and mythology. Sharing process work and high-res downloads for supporters.
                  {isSelected && (
                    <button
                      className="ml-2 text-select hover:text-select/80 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Edit3 className="w-3 h-3 inline" />
                    </button>
                  )}
                </p>
              )}
              {showSocials && (
                <div className="flex items-center gap-2 mt-3 transition-opacity duration-300">
                  <a href="#" className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-3 transition-colors">
                    <Twitter className="w-3.5 h-3.5" />
                  </a>
                  <a href="#" className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-3 transition-colors">
                    <Instagram className="w-3.5 h-3.5" />
                  </a>
                  <a href="#" className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-3 transition-colors">
                    <Globe className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Support CTA */}
            <a
              href="#"
              className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-accent text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              onClick={e => e.stopPropagation()}
            >
              Support on Patreon
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Tier info — visible in creator/tier views */}
          {(viewMode === 'creator' || viewMode === 'tier') && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              <span className="px-2.5 py-1 rounded-lg bg-gold-soft text-gold text-xs font-medium">
                Tier 2
              </span>
              <span className="text-xs text-text-mute">
                214 supporters · 1.2k followers
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
