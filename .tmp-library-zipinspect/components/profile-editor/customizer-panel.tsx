'use client'

import { useState } from 'react'
import {
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Eye,
  EyeOff,
  Grid3X3,
  LayoutGrid,
  Rows3,
  BookOpen,
  Palette,
  Layers,
  Sparkles,
  User,
  Image as ImageIcon,
  List,
} from 'lucide-react'
import {
  type ProfileTheme,
  type GalleryLayout,
  type HeroStyle,
  type AccentColor,
  LAYOUT_LABELS,
  HERO_STYLE_LABELS,
  ACCENT_COLORS,
} from '@/lib/profile-theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomizerPanelProps {
  theme: ProfileTheme
  onChange: (patch: Partial<ProfileTheme>) => void
  onClose: () => void
}

// ── Layout Icons ─────────────────────────────────────────────────────────────

const LAYOUT_ICONS: Record<GalleryLayout, React.ElementType> = {
  grid: Grid3X3,
  masonry: LayoutGrid,
  showcase: Rows3,
  editorial: BookOpen,
  list: List,
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-text-lo" />
          <span className="text-[13px] font-medium text-text-hi">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-text-mute" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-mute" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

// ── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      <span className="text-[12px] text-text-mid group-hover:text-text-hi transition-colors">
        {label}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </label>
  )
}

// ── Pill Selector ────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  options,
  value,
  onChange,
  labels,
  icons,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
  labels: Record<T, string>
  icons?: Record<T, React.ElementType>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const Icon = icons?.[opt]
        const isActive = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              isActive
                ? 'bg-accent text-primary-foreground'
                : 'bg-surface-2 text-text-mid hover:bg-surface-3'
            }`}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}

// ── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: AccentColor
  onChange: (v: AccentColor) => void
}) {
  const colors: AccentColor[] = ['emerald', 'violet', 'gold', 'rose', 'sky']

  return (
    <div className="flex items-center gap-2">
      {colors.map(color => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            value === color ? 'border-text-hi scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: ACCENT_COLORS[color] }}
          title={color.charAt(0).toUpperCase() + color.slice(1)}
        />
      ))}
    </div>
  )
}

// ── Section Reorder List ─────────────────────────────────────────────────────

function SectionList({
  theme,
  onChange,
}: {
  theme: ProfileTheme
  onChange: (patch: Partial<ProfileTheme>) => void
}) {
  const sortedSections = [...theme.sections].sort((a, b) => a.order - b.order)

  const toggleVisibility = (id: string) => {
    const updated = theme.sections.map(s =>
      s.id === id ? { ...s, visible: !s.visible } : s
    )
    onChange({ sections: updated })
  }

  const moveSection = (id: string, direction: 'up' | 'down') => {
    const idx = sortedSections.findIndex(s => s.id === id)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= sortedSections.length) return

    const reordered = [...sortedSections]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(newIdx, 0, moved)

    const updated = reordered.map((s, i) => ({ ...s, order: i }))
    onChange({ sections: updated })
  }

  const updateLayout = (id: string, layout: GalleryLayout) => {
    const updated = theme.sections.map(s =>
      s.id === id ? { ...s, layout } : s
    )
    onChange({ sections: updated })
  }

  return (
    <div className="space-y-1.5">
      {sortedSections.map((section, idx) => {
        const LayoutIcon = LAYOUT_ICONS[section.layout]
        return (
          <div
            key={section.id}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
              section.visible
                ? 'bg-surface-2 border-border'
                : 'bg-surface-1 border-transparent opacity-60'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5 text-text-mute cursor-grab flex-shrink-0" />
            
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-hi truncate">{section.title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {(['grid', 'masonry', 'showcase', 'editorial'] as GalleryLayout[]).map(layout => {
                  const Icon = LAYOUT_ICONS[layout]
                  const isActive = section.layout === layout
                  return (
                    <button
                      key={layout}
                      onClick={() => updateLayout(section.id, layout)}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-accent/20 text-accent'
                          : 'text-text-mute hover:text-text-lo hover:bg-surface-3'
                      }`}
                      title={LAYOUT_LABELS[layout]}
                    >
                      <Icon className="w-3 h-3" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => moveSection(section.id, 'up')}
                disabled={idx === 0}
                className="w-5 h-5 rounded flex items-center justify-center text-text-mute hover:text-text-lo hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => moveSection(section.id, 'down')}
                disabled={idx === sortedSections.length - 1}
                className="w-5 h-5 rounded flex items-center justify-center text-text-mute hover:text-text-lo hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleVisibility(section.id)}
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                  section.visible
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-text-mute hover:text-text-lo hover:bg-surface-3'
                }`}
              >
                {section.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CustomizerPanel({ theme, onChange, onClose }: CustomizerPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-[380px] max-w-full h-full flex flex-col bg-surface-1 border-l border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-[14px] font-semibold text-text-hi">Curate Gallery</h2>
            <p className="text-[11px] text-text-lo mt-0.5">Customize your profile presentation</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-mute hover:text-text-hi hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero Section */}
          <Section title="Hero" icon={User} defaultOpen>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-text-lo mb-1.5">Style</p>
                <PillSelector
                  options={['full', 'split', 'minimal', 'banner'] as HeroStyle[]}
                  value={theme.heroStyle}
                  onChange={v => onChange({ heroStyle: v })}
                  labels={HERO_STYLE_LABELS}
                />
              </div>
              <div>
                <p className="text-[11px] text-text-lo mb-1.5">Height</p>
                <PillSelector
                  options={['compact', 'standard', 'tall'] as const}
                  value={theme.heroHeight}
                  onChange={v => onChange({ heroHeight: v })}
                  labels={{ compact: 'Compact', standard: 'Standard', tall: 'Tall' }}
                />
              </div>
              <ToggleRow label="Show bio" checked={theme.showBio} onChange={v => onChange({ showBio: v })} />
              <ToggleRow label="Show social links" checked={theme.showSocials} onChange={v => onChange({ showSocials: v })} />
            </div>
          </Section>

          {/* Accent Color */}
          <Section title="Accent Color" icon={Palette} defaultOpen>
            <ColorPicker value={theme.accentColor} onChange={v => onChange({ accentColor: v })} />
          </Section>

          {/* Gallery Sections */}
          <Section title="Sections" icon={Layers} defaultOpen>
            <SectionList theme={theme} onChange={onChange} />
          </Section>

          {/* Gallery Options */}
          <Section title="Gallery Options" icon={ImageIcon}>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-text-lo mb-1.5">Default Layout</p>
                <PillSelector
                  options={['grid', 'masonry', 'showcase', 'editorial'] as GalleryLayout[]}
                  value={theme.defaultLayout}
                  onChange={v => onChange({ defaultLayout: v })}
                  labels={LAYOUT_LABELS}
                  icons={LAYOUT_ICONS}
                />
              </div>
              <ToggleRow label="Show tier badges" checked={theme.showTierBadges} onChange={v => onChange({ showTierBadges: v })} />
              <ToggleRow label="Enable lightbox" checked={theme.enableLightbox} onChange={v => onChange({ enableLightbox: v })} />
            </div>
          </Section>

          {/* Motion */}
          <Section title="Motion" icon={Sparkles}>
            <div className="space-y-3">
              <ToggleRow label="Enable animations" checked={theme.enableAnimations} onChange={v => onChange({ enableAnimations: v })} />
              <ToggleRow label="Enable hover effects" checked={theme.enableHoverEffects} onChange={v => onChange({ enableHoverEffects: v })} />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-mid hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-accent text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}
