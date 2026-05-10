# Analytics Dashboard — Component Library & Patterns

> **Purpose:** Reusable component specifications for the Insights Hub. Build once, use across dashboard, detail views, and mobile.

---

## 1. Recommendation Card Component

### **Purpose**
Primary card for surfacing one actionable insight to the creator.

### **Props**

```typescript
interface RecommendationCardProps {
  // Data
  recommendation_id: string;
  card_type: CardType; // 'dead_tier' | 'velocity_mismatch' | 'churn_signal' | ...
  priority: 'high' | 'medium' | 'low';
  title: string;           // e.g., "Dead Tier Alert"
  headline_metric: string; // e.g., "23%"
  metric_label?: string;   // e.g., "of views" (optional)
  diagnosis: string;       // 1–2 lines explaining the signal
  icon: React.ReactNode;   // Icon component or emoji
  confidence_score?: number; // 0–1, shown as small badge if < 0.9
  
  // Actions
  primary_action: string;    // e.g., "View Insight"
  secondary_actions?: string[];
  
  // Callbacks
  onViewDetail: () => void;
  onDismiss: () => void;
  onSecondaryAction?: (action: string) => void;
  
  // States
  isLoading?: boolean;
  isDismissed?: boolean;
  isEarlyData?: boolean; // Show "estimated" label
}
```

### **Visual States**

#### Default (Ready)
```
┌────────────────────────────────────────┐
│ ⚠️  [HIGH PRIORITY]              [✕]  │
│ Dead Tier Alert                        │
│ 23% of views                           │
│ Your "Supporter" tier has members but  │
│ zero exclusive content in 4 months.    │
│ [View Insight →]                       │
└────────────────────────────────────────┘
Styles:
- BG: bg-orange-50
- Border: border-gray-200
- Shadow: shadow-sm
- Hover: shadow-md, translate-y-[-2px]
```

#### Hovering
```
Translate up 2px, shadow increases, cursor pointer
Duration: 200ms ease-out
```

#### Loading (Skeleton)
```
┌────────────────────────────────────────┐
│ ▮▮▮ [▮▮▮▮▮▮]              [▮]         │
│ ▮▮▮▮▮▮▮▮▮▮▮▮                         │
│ ▮▮▮▮▮▮▮▮▮                            │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮             │
│ [▮▮▮▮▮▮▮▮▮▮▮]                        │
└────────────────────────────────────────┘
- Skeleton bars with gradient pulse animation
- Duration: 2s loop (tailwind animate-pulse)
```

#### Early Data (< 3 months old, small n)
```
Same as default, but:
- Opacity: 75%
- Info badge: "ESTIMATED" (gray)
- Tooltip on hover: "More data arrives as you grow."
```

#### Dismissed
```
Card animates left with fade-out (300ms ease-in)
Removed from DOM after animation completes
Toast confirms: "Insight dismissed. View in archive."
```

#### Error
```
┌────────────────────────────────────────┐
│ ❌ Unable to Load                      │
│                                        │
│ This insight couldn't load. Try again. │
│ [Retry] [Help]                         │
└────────────────────────────────────────┘
- BG: bg-red-50
- Icon: ❌ (red-600)
- Text: text-red-700
```

### **Responsive Variants**

| Breakpoint | Card Width | Cards Per Row | Details |
|---------|----------|------------|----------|
| Mobile (< 640px) | 100% - 32px (16px margin) | 1 | Full-width, horizontal scroll disabled |
| Tablet (640–1024px) | calc(50% - 16px) | 2 | 2-card grid, gap 24px |
| Desktop (> 1024px) | calc(33.333% - 24px) | 3 | 3-card grid, gap 24px, max-w-1200px container |

### **Implementation Example (React + Tailwind)**

```tsx
import React, { useState } from 'react';

export function RecommendationCard({
  card_type,
  priority,
  title,
  headline_metric,
  metric_label,
  diagnosis,
  icon,
  confidence_score,
  primary_action,
  isEarlyData,
  onViewDetail,
  onDismiss,
}) {
  const [isDismissing, setIsDismissing] = useState(false);

  const priorityConfig = {
    high: { bg: 'bg-orange-50', badge: 'HIGH PRIORITY', color: 'text-orange-600' },
    medium: { bg: 'bg-purple-50', badge: 'MEDIUM PRIORITY', color: 'text-purple-600' },
    low: { bg: 'bg-gray-50', badge: 'INFO', color: 'text-gray-600' },
  }[priority];

  const handleDismiss = async () => {
    setIsDismissing(true);
    // Animate out, then callback
    setTimeout(() => onDismiss(), 300);
  };

  return (
    <div
      className={`
        ${priorityConfig.bg}
        rounded-lg border border-gray-200
        p-6 shadow-sm
        hover:shadow-md hover:translate-y-[-2px]
        transition-all duration-200
        ${isDismissing ? 'opacity-0 translate-x-[-100%]' : 'opacity-100'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{icon}</div>
          <span className={`text-xs font-bold uppercase ${priorityConfig.color}`}>
            {priorityConfig.badge}
          </span>
          {confidence_score !== undefined && confidence_score < 0.9 && (
            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Estimated
            </span>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss insight"
        >
          ✕
        </button>
      </div>

      {/* Title & Metric */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <div className={`text-3xl font-bold ${priorityConfig.color} mb-2`}>
        {headline_metric}
      </div>
      {metric_label && <p className="text-xs text-gray-600 mb-4">{metric_label}</p>}

      {/* Diagnosis */}
      <p className="text-sm text-gray-700 leading-relaxed mb-6">{diagnosis}</p>

      {/* Early Data Warning */}
      {isEarlyData && (
        <p className="text-xs text-gray-500 italic mb-4">
          🌱 More data arrives as you grow. Check back next week.
        </p>
      )}

      {/* Action Button */}
      <button
        onClick={onViewDetail}
        className={`text-sm font-semibold flex items-center gap-2 ${priorityConfig.color} hover:underline`}
      >
        {primary_action} →
      </button>
    </div>
  );
}
```

---

## 2. Detail View Modal Component

### **Purpose**
Full-screen breakdown of a recommendation with context, member samples, and action options.

### **Layout**

```
Mobile (full-screen overlay):
┌─────────────────────────┐
│ [←] Title [X]           │ ← Header (sticky)
├─────────────────────────┤
│                         │
│ KEY METRICS             │
│ [3-col grid]            │
│                         │
│ CONTEXT                 │
│ [Rich paragraph]        │
│                         │
│ AFFECTED MEMBERS        │
│ [Sample list + CTA]     │
│                         │
│ RECOMMENDED ACTIONS     │
│ [Checkboxes / radio]    │
│                         │
│ SUPPORTING DATA         │
│ [Chart or table]        │
│                         │
└─────────────────────────┘
[Primary Action]

Desktop (600–700px centered modal):
Same layout, max-width 600px, centered on screen
```

### **Props**

```typescript
interface DetailViewProps {
  recommendation_id: string;
  card_type: CardType;
  title: string;
  priority: 'high' | 'medium' | 'low';
  
  // Sections
  keyMetrics: Array<{ label: string; value: string | number }>;
  context: string; // Rich markdown or plain text
  affectedMembers?: Array<{ id: string; name: string; joinedAt: string; tenure: string }>;
  recommendedActions: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  supportingData?: {
    type: 'chart' | 'table' | 'list';
    title: string;
    data: any;
  };
  
  // Actions
  onClose: () => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  onFeedback?: () => void;
}
```

### **Sections**

#### Key Metrics Section
```
┌──────────────────────────────────────────┐
│ KEY METRICS                              │
├──────────────────────────────────────────┤
│ Members   │ Tenure  │ Posts              │
│ 8         │ 4 mo.   │ 0 exclusive        │
└──────────────────────────────────────────┘
- Grid: 3 equal columns
- Center-aligned numbers
- Light gray background (bg-gray-50)
- Border: border-gray-200
```

#### Context Paragraph
```
"Your "Supporter" tier is at risk. While 8 members are paying, 
they're receiving zero tier-exclusive content. Without new 
posts gated to this tier, expect 30–50% churn in 60 days."

- 16px font, line-height 1.6
- Color: text-gray-700
- Max-width: 90% (readable line length)
- Padding: 16px vertical, 0 horizontal
```

#### Affected Members List
```
┌──────────────────────────────────────────┐
│ AFFECTED MEMBERS                   [See] │
├──────────────────────────────────────────┤
│ @patron_1                                │
│ Joined Mar 2024 · 2 months tenure        │
│                                          │
│ @patron_2                                │
│ Joined Apr 2024 · 1 month tenure         │
│                                          │
│ +6 more → [View all members]             │
└──────────────────────────────────────────┘
- Show 3 members max (+ count link)
- Member format: @handle on top, metadata below
- Link to full member list (separate page/view)
```

#### Recommended Actions Section
```
☐ Schedule 2–3 exclusive posts for this tier (next 2 wks)
☐ Merge this tier into "Supporter Plus"
☐ Adjust tier price to increase perceived value
☐ Archive tier and offer reactivation incentive

- Checkboxes (not radio) — creator may do multiple
- Subtitles optional (brief explanation)
- Selectedcheckbox doesn't change card view (informational, not filtering)
```

#### Supporting Data (Optional)
```
Example 1: Chart
┌──────────────────────────────────────────┐
│ MEMBER COUNT TREND (Last 90 days)        │
│                                    ▁▁▁▂▂ │
│                          ▂▃▃▃▃▃▃▃▃▄▄     │
│              ▁▂▃▄▅▆▇▇▇▇▇             │
│  Jun    Jul   Aug   Sep   Oct  Nov  Dec  │
└──────────────────────────────────────────┘

Example 2: Table
┌──────────────────────────────────────────┐
│ LAST 5 POSTS (for this tier)             │
├─────────────────────────────────────────┤
│ Post      │ Date   │ Views │ Engagement │
├─────────────────────────────────────────┤
│ Post #5   │ Jan 22 │ 124   │ 12 likes   │
│ Post #4   │ Jan 15 │ 98    │ 8 likes    │
│ (No posts before 30d ago)                │
└──────────────────────────────────────────┘
```

### **Mobile vs Desktop Variants**

**Mobile:**
- Full-screen overlay (covers entire viewport)
- Header sticky (remains visible during scroll)
- Sections stack vertically (100% width)
- Buttons full-width at bottom

**Desktop:**
- Centered modal (600–700px width)
- Header scrolls with content (not sticky)
- Sections same layout
- Buttons at bottom of modal (center-aligned)

---

## 3. Hub Layout & Grid Component

### **Container Structure**

```tsx
export function InsightsHub() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header (global nav) */}
      <Header />

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero section */}
        <HeroSection />

        {/* Filter bar */}
        <FilterBar />

        {/* Recommendations grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.id} {...rec} />
          ))}
        </div>

        {/* Empty state or archive link */}
        {recommendations.length === 0 && <EmptyState />}
        {recommendations.length > 0 && <ArchiveLink />}
      </main>
    </div>
  );
}
```

### **Spacing Scale**

```
Gap between cards: 24px (gap-6 in Tailwind)
Padding inside hub: 32px (horizontal), 48px (vertical)
Card padding: 24px
Modal padding: 32px
Button height: 40px (touch-friendly)
Icon size: 32px
```

---

## 4. Badge Component

### **Variants**

```
HIGH PRIORITY
- BG: bg-orange-600
- Text: text-white
- Size: 11px font, 4px vertical padding, 8px horizontal

MEDIUM PRIORITY
- BG: bg-purple-600
- Text: text-white
- Size: 11px, 4px/8px padding

INFO
- BG: bg-gray-600
- Text: text-white
- Size: 11px, 4px/8px padding

ESTIMATED (Confidence < 0.9)
- BG: bg-yellow-100
- Text: text-yellow-800
- Size: 11px, 4px/8px padding
```

### **Usage**

```tsx
<Badge priority="high" label="HIGH PRIORITY" />
<Badge variant="estimated" label="ESTIMATED" />
```

---

## 5. Filter Bar Component

### **Layout**

```
[Icon] [Dropdown 1] · [Icon] [Dropdown 2] · [Refresh Button]
                                           [⟲ Refresh]
```

### **Dropdown: Channels**

```
All Channels ▼
├─ ✓ All Channels
├─ ○ Channel 1 (@artist_1)
├─ ○ Channel 2 (@artist_2)
└─ ○ [Add channel]
```

### **Dropdown: Time Range**

```
May 12–May 18, 2024 ▼
├─ Last 7 days
├─ ✓ Last 14 days
├─ Last 30 days
├─ Last 90 days
├─ ─────────────
├─ Last month (Apr 1–30)
├─ Last quarter (Jan–Mar)
└─ Custom range [📅]
```

### **Refresh Button**

```
State: Default
[⟲] Refresh

State: Loading
[⟲] Refresh (spinning icon, disabled)

State: Complete
Toast: "Insights updated." (auto-dismiss 2s)
```

---

## 6. Empty State Component

### **Variant 1: All Clear**

```
┌─────────────────────────────────────┐
│                                     │
│            🎉 All Clear!            │
│                                     │
│ You're keeping your content and     │
│ audience healthy. Keep doing what   │
│ you're doing.                       │
│                                     │
│ Insights update daily. Check back   │
│ tomorrow for new recommendations.   │
│                                     │
│ [View past insights] · [Help]       │
│                                     │
│ Last updated: 2 hours ago           │
│                                     │
└─────────────────────────────────────┘
```

### **Variant 2: No Events**

```
📊 No activity in this time range.

Try a longer period:
[Last 30 days] [Last 90 days]
```

### **Variant 3: Creator Too New**

```
🌱 Your account is brand new!

Insights arrive after 24 hours of activity.
Come back tomorrow.
```

---

## 7. Loading States

### **Skeleton Card**

```tsx
export function CardSkeleton() {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 animate-pulse">
      <div className="flex gap-3 mb-4">
        <div className="w-8 h-8 bg-gray-300 rounded" />
        <div className="w-32 h-4 bg-gray-300 rounded" />
      </div>
      <div className="w-64 h-6 bg-gray-300 rounded mb-4" />
      <div className="w-full h-16 bg-gray-300 rounded mb-4" />
      <div className="w-32 h-4 bg-gray-300 rounded" />
    </div>
  );
}
```

### **Hub Loading (Skeleton Grid)**

```
Show 3 skeleton cards (desktop) or 1 (mobile)
Pulse animation for 1–2s
After load, fade in real content (200ms)
```

---

## 8. Toast Notifications

### **Dismiss Confirmation**

```
✓ Insight dismissed. View in archive.
[Undo]
```

Position: Bottom-left or center (mobile)
Duration: 4s (auto-dismiss)
Background: bg-green-50 / border-green-200

### **Error Toast**

```
❌ Unable to load insight. [Retry]
```

Position: Center or top
Duration: Persistent (user closes)
Background: bg-red-50 / border-red-200

### **Info Toast (Refresh)**

```
⟲ Updating insights...
```

Position: Bottom-right
Duration: Dismiss when complete
Background: bg-blue-50

---

## 9. Accessibility Requirements

### **Color Contrast**

- Text on card background: ≥ 4.5:1 (WCAG AA)
- Priority badge text: ≥ 4.5:1
- Secondary text (diagnosis): ≥ 3:1 (WCAG AA for large text)

### **Focus Management**

```
- Buttons: focus-visible outline (2px, offset 2px)
- Modal: focus trap (Tab cycles within modal)
- Dismiss X: Accessible via keyboard (Enter or Space)
- Links: Underline on focus, not just color
```

### **ARIA Labels**

```tsx
<button aria-label="Dismiss insight">✕</button>
<button aria-label="Expand detail view">View Insight →</button>
<div role="img" aria-label="Warning: Dead tier at risk">⚠️</div>
```

### **Semantic HTML**

```tsx
<header> {/* Page header */}
<main> {/* Main content */}
<article> {/* Each card as article */}
<section> {/* Hub, archive, etc. */}
<button> {/* Actions, not <a> for onClick handlers */}
<h1>, <h2>, <h3> {/* Proper heading hierarchy */}
```

---

## 10. Component Inventory Checklist

- [ ] RecommendationCard (5 states: default, hover, loading, error, dismissed)
- [ ] DetailView / Modal (5 sections: metrics, context, members, actions, data)
- [ ] FilterBar (channels, time range, refresh)
- [ ] Badge (high/medium/low/estimated)
- [ ] Button (primary, secondary, tertiary, disabled)
- [ ] Toast (success, error, info, loading)
- [ ] EmptyState (3 variants)
- [ ] CardSkeleton (loading animation)
- [ ] HeroSection (creator intro, tagline)
- [ ] ArchiveLink (access dismissed insights)
- [ ] Modal / Overlay (backdrop, focus trap, keyboard handling)
- [ ] Dropdown (single/multi-select, keyboard nav)

---

## Implementation Priority

**Phase 1 (MVP, Week 1–2):**
- RecommendationCard (default + loading states)
- FilterBar (basic)
- EmptyState
- HeroSection

**Phase 2 (Week 3–4):**
- DetailView modal
- All card states (hover, error, dismissed)
- Toast notifications
- Archive link

**Phase 3 (Week 5+):**
- Supporting data (charts, member lists)
- Advanced interactions (re-ordering, filtering by priority)
- Dark mode
- Performance optimization

---

## Design Tokens (Tailwind)

```
Colors:
- Primary accent: orange-600 (#F97316)
- Secondary accent: purple-600 (#A855F7)
- Neutral: gray-600 (#4B5563)
- Background: white / gray-50 (#FFFFFF / #F9FAFB)
- Border: gray-200 (#E5E7EB)
- Text primary: gray-900 (#111827)
- Text secondary: gray-600 (#4B5563)

Spacing:
- Gap between cards: 1.5rem (24px)
- Card padding: 1.5rem (24px)
- Section padding: 2.5rem (40px)
- Button height: 2.5rem (40px)

Typography:
- Title: 3xl font-semibold (--font-display)
- Card title: xl font-semibold
- Metric: 2xl font-bold
- Body: sm font-normal
- Caption: xs font-normal

Shadows:
- shadow-sm: For card base
- shadow-md: For card hover
- shadow-lg: For modal

Border radius:
- rounded-lg: For cards (0.5rem)
- rounded-md: For buttons (0.375rem)
```
