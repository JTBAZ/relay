# Cursor agent — attended ledger session (paste into chat)

You are running an **attended** build cycle against Airtable **Project tracker**.

## Rules

1. Use Airtable MCP on base `applW4dOjVNHoWBM9`.
2. Work on **at most one** `Production Ledger` row per session unless I say otherwise.
3. Respect **`Session Lock`**: if another row is locked, don’t take it.

## Steps

1. **Find next work**  
   `list_records` on table `tblDDAKjaaBBIBuPf` (`Production Ledger`) with `filterByFormula` equivalent to **Status = "Queued"** and **Session Lock** empty/false.  
   Sort mentally by **Queue Order** ASC, **Effective Complexity** DESC (or follow my override).

2. **Claim**  
   `update_records`: set **Session Lock** = true, **Status** = `Prompt Drafting`, **Last Step Actor** = `Cursor Agent`.

3. **Load linked context**  
   For that row’s linked **UI Element** (`tbluISu3XCKl3Berv`) and **Vertical Slice** (`tbleD4y1ZbiaCDQ2V`), `get_record` or `list_records` as needed.  
   Pull relevant **Global Parameters** (`tblapjC9tNanrUCqG`) — snapshot into **Global Params Snapshot** if useful for humans or manual v0 runs. (`npm run ledger-to-v0` auto-appends **`RELAY_VISUAL_SYSTEM_V1`** / **`RELAY_COLOR_TOKEN_REF`** keys by default—see **Automation README**.)

4. **Write Prompt Draft**  
   Fill the structure from `project-tracker-automation/templates/v0-prompt-starter.md` into **Prompt Draft** (include the **v0 preview (Strategy A)** section so the hosted preview does not require new `NEXT_PUBLIC_*` env vars).  
   Set **Prompt Ready At** = now, **Status** = `Ready for v0`.

5. **STOP and wait for human**  
   Tell me: “Open v0 and paste **Prompt Draft**.” I will return **v0 Chat URL**, **v0 Preview URL**, and **v0 Copy Block**.

6. **After I paste v0 outputs**  
   `update_records`: save URLs + copy block; **Status** = `v0 Complete - Awaiting Integration`; **v0 Completed At** = now.

7. **Integrate**  
   Set **Status** = `Integrating`. Apply code to this repo per **v0 Copy Block** and project conventions. Run checks.  
   - Success: **Status** = `Integrated - Local OK`, **Integration Completed At** = now, **Integrator Notes**, **Cursor Branch** (and **Cursor PR URL** if applicable), clear **Session Lock**.  
   - Failure: **Status** = `Failed`, **Error Log** with commands + output, increment **Attempt Count**, clear **Session Lock**.

Report a one-paragraph handoff summary at the end.
