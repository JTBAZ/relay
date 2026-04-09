# Fail-to-human — stop conditions for managed agents (swarm)

**Purpose:** Prevent wasted model/API **credits** on work that **cannot** be completed without a **human** (owner, operator, or counsel). When a condition below applies, **stop**, document the blocker, update **Airtable** (**Production Ledger** → **`Blocked`** or **`Error Log`** / **Integrator Notes**), and **do not** loop blindly.

**Related:** `AGENTS.md`, `docs/agents/AIRTABLE_LEDGER.md`, `.cursor/rules/airtable-execution-control-plane.mdc`.

---

## 1. Always fail-to-human (operator / owner)

| Situation | Why |
|-----------|-----|
| **New API keys or secrets** | Patreon OAuth client secrets, webhook signing secrets, production DB URLs, any third-party tokens — require vault/UI access the agent does not have. |
| **New external accounts** | Patreon developer app registration, OAuth redirect URI changes, new Airtable bases — human-owned. |
| **First-time production verification** | Live Patreon webhook delivery, production deploy health — owner confirms. |
| **DNS / TLS / hosting** | Pointing domains, certificates, Coolify or host configuration — operator runbooks. |
| **Legal / compliance sign-off** | Terms, cookie policy, platform obligations — not automatable. |

**Agent behavior:** Implement or verify **repo** code and tests only; open a **short checklist** for the owner for keys and clicks; **do not** fabricate secrets.

---

## 2. Often fail-to-human (needs existing credentials)

| Situation | Why |
|-----------|-----|
| **Live Patreon API proof** | Needs valid tokens and registered redirect URIs. |
| **v0 bridge** | **`ledger-to-v0`** requires **`V0_API_KEY`** and Airtable PAT — see **`Automation/README.md`**. |
| **Cross-user entitlement checks** | May need seeded accounts or owner-run DB state. |

**Agent behavior:** Run **Vitest** and documented paths; for live API proofs, request **explicit** owner confirmation or mark the ledger row **Blocked** with **`Error Log`** detail.

---

## 3. Retry limits (avoid credit burn)

| Pattern | Rule |
|---------|------|
| Same **4xx/5xx** from Patreon after config check | Stop; assume credentials, allowlist, or app registration — **fail-to-human**. |
| **OAuth redirect mismatch** | `redirect_uri` must match provider console — human fixes. |
| **Flaky tests** | After two focused fixes, stop and hand to human with repro — avoid dozens of blind retries. |

---

## 4. What agents *can* do without humans

- Edit **repo** code, tests, and internal docs that do not claim legal authority.
- Run **`npm run test`**, **`npm run build`** at repo root; **`npm run lint`**, **`npm run build`** in **`web/`** when the task touches the web app.
- Query **Airtable** MCP for **Production Ledger** state when the user’s environment provides MCP access.

---

## 5. Headless / network (E2E and local URL)

| Situation | Action |
|-----------|--------|
| **No E2E script** in default package | Do not invent Playwright runs; document **“E2E not configured in repo default scripts”** if a task asked for browser proof. |
| **No reachable app URL** | Do not assume **`localhost`** or preview URLs from a locked-down agent container. |
| **Outbound HTTP blocked** | Document **“Proof skipped — network policy”** in the session report. |

If E2E is added later, align skip rules with **`QAEngineer.md`** and re-read this section.

---

## 6. Session report line

When stopping for fail-to-human, include in the swarm report:

- **Ledger:** **Work Title**(s) or record id(s) affected.
- **Blocker category** (from sections above).
- **Tests run:** pass/fail for **`npm run test`** / **`npm run build`** (and **`web/`** lint/build if relevant).
- **Next step for owner** (one short bullet).
