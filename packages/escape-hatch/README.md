# Escape Hatch

CLI test bed that turns a Patreon-shaped JSON bundle into a **viewable subscription gallery folder** (mini-Relay copy) with theme tokens, **server entitlement checks**, and **private media delivery** (default layout).

> **Not production-ready (`productionSafe: false`).** Soft personas are demo UI only when identity is unset. Default fill stages premium bytes under `data/private-media` and serves them via `/api/media/{id}` after `evaluateAccess` — not world-readable `public/media`. `ESCAPE_HATCH_MEDIA_MODE=public_legacy` / `mediaLayout: public_legacy` is hard-blocked (EH-082). Live provider proofs, Milestone 3 security/browser gate, and human acceptance remain open — do not treat a generated kit as a deployable paywall without those gates.

## Product status and construction program

This package is the **prototype engine**, not the finished creator product. The production target is a Relay Studio wizard that generates and deploys a creator-owned Next.js membership application with hard entitlement checks, private R2 media, creator-owned accounts/billing/infrastructure, an operating admin, and an ownership packet.

The authoritative product, UX, security, testing, agent, and build contracts are in:

- [`docs/studio/escape-hatch-build-plans/00-README.md`](../../docs/studio/escape-hatch-build-plans/00-README.md)
- [`docs/studio/escape-hatch-build-plans/11-BUILD-BATTING-ORDER.md`](../../docs/studio/escape-hatch-build-plans/11-BUILD-BATTING-ORDER.md)

Do not infer production readiness from this CLI's generated zip or passing package tests.

## Pipeline

```text
Patreon API + media extract (Relay)
        ↓
  Canonical / CloneSiteModel JSON
        ↓
  SiteBundle (+ theme wizard)
        ↓
  Template fill → packages/escape-hatch/.out/<slug>/
        ↓
  npm run dev  →  local Hatch Console + visitor preview
```

## Quick start (fixture)

From the **repo root**:

```bash
npm install --prefix packages/escape-hatch
npm run escape-hatch:fixture
cd packages/escape-hatch/.out/elena-adler
npm install
npm run dev
```

Open the URL Next prints (port **3001**). You land on **Structure** (tier/post map). Use console tabs: Structure → Style → Preview.

> See **[IA.md](./IA.md)** for the current prototype hierarchy and field bindings. Production wizard/admin IA is defined by the construction program.

> **Windows / npm note:** prefer **positional** CLI args. npm often strips `--bundle`-style flags on Windows.

## Commands

| Script | What it does |
|--------|----------------|
| `npm run escape-hatch:fixture` | Build site kit from `fixtures/sample.bundle.json` |
| `npm run escape-hatch:wizard` | Interactive theme prompts, then fill |
| `npm run escape-hatch:build -- fixtures/sample.bundle.json [theme.json] [slug]` | Rebuild (uses `.out/.themes/<slug>.json` when theme omitted) |
| `npm run escape-hatch:from-relay -- <creator_id>` | Load `.relay-data` via `generateCloneSiteModel` (**requires** repo `npm run build`) |
| `npm run escape-hatch:zip -- <slug>` | Zip `.out/<slug>` Export Kit |

Inside the package:

```bash
cd packages/escape-hatch
npm run fixture
npm run wizard
npm run build-site -- fixtures/sample.bundle.json .out/.themes/elena-adler.json elena-adler
npx tsx src/cli.ts from-relay cr_your_id
npx tsx src/cli.ts from-clone fixtures/clone-site.json clone-demo
npm run zip -- elena-adler
npm test
```

## Wizard → rebuild

1. `npm run escape-hatch:wizard` — answers saved to `.out/.themes/<slug>.json`
2. `npm run escape-hatch:build -- packages/escape-hatch/fixtures/sample.bundle.json` — with cwd in package, or pass theme path as 2nd positional

Theme fields mirror Designer tokens: `color_scheme`, `accent_color`, hero copy, plus `paywall_style` (`blur` | `hard` | `teaser`).

## Export Kit zip

```bash
npm run escape-hatch:fixture
npm run escape-hatch:zip -- elena-adler
```

Produces `packages/escape-hatch/.out/elena-adler-export-kit.zip`.

## Layout

```text
packages/escape-hatch/
  fixtures/           sample bundle + SVG media
  src/                CLI, fill-template, from-clone, from-relay, wizard
  template/           Next.js shell (copied into .out)
  .out/<slug>/        generated site kit (gitignored)
```

## Soft-persona vs private media (honesty)

Persona switching is a **local demo** when identity provider is `none` — not production authorization and never elevates under Path A/B. Premium originals default to `data/private-media` with delivery through `/api/media` after server entitlement evaluation. Free/public assets may remain under `public/media`. `public_legacy` is refused at fill time and blocked for premium delivery. Kits remain **`productionSafe: false`** until live-provider and human gates close.
