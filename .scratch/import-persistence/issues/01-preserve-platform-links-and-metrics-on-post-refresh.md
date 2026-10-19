# 01: Preserve platform links and metrics on post refresh

**What to build:** Refreshing an imported post keeps the creator's confirmed platform links and their metric history attached to that post.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** Import persistence audit, finding 1. Saving a fresh post revision deletes and recreates the parent post. Cascading deletion removes platform instances and external metric snapshots, even though presentation overrides and creative-work membership are restored.

**Scope:** Update an existing imported post in place and synchronize its imported revision history and tier links. Preserve existing provider, creator, status, campaign, presentation, and creative-work behavior. No schema migration, general relationship-copying framework, or unrelated persistence redesign.

- [ ] A creator-confirmed X link on an imported Patreon post survives a fresh provider revision with its identity and provenance intact.
- [ ] Existing external metric snapshots remain attached to the same post and platform instance after refresh; inferred provider links do not replace confirmed links.
- [ ] Imported post fields, version history, and tier access reflect the accepted revision without deleting the existing parent post.
- [ ] Presentation overrides, creative-work membership, creator boundaries, provider lanes, and Relay-native posts retain their existing behavior.
- [ ] Focused persistence regressions seed a confirmed platform link and metric history, apply a fresh revision, reload, and verify both survive. Replaying that revision adds no duplicate rows or history.
- [ ] Run the affected persistence and presentation checks plus scoped Ponytail Review before completion. Preserve unrelated working-tree changes.
