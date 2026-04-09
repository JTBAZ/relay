# `docs/agents/` — managed swarm orientation

Reading order for **Smart Builder Swarm**, Claude Code, or other **managed agents** working against **Airtable + this repo**. Lower rows depend on higher rows.

| Order | Document | Purpose |
|-------|----------|---------|
| **1** | **[BUILD_BRIEF.md](BUILD_BRIEF.md)** | Single entry: product, `road map.md` vs Airtable vs `AGENTS.md`, commands, network limits. **Start here.** |
| **2** | **README.md** (this file) | Folder index and hierarchy. |
| **3** | **[SMART_BUILDER_SWARM.md](SMART_BUILDER_SWARM.md)** | Canonical **system prompt** + YAML fragment (terminology, verification, headless rules). |
| **4** | **[ChiefArchitect.md](ChiefArchitect.md)** | Orchestrator: **Production Ledger**, batching, session reports. |
| **5** | **[AIRTABLE_LEDGER.md](AIRTABLE_LEDGER.md)** | Base ID, table IDs, field names — queue is **Production Ledger**, not a generic “milestones” sheet. |
| **6** | **[FAIL_TO_HUMAN.md](FAIL_TO_HUMAN.md)** | Stop conditions (keys, OAuth, Patreon, v0, unreachable services). |
| **7** | **[PRODUCT_UX_NORTH_STAR.md](PRODUCT_UX_NORTH_STAR.md)** | Artist Relay vs Fan Relay intent. |
| **8** | **Role profiles** (by assignment) | [FrontEndDeveloper.md](FrontEndDeveloper.md), [BackEndDeveloper.md](BackEndDeveloper.md), [DataOfficer.md](DataOfficer.md), [QAEngineer.md](QAEngineer.md), [DevOpsPlatform.md](DevOpsPlatform.md), [SecurityCompliance.md](SecurityCompliance.md) |
| **9** | **[../qa/UX_ACCEPTANCE_GUARDRAILS.md](../qa/UX_ACCEPTANCE_GUARDRAILS.md)** | Pass/fail UX expectations for critical routes. |

**Repo-wide anchors (outside this folder):** [`road map.md`](../../road%20map.md) (strategy), [`AGENTS.md`](../../AGENTS.md) (paths and commands), [`Automation/README.md`](../../Automation/README.md) (attended loop + `ledger-to-v0`).
