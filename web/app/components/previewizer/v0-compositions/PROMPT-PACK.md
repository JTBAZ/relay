# v0 Prompt Pack — 6 copy-pastes

Each prompt produces **one React component** that fills its parent (`width: 100%`, `height: 100%`).  
**Overlay only** — no background photo. All visible text must be **props with defaults**.  
Use inline styles or Tailwind. Inline SVG for Patreon logo. Save each file to `v0-compositions/<folder>/`.

---

## 1. Mystery Crop

```
Build a React component MysteryCropOverlay (TypeScript, default export).

Square 1:1 overlay. Left ~45%: dark scrim fading to transparent rightward, orange horizontal speed streaks. Left-aligned 3-line headline in bold italic sans (Bebas Neue style): line1 and line2 white, line3 orange and largest. Bottom-left: Patreon logo + small URL in white caps.

Props with defaults: line1="FULL", line2="IMAGE", line3="INSIDE", platformUrl="PATREON.COM/YOU"

Root div 100%×100%, position relative, container-type size. Scale text with cqh. Right side stays transparent.
```

---

## 2. Cinematic Eyes

```
Build a React component CinematicEyesOverlay (TypeScript, default export).

Square 1:1 overlay. Top ~68% fully transparent. Bottom ~32% solid black bar. Centered in bar: Patreon logo (coral), serif headline in white title case, coral URL below in sans.

Props with defaults: headline="See the Full Image", platformUrl="Patreon.com/you"

Root div 100%×100%, container-type size. Scale text with cqh.
```

---

## 3. Frosted Glass Card

```
Build a React component GlassCardOverlay (TypeScript, default export).

Portrait 4:5 overlay. Center a frosted glass card (~58% wide, ~72% tall, rounded corners, backdrop-blur, white border). Top: Patreon wordmark. Bottom: white label text + pill button with purple-to-teal gradient and white CTA text.

Props with defaults: label="Premium Content", cta="SEE FULL ART"

Root div 100%×100%, transparent outside the card, container-type size. Scale with cqh.
```

---

## 4. Bottom Blur Paywall (do this one first)

```
Build a React component BottomPaywallOverlay (TypeScript, default export).

Portrait 4:5 overlay. Transparent background. Centered stack in lower half (~60% from top): Patreon icon, "PATREON" in small white caps, large white headline, optional smaller body line (hide if empty), purple-to-teal gradient pill button with white CTA.

Props with defaults: headline="Full access!", body="", cta="SEE FULL ART"

Root div 100%×100%, container-type size. Scale with cqh. No background box behind the stack.
```

---

## 5. Collage Windows

```
Build a React component CollageWindowsOverlay (TypeScript, default export).

Portrait 4:5 overlay. Navy blue gradient full background. Five transparent tilted rectangular cutouts (art shows through) in a collage layout — 2 on top row, 1 tall left, 2 stacked right. Top center: Patreon wordmark. Bottom left: small Patreon icon. Bottom right: gradient pill button + small star sparkle above it.

Props with defaults: cta="SEE FULL ART"

Use SVG mask or clip-path for transparent windows. Root 100%×100%.
```

---

## 6. Creator Glass Bar

```
Build a React component CreatorGlassBarOverlay (TypeScript, default export).

Portrait 4:5 overlay. Top transparent. Bottom glass bar (~26% height, frosted dark blur, rounded, white border). Left: small eyebrow caps, large creator name with gold vertical accent bar, feature line with bullets, blue pill button + URL text. Right: QR placeholder grid + "SCAN TO JOIN" label.

Props with defaults: eyebrow="EXCLUSIVE CONTENT BY", creatorName="YOUR NAME", features="High-resolution • Uncensored • Early Access", platformUrl="PATREON.COM/YOU", qrLabel="SCAN TO JOIN", cta="SEE FULL ART"

Root div 100%×100%, container-type size. Scale with cqh.
```

