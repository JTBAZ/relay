# Analytics Dashboard — Design System & UX Specification

> **Mission:** Keep creators in a state of **clarity**—scannable in <2 minutes, immediately actionable, never overwhelmed. Information architecture + interaction patterns for Relay Insights Hub.

---

## Part 1: Design Principles

### 1️⃣ **Progressive Disclosure (Anti-Overwhelm)**

**Rule:** Surface only the 3–5 most actionable insights at once. Everything else is one click away.

- **Hub view** (main)
  - 3–5 cards max
  - One headline metric per card
  - One action per card
  - No sub-tables, no raw data

- **Detail view** (drill-through)
  - Full context available
  - Charts, member lists, historical data
  - Explore without cluttering main hub

- **Archive view** (historical)
  - Dismissed or old insights
  - Low priority; discoverable but not prominent

### 2️⃣ **Hierarchy = Scanning Speed**

**Rule:** Creator should know what to do after 8 seconds.

- **Scan 1 (0–3s):** Visual signal (icon + accent color) → "Is this for me?"
- **Scan 2 (3–6s):** Headline + headline metric → "What changed?"
- **Scan 3 (6–8s):** One-line diagnosis → "Why now?"
- **Action (8–15s):** Button text is clear verb ("Create post", "Merge tier", "Review members")

### 3️⃣ **Aesthetic Minimalism**

**Rule:** Every pixel earns its space.

- Max 1 color accent per card (orange for high priority, purple for medium, gray for low)
- Icons: simple, 1-color, 24–32px
- Typography: 2 weights max (regular + semibold); no nesting > 2 levels
- Whitespace > data (breathing room between cards)
- Shadows: subtle (not stacked), used only for elevation

### 4️⃣ **Responsiveness Without Compromise**

**Rule:** Mobile = summary only; desktop = full detail.

- **Mobile (< 640px):** 1 card per row; stack vertically; no drill-through inline
- **Tablet (640–1024px):** 2 cards per row
- **Desktop (> 1024px):** 3 cards per row (max)

---

## Part 2: Information Architecture

### **Layout Grid (Desktop)**

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER (Fixed)                                               [Dark] │
│ Logo · Dashboard · Content · Audience · Monetization · Insights    │
│                                       Creator Profile               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ HERO SECTION                                                        │
│                                                                     │
│ Creator Avatar + Name                                              │
│ "Welcome back! Here's what's happening with your content."        │
│                                                                     │
│                    Insights Hub                                    │
│         AI-powered insights to help you grow, faster.             │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ FILTER BAR                                                          │
│ [All Channels ▼] · [May 12–May 18, 2024 ▼] · [← → ]             │
│                                                      [Refresh ⟲]    │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┬──────────────────────┐
│                      │                      │                      │
│   CARD 1             │   CARD 2             │   CARD 3             │
│   (Priority 1)       │   (Priority 2)       │   (Priority 3)       │
│                      │                      │                      │
│   [Icon] [Badge]     │   [Icon] [Badge]     │   [Icon] [Badge]     │
│   "Dead Tier Alert"  │   "Velocity..."      │   "Churn Signal"     │
│   23% of views       │   -18% vs. optimal   │   12.4% churn risk   │
│   [View Insight →]   │   [View Insight →]   │   [View Insight →]   │
│                      │                      │                      │
└──────────────────────┴──────────────────────┴──────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ FOOTER / SECONDARY ACTIONS                                          │
│ [📁 View archived insights →] · [⚙️ Settings] · [? Help]          │
└────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Component Specifications

### **Recommendation Card**

```
┌──────────────────────────────────────────────────┐
│ [Icon] [HIGH PRIORITY]        [← → Dismiss]     │ ← Header
├──────────────────────────────────────────────────┤
│                                                  │
│ Card Title (20px, semibold)                     │
│ 23% of views                                     │ ← Headline metric
│                                                  │
│ Diagnosis text (14px, regular)                  │ ← One-line explainer
│ "Your 'Supporter' tier has 8 members but no     │
│  exclusive content in 4 months."                │
│                                                  │
│ [View Insight →]                                │ ← Primary action
│                                                  │
└──────────────────────────────────────────────────┘
```

**Anatomy:**
- **Icon** (32px, 1-color): Visual signal (⚠️ warning, 📈 growth, 👥 members)
- **Priority Badge** (12px, ALL-CAPS, color-coded): HIGH / MEDIUM / LOW
- **Dismiss** (discrete X, top-right): Mark card as seen/irrelevant
- **Title** (20px, --font-display): 3–4 words max
- **Headline Metric** (28px, bold, accent color): The number that matters (23%, ↓18%, 12.4%, etc)
- **Diagnosis** (14px, line-height 1.5): Single sentence. No jargon.
- **Primary Action** (button, secondary style): "View Insight" or action verb ("Create Post", "Review Members")

**Colors:**
- **High Priority** (⚠️ Dead Tier): Orange (#F97316) + light orange bg (#FEF3C7)
- **Medium Priority** (📈 Velocity): Purple (#A855F7) + light purple bg (#F3E8FF)
- **Low Priority** (ℹ️ Info): Gray (#6B7280) + light gray bg (#F3F4F6)

**States:**
- **Default:** Clean, elevated slightly (shadow-sm)
- **Hover:** Shadow-md, slight lift (translate-y-[-2px])
- **Dismissed:** Opacity-50, strikethrough on title (move to archive)
- **Expanded (click):** Detail view overlay (see below)

---

### **Detail View (Drill-Through)**

When creator clicks "View Insight" on a card:

```
┌────────────────────────────────────────────────────────────────┐
│ OVERLAY / MODAL                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [← Back] Dead Tier Alert · [X Close]                          │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ KEY METRICS                                             │   │
│ ├─────────────────────────────────────────────────────────┤   │
│ │ Members: 8      │ Tenure: 4 months │ Posts: 0          │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ CONTEXT                                                         │
│ Your "Supporter" tier is at risk. While 8 members are paying, │
│ they're receiving zero tier-exclusive content. Without new     │
│ posts gated to this tier, expect 30–50% churn in 60 days.    │
│                                                                 │
│ MEMBER LIST (Sample 3–5)                                       │
│ ├─ @patron_1 (joined Mar 2024, 2 months tenure)              │
│ ├─ @patron_2 (joined Apr 2024, 1 month tenure)               │
│ └─ +6 more (see full list →)                                  │
│                                                                 │
│ RECOMMENDED ACTIONS                                             │
│ ✓ Schedule 2–3 exclusive posts for this tier in next 2 wks   │
│ ○ Merge this tier into "Supporter Plus"                       │
│ ○ Adjust tier price to increase perceived value               │
│ ○ Archive tier and offer reactivation incentive               │
│                                                                 │
│ [Create Post] [View All Members] [Dismiss] [Give Feedback]   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Breadcrumb navigation:** Back button to return to hub
- **Key metrics section:** Scannable 3-column layout of relevant data
- **Context paragraph:** Explain the "why" and urgency
- **Supporting data:** Member sample, charts (if applicable), historical trend
- **Action options:** 2–4 recommended next steps (checkbox list, creator chooses)
- **Primary action button:** Quick action (e.g., "Create Post") opens new modal/route
- **Feedback trigger:** "Give feedback" link for insight validation (post-pilot improvement)

---

### **Time Range & Filter Selector**

```
┌──────────────────────────────────────────────────────────────┐
│ [🔍 All Channels ▼] · [📅 May 12–May 18, 2024 ▼]           │
│                                                [⟲ Refresh]    │
└──────────────────────────────────────────────────────────────┘

Dropdown 1 (Creator/Tenant Filter):
  ✓ All Channels
  ○ Channel 1 (@handle)
  ○ Channel 2 (@handle)
  ○ [Add channel]

Dropdown 2 (Time Range):
  ○ Last 7 days
  ✓ Last 14 days (May 12–May 18)
  ○ Last 30 days
  ○ Last 90 days
  ○ Custom range [📅 ← →]
  ○ Last month (Apr 1–30)
  ○ Last quarter (Jan–Mar)

Refresh Button:
  [⟲] (spinning icon while loading; disabled during fetch)
```

**UX Notes:**
- **Time range** defaults to "Last 14 days" (balance between fresh data + stability)
- **Custom range** allows creator to pick exact dates (e.g., "after I posted the series finale")
- **Refresh** button is always visible; triggers fresh batch job (shows 2–5s loading state)
- **All Channels** is the default (if creator manages multiple); single-creator sees no filter

---

## Part 4: Micro-Interactions & Motion

### **Card Hover**

```
Duration: 200ms
Easing: ease-out
Effects:
  - Scale: 1.0 → 1.02 (subtle lift)
  - Shadow: shadow-sm → shadow-md (elevation increase)
  - Translate: none → translate-y-[-4px] (slight up movement)
  - Cursor: pointer
```

### **Card Click (Expand to Detail)**

```
Duration: 300ms
Easing: ease-out (spring-like)
Effects:
  - Overlay fades in (0 → 0.5 opacity over 300ms)
  - Modal slides up from bottom or scales in from center
  - Back button + close X appear
  - Body scroll locked (prevent page scroll behind modal)
```

### **Card Dismiss**

```
Duration: 300ms
Easing: ease-in
Effects:
  - Card slides left and fades out (opacity 1 → 0)
  - Confirmation toast appears: "Insight dismissed. View in archive."
  - If last card, show "No more insights—great job! Check back tomorrow."
  - Card removed from DOM after animation completes
  - Remaining cards reflow (no gap)
```

### **Loading State**

```
Initial Load (hub page):
  - Skeleton cards appear (gray placeholder bars)
  - Skeleton animates with gradient pulse (Tailwind: animate-pulse)
  - 1–2s typical load time
  - After load, cards fade in (0 → 1 opacity over 200ms)

Refresh Button:
  - Icon spins (rotate 360deg over 1s, repeat while loading)
  - Button disabled + opacity-60 until complete
  - Toast: "Updating insights..." (subtle bottom-left, auto-dismiss after 2s)
```

### **Empty State (No Insights)**

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│                 🎉 All Clear!                               │
│                                                               │
│  You're keeping your content and audience healthy.         │
│  Keep doing what you're doing.                             │
│                                                               │
│  Insights update daily. Check back tomorrow for new         │
│  recommendations.                                           │
│                                                               │
│  [View past insights] · [Help]                             │
│                                                               │
│  Last updated: 2 hours ago                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Duration:** Show after 3s of no insights being returned; not a loading state.

---

## Part 5: Responsive Behavior

### **Mobile (< 640px)**

```
┌────────────────────────────────────────┐
│ HEADER (Hamburger menu)                │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Insights Hub                           │
│ Welcome back!                          │
│                                        │
│ [All Channels] [Last 14d] [Refresh]   │
│ (Stacked vertically, each 100% width) │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ CARD 1 (1 card per row, full width)    │
│ [Icon] [HIGH]                          │
│ Dead Tier Alert                        │
│ 23% of views                           │
│ Your "Supporter" tier...               │
│ [View Insight →]                       │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ CARD 2                                 │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ CARD 3                                 │
└────────────────────────────────────────┘

(Detail view: full-screen modal with close X)
```

**Adaptations:**
- **Filters stack vertically** (each takes full width)
- **Cards are 100% width** (no side padding shrinkage; 16px horizontal margin)
- **Detail modal is full-screen** (no desktop-style modal; slides from bottom)
- **Action buttons are full-width** ("Create Post" spans card width)
- **Charts (if any) scale to container** (no horizontal scroll)

### **Tablet (640–1024px)**

```
2 cards per row; filters side-by-side
Detail modal is 90% viewport width, centered
Otherwise same as desktop
```

### **Desktop (> 1024px)**

```
3 cards per row max (see above)
Detail modal is 600–700px wide, centered
Max-width constraint on hub (1200px) prevents excessive horizontal sprawl
```

---

## Part 6: Color Palette & Typography

### **Colors (Tailwind v3)**

| Use | Color | Token | Hex |
|-----|-------|-------|-----|
| **High Priority** | Orange | `#F97316` | Warning/alert |
| **High Priority BG** | Orange-100 | `#FEF3C7` | Soft background |
| **Medium Priority** | Purple | `#A855F7` | Secondary signal |
| **Medium Priority BG** | Purple-100 | `#F3E8FF` | Soft background |
| **Low Priority** | Gray | `#6B7280` | Tertiary signal |
| **Low Priority BG** | Gray-100 | `#F3F4F6` | Soft background |
| **Text Primary** | Gray-900 | `#111827` | Body text (dark) |
| **Text Secondary** | Gray-600 | `#4B5563` | Dimmed text |
| **Background** | White / Gray-50 | `#FFFFFF` / `#F9FAFB` | Page background |
| **Border** | Gray-200 | `#E5E7EB` | Dividers, subtle borders |
| **Accent (Action)** | Orange | `#F97316` | Links, buttons |

### **Typography**

| Use | Font | Size | Weight | Line Height |
|-----|------|------|--------|-------------|
| **Page Title** ("Insights Hub") | Fraunces | 48px | 600 (semibold) | 1.2 |
| **Subtitle** ("AI-powered insights...") | DM Sans | 16px | 400 (regular) | 1.6 |
| **Card Title** | DM Sans | 20px | 600 (semibold) | 1.3 |
| **Headline Metric** | DM Sans | 28px | 700 (bold) | 1.2 |
| **Body Text** (diagnosis) | DM Sans | 14px | 400 (regular) | 1.5 |
| **Small Text** (timestamps, breadcrumbs) | DM Sans | 12px | 400 (regular) | 1.4 |
| **Button Text** | DM Sans | 14px | 600 (semibold) | 1.4 |
| **Badge** | DM Sans | 11px | 700 (bold) | 1.2 |

**Font Variables (CSS):**
```css
:root {
  --font-display: "Fraunces", serif; /* Page titles, hero text */
  --font-body: "DM Sans", sans-serif; /* Everything else */
}
```

---

## Part 7: Component States & Variations

### **Card Priority Levels**

| Priority | Icon | Badge | Color | Background | Use Case |
|----------|------|-------|-------|------------|----------|
| **HIGH** | ⚠️ Warning | HIGH PRIORITY | Orange-600 | Orange-50 | Dead tier, immediate churn, lost revenue |
| **MEDIUM** | 📈 Chart/Trend | MEDIUM PRIORITY | Purple-600 | Purple-50 | Velocity mismatch, engagement decay, growth plateau |
| **LOW** | ℹ️ Info | INFO | Gray-600 | Gray-50 | Themes, seasonal trends, archive suggestions |

### **Action Button Variants**

| Variant | Style | Use | Example |
|---------|-------|-----|---------|
| **Primary** | Orange bg, white text, full-width | Main action per card | "View Insight", "Create Post" |
| **Secondary** | Gray border, gray text | Alternative action | "Dismiss", "Give Feedback" |
| **Tertiary** | Text only, no bg | Low priority | "View archived insights" |
| **Disabled** | Gray-300 bg, opacity-50 | Loading, permission denied | (refresh button during fetch) |

---

## Part 8: Data Density & Whitespace Budget

### **Rule: 40% Content, 60% Whitespace**

| Element | Whitespace |
|---------|------------|
| **Card padding** | 24px (top/bottom), 24px (left/right) |
| **Between cards** | 24px gap (grid-gap: 1.5rem / 24px) |
| **Card max-width** | 360px (per card, so 3 cards fits 1200px desktop easily) |
| **Hub max-width** | 1200px (prevents horizontal sprawl) |
| **Section padding** | 40px top, 40px bottom (sections have vertical breathing room) |
| **Modal padding** | 32px (internal padding) |

**Visual Densities:**
- **Hub View:** 3 cards, max 2–3 lines of text per card → ~200 words total visible
- **Detail View:** Rich detail allowed (charts, tables, full context) → ~500–800 words
- **Mobile:** 1 card full-width → same visual density as desktop (feels less cramped on small screen)

---

## Part 9: Error & Edge Cases

### **Card State Variations**

1. **Normal** (data loaded, confidence high)
   ```
   ✓ Show as designed
   ```

2. **Low Confidence** (< 0.6)
   ```
   ⚠️ Add badge overlay: "ESTIMATED"
   Add subtitle: "Based on partial data. Results may vary."
   ```

3. **Early Data** (creator age < 3 months)
   ```
   🔵 Soften card appearance (opacity-75)
   Add tooltip: "More data arrives as you grow. Check back next week."
   ```

4. **Dismissed** (creator clicked X)
   ```
   → Card animates out, moves to archive
   Toast: "Insight dismissed. View in archive."
   ```

5. **Expired** (data older than 24h)
   ```
   ℹ️ Add subtle banner: "Last updated 26 hours ago. [Refresh]"
   ```

6. **Error** (query failed, Patreon API down)
   ```
   ❌ Replace card with error state:
      "Unable to load this insight. [Retry] [Help]"
      (Retry button triggers single card refresh)
   ```

### **Empty States**

1. **No Insights Today**
   ```
   🎉 "All Clear! You're keeping things healthy. Check back tomorrow."
   ```

2. **Creator Too New** (< 24h old)
   ```
   🌱 "Your account is brand new! Insights arrive after 24 hours of activity."
   ```

3. **No Events This Period**
   ```
   📊 "No activity in this time range. Try a longer period?"
   [Last 30 days] [Last 90 days]
   ```

---

## Part 10: Implementation Checklist

### **Component Library**

- [ ] **Card** component (recommendations + detail states)
- [ ] **Badge** component (priority levels + custom icons)
- [ ] **Modal** component (detail view + full-screen mobile)
- [ ] **Button** component (primary, secondary, tertiary, disabled)
- [ ] **Skeleton** component (animated pulse loading)
- [ ] **Toast** component (dismiss confirmation, loading, errors)
- [ ] **Filter Bar** component (multi-select dropdowns + refresh)
- [ ] **Empty State** component (illustrations + CTA)
- [ ] **Loading Spinner** component (refresh + initial load)

### **Routes**

- [ ] `GET /creator/insights` → Dashboard hub (3–5 cards)
- [ ] `POST /creator/insights/{id}/dismiss` → Mark card dismissed
- [ ] `GET /creator/insights/{id}` → Detail view (modal data)
- [ ] `GET /creator/insights/archive` → Historical cards
- [ ] `GET /creator/insights/health?since=7d` → Overall health check

### **Styles & Tokens**

- [ ] Tailwind config updated (custom colors if needed)
- [ ] CSS custom properties for font families (--font-display, --font-body)
- [ ] Spacing scale (8px base, multiples: 8, 16, 24, 32, 40, 48, 56, 64)
- [ ] Shadow scale (shadow-sm, shadow-md, shadow-lg for elevation)
- [ ] Border radius scale (rounded-md, rounded-lg for cards)
- [ ] Animation utilities (fade-in, slide-up, spin for refresh)

### **Accessibility**

- [ ] Card buttons have focus-visible outlines
- [ ] Color not sole indicator (icons + text labels for priority)
- [ ] Modals have focus trap + escape key closes
- [ ] Touch targets ≥ 44px (iOS minimum)
- [ ] ARIA labels on icon-only buttons
- [ ] Semantic HTML (heading hierarchy, buttons vs links)
- [ ] Reduced motion respected (prefers-reduced-motion media query)

### **Performance**

- [ ] Cards render via server-side generation (minimal hydration JS)
- [ ] Detail modal lazy-loads data (not in initial hub response)
- [ ] Images optimized (icons as inline SVG, no unnecessary raster assets)
- [ ] Skeleton loading < 100ms to first visual (DOM ready)
- [ ] Full page load < 2s p95 (LCP target: 1.2s)

---

## Part 11: Dark Mode (Optional Future)

If implementing dark mode:

```css
@media (prefers-color-scheme: dark) {
  --text-primary: #F3F4F6; /* Gray-50 */
  --text-secondary: #9CA3AF; /* Gray-400 */
  --background: #111827; /* Gray-900 */
  --card-background: #1F2937; /* Gray-800 */
  --border: #374151; /* Gray-700 */
}
```

**Colors adapt:**
- High Priority: Keep orange (provides contrast in dark mode)
- Background: Dark gray instead of white
- Text: Light gray instead of dark gray
- Card: Slightly lighter gray (to pop off dark background)

---

## Part 12: Example Component Code (Tailwind)

### **Recommendation Card**

```tsx
export function RecommendationCard({
  priority,
  icon,
  title,
  metric,
  diagnosis,
  action,
  onView,
  onDismiss
}) {
  const bgColor = {
    high: "bg-orange-50",
    medium: "bg-purple-50",
    low: "bg-gray-50"
  }[priority];

  const accentColor = {
    high: "text-orange-600",
    medium: "text-purple-600",
    low: "text-gray-600"
  }[priority];

  const badgeText = {
    high: "HIGH PRIORITY",
    medium: "MEDIUM PRIORITY",
    low: "INFO"
  }[priority];

  return (
    <div className={`${bgColor} rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`text-2xl`}>{icon}</div>
          <span className={`text-xs font-bold uppercase ${accentColor}`}>{badgeText}</span>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {/* Content */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <div className={`text-3xl font-bold ${accentColor} mb-4`}>{metric}</div>
      <p className="text-sm text-gray-600 mb-6 leading-relaxed">{diagnosis}</p>

      {/* Action */}
      <button
        onClick={onView}
        className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-2"
      >
        {action} →
      </button>
    </div>
  );
}
```

---

## Summary: Design Principles Recap

| Principle | Implementation | Benefit |
|-----------|---|---|
| **Progressive Disclosure** | Hub (3–5 cards) → Detail (full context) | Avoids overwhelm; supports exploration |
| **Scanning Speed** | Icon + metric + button in 8s | Creator acts immediately without cognitive load |
| **Minimalism** | 40% content, 60% whitespace | Elegant, calm, trustworthy feeling |
| **Hierarchy** | Title (20px) > Metric (28px) > Text (14px) | Visual order guides eye to actionable item |
| **Responsiveness** | 1 card mobile, 2–3 desktop | Feels natural on every device |
| **Micro-motion** | Smooth transitions (200–300ms) | Delightful without distraction |
| **Color Coding** | Orange (high), Purple (medium), Gray (low) | Instant priority recognition |
| **Accessible** | Focus outlines, ARIA, semantic HTML | Works for all creators |

**North Star:** Creator opens dashboard, glances for 2 minutes, closes with clear next action. No confusion, no scroll, no density.
