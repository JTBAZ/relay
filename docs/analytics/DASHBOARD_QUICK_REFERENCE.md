# Analytics Dashboard — Quick Design Reference

> **TL;DR:** Clean, minimal dashboard with 3–5 cards. Creator scans in <2 min and knows what to do. All detail available one click away.

---

## 🎯 Core Design Principle

**40% Content, 60% Whitespace**

Every pixel earns its place. Embrace empty space. Make creators feel calm, not overwhelmed.

---

## 📐 Layout Grid (Desktop)

```
Max-width: 1200px (centered)
Card width: 360px max
Cards per row: 3 (at desktop)
Gap between cards: 24px
Padding (hub): 40px top/bottom, 32px left/right
```

---

## 🎨 Color Code

| Use | Color | Token |
|-----|-------|-------|
| **High Priority** (Dead tier, churn) | Orange #F97316 | `text-orange-600` / `bg-orange-50` |
| **Medium Priority** (Velocity, decay) | Purple #A855F7 | `text-purple-600` / `bg-purple-50` |
| **Low Priority** (Info, seasonal) | Gray #6B7280 | `text-gray-600` / `bg-gray-50` |
| **Text primary** | Gray-900 #111827 | `text-gray-900` |
| **Text secondary** | Gray-600 #4B5563 | `text-gray-600` |
| **Background** | White / Gray-50 | `bg-white` / `bg-gray-50` |

---

## 🔤 Typography Stack

| Use | Font | Size | Weight |
|-----|------|------|--------|
| Page title | Fraunces | 48px | 600 |
| Card title | DM Sans | 20px | 600 |
| Headline metric | DM Sans | 28px | 700 |
| Body text | DM Sans | 14px | 400 |
| Small text | DM Sans | 12px | 400 |

---

## 📱 Responsive Breakpoints

| Device | Card Width | Cards/Row | Details |
|--------|-----------|----------|---------|
| **Mobile** < 640px | 100% - 32px margin | 1 | Full-width stack |
| **Tablet** 640–1024px | calc(50% - 16px) | 2 | 2-column grid |
| **Desktop** > 1024px | calc(33.333% - 24px) | 3 | 3-column grid, max-w-1200px |

---

## 🃏 Card Anatomy

```
┌─────────────────────────────────────┐
│ ⚠️ [HIGH PRIORITY]          [✕]    │  ← Header (icon, badge, dismiss)
│                                     │
│ Dead Tier Alert                     │  ← Title (20px, semibold)
│ 23% of views                        │  ← Headline metric (28px, bold, accent color)
│                                     │
│ Your "Supporter" tier has members   │  ← Diagnosis (14px, 1–2 lines)
│ but zero exclusive content in 4mo.  │
│                                     │
│ [View Insight →]                    │  ← Primary action (link button)
│                                     │
└─────────────────────────────────────┘
- Padding: 24px (all sides)
- Border-radius: 0.5rem (rounded-lg)
- Shadow: shadow-sm (default), shadow-md (hover)
- BG: bg-orange-50 (priority color)
- Border: border-gray-200
```

---

## 🎬 Micro-Interactions

| Action | Duration | Effect | Notes |
|--------|----------|--------|-------|
| **Card hover** | 200ms | Scale 1.02, translate-y[-4px], shadow-md | ease-out |
| **Card click** | 300ms | Overlay fade-in, modal slide-up | ease-out |
| **Card dismiss** | 300ms | Slide left, fade-out, reflow | ease-in |
| **Skeleton load** | 2s loop | Gradient pulse animation | Fade in real content after load |
| **Refresh spin** | 1s loop | Rotate 360deg | While loading |

---

## 📊 Information Density

| View | Content | Purpose |
|------|---------|---------|
| **Hub** | 3–5 cards, ~200 words visible | Glance at priority actions |
| **Detail** | Full context, charts, lists, ~800 words | Understand and explore |
| **Mobile** | 1 card/row, same density | Natural proportions on small screen |

---

## ✨ Progressive Disclosure

**Scan 1 (0–3s):** Icon + badge → "For me?" → Yes/no decision
**Scan 2 (3–6s):** Headline + metric → "What changed?" → Understand signal
**Scan 3 (6–8s):** Diagnosis → "Why now?" → Context
**Action (8–15s):** Button → "What do I do?" → Click to explore

---

## 🛠️ Priority Badge Variants

```
HIGH PRIORITY
┌─────────────────┐
│ HIGH PRIORITY   │ (orange-600 bg, white text, all-caps, 11px)
└─────────────────┘

MEDIUM PRIORITY
┌─────────────────┐
│ MEDIUM PRIORITY │ (purple-600 bg, white text, all-caps, 11px)
└─────────────────┘

INFO
┌─────────────────┐
│ INFO            │ (gray-600 bg, white text, all-caps, 11px)
└─────────────────┘

ESTIMATED (Low confidence)
┌─────────────────┐
│ ESTIMATED       │ (yellow-100 bg, yellow-800 text, all-caps, 11px)
└─────────────────┘
```

---

## 🔘 Button Styles

### Primary Button
```
Text: "View Insight" or action verb
Style: text-orange-600, hover:text-orange-700, underline on hover
Size: 14px, semibold
Icon: → arrow after text
```

### Secondary Button
```
Text: "Dismiss", "Give Feedback"
Style: text-gray-600, gray border, hover:bg-gray-50
Size: 14px, regular
```

### Full-Width Action (Mobile Detail)
```
Text: "Create Post", "Review Members"
Style: bg-orange-600, text-white, full width
Size: 14px, semibold
Height: 40px (touch-friendly)
```

---

## 📋 Filter Bar Layout

```
┌──────────────────────────────────────────────┐
│ 🔍 [All Channels ▼] · 📅 [May 12–18 ▼]      │
│                                    [⟲ Refresh] │
└──────────────────────────────────────────────┘

Spacing: Filter buttons left, Refresh right
Gap: 12px between filters
Refresh button: Icon-only, top-right corner
```

---

## 🚨 Empty States

### All Clear
```
🎉 All Clear!
You're keeping things healthy. Check back tomorrow.
[View past insights] · [Help]
Last updated: 2 hours ago
```

### No Events
```
📊 No activity in this time range.
Try a longer period: [Last 30d] [Last 90d]
```

### Creator Too New
```
🌱 Your account is brand new!
Insights arrive after 24 hours of activity.
```

---

## 🎪 Modal / Detail View Structure

```
Mobile (full-screen overlay):
[← Back] Title [X]                          ← Sticky header

KEY METRICS
[3-col grid: stat1 | stat2 | stat3]

CONTEXT
[Rich paragraph, 16px line-height]

AFFECTED MEMBERS
[Sample 3–5 with metadata, +N more link]

RECOMMENDED ACTIONS
[Checkbox list with descriptions]

SUPPORTING DATA
[Chart or table, optional]

[Primary Action Button]
[Secondary Actions]
```

**Desktop (600–700px centered):**
Same layout, centered modal, no sticky header

---

## 🎯 Card Priority Assignment

| Priority | Triggers | Actions |
|----------|----------|---------|
| **HIGH** | Dead tier, high churn risk, revenue loss imminent | Schedule posts, merge tier, archive |
| **MEDIUM** | Velocity mismatch, engagement decay, plateau | Audit strategy, run campaign, refresh |
| **LOW** | Info, seasonal trends, archived data | Review, optional action |

---

## 📲 Mobile Adaptations

| Desktop | Mobile |
|---------|--------|
| 3-column grid | 1-column stack |
| 360px card width | 100% - 32px margin |
| Inline detail (hover) | Full-screen modal (click) |
| Sidebar filters | Stacked filters |
| Inline member list | "See all" link → separate view |

---

## 🎨 Design Files & Assets

- **Typography:** Fraunces (display) + DM Sans (body) from Google Fonts
- **Icons:** 1-color, 24–32px, SVG preferred (inline)
- **Colors:** Tailwind v3 defaults (orange-600, purple-600, etc.)
- **Shadows:** Tailwind shadow scale (sm, md, lg)
- **Spacing:** 8px base unit (Tailwind default)

---

## ♿ Accessibility Checklist

- [ ] Focus visible outlines on all interactive elements
- [ ] Color not sole indicator (icons + text for priority)
- [ ] ARIA labels on icon-only buttons
- [ ] Modal focus trap + Escape key closes
- [ ] Semantic HTML (button, link, heading hierarchy)
- [ ] Touch targets ≥ 44px
- [ ] Text contrast ≥ 4.5:1 (WCAG AA)
- [ ] Respects prefers-reduced-motion
- [ ] Keyboard navigation works (Tab, Enter, Escape)

---

## 🚀 Implementation Order

**Week 1–2:**
- Hero section + filter bar
- Recommendation card (default state)
- Skeleton loading
- Empty state

**Week 3–4:**
- Detail view modal
- All card states (hover, error, dismissed)
- Toast notifications
- Responsive mobile

**Week 5+:**
- Supporting data (charts, member lists)
- Dark mode (optional)
- Advanced interactions (sorting, archiving)
- Performance optimization

---

## 📸 Visual Reference

See: `docs/analytics/analytics-dashboard-mockup.png` for example layout

---

## 💡 Design Anti-Patterns to Avoid

❌ More than 5 cards on hub (overwhelm)
❌ Tables, raw data, or dense numbers on card (scan-breaking)
❌ Multiple call-to-action buttons per card (confusion)
❌ Animations > 300ms (feels sluggish)
❌ Pop-up notifications that don't auto-dismiss (intrusive)
❌ Missing dismiss option (user frustration)
❌ Detail view without back button (trap feeling)
❌ Font weights > 2 on page (visual noise)
❌ Cards without priority signal (how to prioritize?)
❌ Horizontal scroll on mobile (expected to stack)

---

## ✅ Design Wins to Celebrate

✅ 40% content, 60% whitespace (calm, spacious)
✅ < 2 min scan time (respects creator time)
✅ One action per card (clarity)
✅ Progressive disclosure (hub → detail)
✅ Color + icon + text priority signal (accessible)
✅ Smooth transitions (polished feel)
✅ Mobile-first responsive (works everywhere)
✅ Minimal dismiss (creator control)
✅ Detail without leaving app (seamless exploration)
✅ Empty state feels rewarding ("All Clear!" not "No data")

---

## 📞 Questions & Notes

**Q: Why 3 cards per row, not 4?**
A: 4 cards @ desktop width = 300px each (too cramped). 3 cards @ 360px + 24px gap = comfortable, scannable.

**Q: Why progressive disclosure (hub + detail)?**
A: Hub keeps focus; detail satisfies curiosity. Creator chooses depth, not overwhelmed by default.

**Q: Can we show more insights?**
A: Not on hub. Archive provides access to dismissed/old insights without cluttering main view.

**Q: Dark mode?**
A: Post-pilot. Orange carries well in dark mode; adapt grays to dark gray-900/800.

**Q: Why disable secondary actions in card?**
A: Reduces decision fatigue. One button ("View Insight") leads to full context + choices in modal.

---

**Design North Star:** Creator opens dashboard, glances for 2 minutes, closes with clear next action. No confusion. No overwhelm. No scroll. 🎯
