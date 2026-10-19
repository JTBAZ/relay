# Domain docs

## Layout

Use one shared domain context: `GLOSSARY.md` at the repository root and `docs/adr/` for architectural decision records. Existing product contracts and program-specific documents remain authoritative for their scope.

## Before exploring

- Read root `GLOSSARY.md` if it exists.
- If a root `GLOSSARY-MAP.md` is introduced later, follow its links and read the glossaries relevant to the task.
- Read existing ADRs in `docs/adr/` that apply to the area being changed, plus any relevant context-specific ADRs identified by the glossary map.
- Read the product contracts and program instructions identified by `AGENTS.md` for the task. Apply its current execution policy: Airtable queues are legacy and Escape Hatch remains deferred.

If glossary or ADR files do not exist, proceed silently. Do not create empty placeholders or request their creation as a prerequisite. `domain-modeling`, including through `grill-with-docs`, creates them lazily when terms or meaningful decisions are resolved.

## Use agreed vocabulary

Use glossary terms in specs, tickets, tests, reviews, and code discussions. Respect terms already established in Relay's product contracts. Resolve conflicting or overloaded terms with the user before changing the glossary. Keep implementation details out of the glossary.

Record an ADR only for a real trade-off whose reversal is costly and whose rationale would otherwise surprise a future reader. If proposed work conflicts with an existing ADR, identify the conflict and discuss reopening the decision rather than silently overriding it.
