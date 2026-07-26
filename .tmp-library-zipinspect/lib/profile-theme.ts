// ── Gallery Theme Types ─────────────────────────────────────────────────────
// Defines the customizable aspects of an artist's profile gallery presentation

export type GalleryLayout = 'grid' | 'masonry' | 'showcase' | 'editorial' | 'list'
export type HeroStyle = 'full' | 'split' | 'minimal' | 'banner'
export type AccentColor = 'emerald' | 'violet' | 'gold' | 'rose' | 'sky' | 'custom'

export interface GallerySection {
  id: string
  title: string
  layout: GalleryLayout
  visible: boolean
  order: number
  itemIds: string[]
}

export interface ProfileTheme {
  // Hero
  heroStyle: HeroStyle
  heroHeight: 'compact' | 'standard' | 'tall'
  showBio: boolean
  showSocials: boolean

  // Colors
  accentColor: AccentColor
  customAccent?: string // hex when accentColor is 'custom'

  // Gallery
  defaultLayout: GalleryLayout
  showTierBadges: boolean
  enableLightbox: boolean
  
  // Sections
  sections: GallerySection[]

  // Motion
  enableAnimations: boolean
  enableHoverEffects: boolean
}

// ── Default Theme ────────────────────────────────────────────────────────────

export const DEFAULT_SECTIONS: GallerySection[] = [
  { id: 'featured', title: 'Featured', layout: 'showcase', visible: true, order: 0, itemIds: ['m1', 'm2', 'm3'] },
  { id: 'gallery', title: 'All Works', layout: 'grid', visible: true, order: 1, itemIds: ['m4', 'm5', 'm6', 'm7', 'm8', 'm9'] },
  { id: 'portraits', title: 'Portrait Studies', layout: 'masonry', visible: true, order: 2, itemIds: ['m13', 'm14', 'm15', 'm16'] },
]

export const DEFAULT_THEME: ProfileTheme = {
  heroStyle: 'full',
  heroHeight: 'standard',
  showBio: true,
  showSocials: true,
  accentColor: 'emerald',
  defaultLayout: 'grid',
  showTierBadges: true,
  enableLightbox: true,
  sections: DEFAULT_SECTIONS,
  enableAnimations: true,
  enableHoverEffects: true,
}

// ── Accent Color Map ─────────────────────────────────────────────────────────

export const ACCENT_COLORS: Record<AccentColor, string> = {
  emerald: 'oklch(0.68 0.18 155)',
  violet: 'oklch(0.70 0.18 280)',
  gold: 'oklch(0.82 0.14 75)',
  rose: 'oklch(0.70 0.18 10)',
  sky: 'oklch(0.72 0.14 220)',
  custom: '',
}

// ── Layout Labels ────────────────────────────────────────────────────────────

export const LAYOUT_LABELS: Record<GalleryLayout, string> = {
  grid: 'Grid',
  masonry: 'Masonry',
  showcase: 'Showcase',
  editorial: 'Editorial',
  list: 'List',
}

export const HERO_STYLE_LABELS: Record<HeroStyle, string> = {
  full: 'Full Width',
  split: 'Split',
  minimal: 'Minimal',
  banner: 'Banner',
}
