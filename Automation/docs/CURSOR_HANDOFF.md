# Cursor chat handoff — Rescue / Automation

Paste this into a **new** Cursor chat when you open the **Rescue** workspace (`Coding Projects/Rescue`), or `@`-mention this file.

## What this repo owns

- **`Automation/`** is the **only** place for Airtable + v0 + Cursor **attended** workflow: docs (`docs/`), session templates (`templates/`), and **`scripts/ledger-to-v0.mjs`** (reads **Production Ledger** → `v0.chats.create` → writes **`v0 Chat URL`** / preview back).
- **CRE** workspace path **`.../CRE/project-tracker-automation`** is **empty except a README** pointing here — do not recreate automation there.

## Airtable

- **Base:** Project tracker — `applW4dOjVNHoWBM9`
- **Ledger:** `tblDDAKjaaBBIBuPf` — **`Prompt Draft`**, **`Status`** (exact labels in `docs/LEDGER_SCHEMA.md`), **`Design page`** link, **`Queue Order`**, **`v0 Chat URL`**, etc.
- **Design Pages** table: `tbliRw7EDiZBOLL2z` (~22 screens); inventory links via **Primary design page**.
- **Secrets:** PAT + `V0_API_KEY` only in **`Automation/.env`** (or secret store), never in base cells.

## v0 bridge

- From repo root: `Set-Location Automation` → `npm install` → `npm run ledger-to-v0:dry` / `npm run ledger-to-v0`.
- Picks first row: **`LEDGER_STATUSES`** (default `Ready for v0`), non-empty **`Prompt Draft`**, blank **`v0 Chat URL`**, sorted by **`Queue Order`**.

## Product note

**CRE diligence roadmap** and **Relay UI** are not the same planning artifact; ordering is **thematic** / design-page driven. Prefer **`Automation/docs/`** over ad hoc assumptions.

## Persistent Cursor context

Project rules live in **`.cursor/rules/*.mdc`** (always-apply + `Automation/**` globs). No need to re-paste this entire block every time once those rules are committed and the Rescue folder is open.
