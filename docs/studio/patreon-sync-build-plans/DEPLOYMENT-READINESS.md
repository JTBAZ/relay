# Deployment and isolated acceptance

Status: isolated staging HTTPS smoke passed at 14:59:38 UTC, 2026-10-21. Separate DB/R2/Redis targets, real backend/web image builds and the private API/web checks pass. Caddy exposes staging HTTPS; workers remain stopped. Installed-browser/provider/hydration/restart acceptance and release remain open. Older inspection snapshots below are historical.

The historical Coolify inspection on the Hetzner VPS compared each running API container with project `nxfawnuflagbimcyrsqs`; production and the clone both matched. Despite its **RELAY - STAGING** label, that project serves production. This historical clone is not the isolated acceptance target. The separate isolated environment below preserves the production manager and routing.

| Running resource | Production API | Staging API clone |
|---|---|---|
| Coolify application | `iyr2upyq1pxsg3d5e55sca8e` | `y12lt80jb8npldm6b5ajlgtz` |
| Source commit reported by process | `7500fea27d9634a9b02bbe61a2a0139f226627fb` | `4b2c5743a48b0c2cf594598f55dc010196a1abba` |
| Database | Shared Supabase pooler | Same Supabase project, direct host |
| Identity, canonical, overrides, creator OAuth, watermark and sync-health flags | `1` | Absent |
| Patreon-cookie database flag | Absent | Absent |
| Job backend | `bullmq` | Absent |
| Redis | Configured, database 0 | Absent |
| R2 bucket and access-key fields | Present | Absent |
| Encryption-key field | Present | Present |

These are process-variable observations. They do not establish effective store behavior for either historical build, credential equality, worker health or provider validity. No secret values were displayed. The sanitized evidence is `C:/Users/jorda/AppData/Local/Temp/relay-coolify-runtime-audit-20261021.json`; its terminal results were transcribed from screenshots. Coolify lists `https://api.relayapp.me` on this production application at port 8787. Public web routing separately confirms that `relayapp.me` uses that API origin.

The [schema upgrade](STAGING-UPGRADE.md) already applied additive steps 1 and 3 through 10 to this shared database, retaining the recorded data, privacy and historical-writer compatibility checks. Its prior staging label did not prove deployment isolation. Step 2 remains held. The [PS-12 media-repair package](STAGING-MEDIA-REPAIR.md) now has independent schema approval, but has not been applied there. Further hosted changes require an explicit target and rollout decision with the shared production binding accounted for.

PS-15 now uses the new OVH host, separate Supabase project, private staging R2 bucket and private Redis. Strict-TLS DB access/required role grant, R2 credential scope and six app/probe field matches, Redis AOF and private API/web bindings are verified. Queue names and object paths lack deployment-prefix settings, so isolation uses separate services and stage-only storage. Production provider credentials were not substituted for fresh test consent.

The schema/privacy bootstrap is accepted. New staging secrets and private stage-only paths are installed, with billing, outbound email and unrelated providers disabled. Two APIs share the reviewed backend image; the private web uses its separately reviewed image. Workers remain stopped behind their separate activation gate: API startup can register repeat producers even with split-worker mode. Auth settings and a separate Patreon client are configured; fresh isolated login/consent, test-owned provider content and actual overlap/restart acceptance remain open.

PS-14 corrected the debug runtime manifest to report the effective Patreon cookie adapter for that reader; the correction has independent local approval. This source-level evidence does not establish which historical build or adapter is active on a hosted deployment.

## Isolated project

The user selected the existing organization and approved creation at Supabase's quoted zero monthly project charge. One project was created, then its identity and healthy status were read back:

- Name: **RELAY - ISOLATED STAGING**.
- Project: `pbwvdieelcxddkmufyrn`, organization `fmasioxxfyjjpevjmrvv`.
- Region: `us-east-2` (Ohio); PostgreSQL 17.11.
- API: `https://pbwvdieelcxddkmufyrn.supabase.co`.
- Status: `ACTIVE_HEALTHY`.

The [isolated bootstrap](ISOLATED-STAGING-BOOTSTRAP.md) applied all 116 frozen source units and reviewed privacy phases, with checksums and hosted migration versions read back. At that bootstrap snapshot, all 157 application tables were empty, all 158 tables had RLS enabled, and the catalog matched three functions, thirteen policies, one trigger, 496 indexes and one sequence. The independent audit accepted **SCHEMA_ACCEPTED_RUNTIME_PENDING**, checking 255 indexed artifacts, 116 sources and 119 unique versions. That was a schema-stage verdict; later strict-TLS runtime access and the required role grant now pass. No production data, Auth identities, credentials or historical migration ledgers were copied. These DB permissions make no creator-ownership policy decision. The zero project quote does not cover every future service/usage charge.

The new **relay-isolated-staging** R2 bucket is private, Standard storage in Eastern North America. The user-approved Object Read & Write credential was issued for this bucket with a one-week lifetime and installed through the private configuration path. Actual bucket listing returns 200 with no objects; account-wide listing returns 403. Six relevant fields match between the installed application and the reviewed probe. Existing buckets and the account-wide credential were preserved. These target/scope checks do not establish upload/recovery acceptance. Evidence: `C:/Users/jorda/AppData/Local/Temp/relay-ps15-actual-target-review-20261021/independent-actual-target-review.md`. The [original bucket creation read-back](C:/Users/jorda/AppData/Local/Temp/relay-staging-r2-created-20261021.png) is retained.

The earlier combined root build and final local PS-15 backend build remain historical passing evidence: `C:/Users/jorda/AppData/Local/Temp/relay-ps15-final-build-20261021/build.json`, SHA-256 `a344b676e2a5101523a1cec3435a4af3a3b14173590241fc1d33e33d30b2f815`, records 2,443 stable hashes and zero denials. Later genuine backend and web Docker builds pass, including existing web lint/type/build stages. The original root suite remains failed; independent triage finds 48 exact later passes and 24 residual cases, with no full rerun. See [PS-15](PS-15-RELIABILITY-ACCEPTANCE.md) for the retained failures, ten-file web prerequisite approval and open dependency audits.

The earlier capacity snapshot (`C:/Users/jorda/AppData/Local/Temp/relay-staging-capacity-20261021.json`) concerns the existing two-CPU production host and the local Windows machine. It did not authorize adding a staging workload there. The new four-vCPU/8-GB host below has since completed actual sequential image builds and private service startup; that evidence does not replace the remaining overlap/restart and workload acceptance checks.

## Separate staging VPS

After the cost and terms handoff, the user manually ordered OVH VPS order **9224390**. The order is processed and the server is active:

- Host: `vps-53656c45.vps.ovh.us`, IPv4 `51.81.210.166`.
- Ubuntu 24.04; four vCPUs, 8 GB RAM and 75 GB NVMe.
- Location: Oregon, `os-us-west-or-2`.
- Monthly charge: **US$10**, tax **US$0**, no term commitment; automatic renewal is next scheduled for **21 November 2026**.

Order confirmation: [relay-ovh-staging-order-confirmed-20261021.png](C:/Users/jorda/AppData/Local/Temp/relay-ovh-staging-order-confirmed-20261021.png). The earlier mandatory-password handoff is complete. Standalone SSH/SCP host setup, Docker installation and reviewed builds now run on this separate host; no existing Coolify-manager route or production-manager change was needed. Redis 7.4.11 is healthy with private AOF storage, and both private APIs are healthy on the exact backend image below. Private configuration values are not part of source, contexts or these records.

The source-approved 11-file TEMP package at `C:/Users/jorda/AppData/Local/Temp/relay-ps15-stage-package-20261021` has manifest SHA-256 `00bb17643f68c43e590d84a543be26b81bd909c34501e746173e5fe099c6efb4`. Its private core is configured and running: Redis and two APIs, all 18 DB selectors, shared private configuration and the target-marker guard. Marker presence alone is not target proof; the actual DB/R2/Redis read-back is recorded separately. The existing 60-second drain/90-second stop grace is retained. Caddy now passes the separate public smoke below; the two workers remain stopped. Its original independent source review remains SHA-256 `cf92ef3771b93ea90197d856f280642e63e09406864ef26d878e029efb506132`.

| Build | Immutable image ID | Source-context archive SHA-256 |
|---|---|---|
| Backend A | `sha256:9c5513e754b2a30a3a90111551320f94b68829a815a4d5cfb5696cf4f1086bdc` | `4306b10fd0e575218585ccb601a6b0c6d6761aa401f9c983ce30b136d326fe2b` |
| Web B | `sha256:bd3ae3b12c1b8670b01b671f221a27752a36b5d3f89e19fe6dc62fc2d246d0bd` | `f1c71f6761639e321b27470d9a4790dbc8ab58421d1412a5bc0bf36df5ce165f` |

The real web build passed at 14:28:39 UTC, with lint, compilation, type validation and page optimization intact. Independent candidate-2 approval covers the minimum ten-file prerequisite repair and its 34 affected tests/semantic check/full lint, with zero guard denials. No dependencies or validation controls were weakened. Build receipts/logs are under `C:/Users/jorda/AppData/Local/Temp/relay-ps15-host-setup-20261021`.

The actual private web resume passed at 14:46:03 UTC, script SHA-256 `ece354a29a0a4e0d8d93bcdc4cb0e5ecd1cbaaf2cb09b9ceee2a8cf4687b7321`. Login HTML is 200 with baseline headers; 8,606,141 compiled bytes contain staging origins and no production API/database endpoint. Core services/marker are unchanged and published ports are zero. Hydration is unverified. The two earlier owned probe failures (SSG text, then short/full container IDs) are preserved. Proof: `resume-private-web-canonical-ids.json` and `.log` in that evidence directory. Dependency audits remain open: 12 web-namespace packages and 30 root-namespace packages inside the web image. See the qualified [PS-15 advisory assessment](PS-15-RELIABILITY-ACCEPTANCE.md); it is not security clearance.

## DNS and secure configuration access

The saved pre-setup DNS inspection identified Hostinger as authoritative and found both new staging names NXDOMAIN. Additive records have since been created for `staging.relayapp.me` and `api.staging.relayapp.me` on the new host. The existing production records were preserved; no zone/nameserver migration or production manager change was required. The passing public-edge/TLS smoke is recorded below.

Supabase Auth now has site URL `https://staging.relayapp.me` and exactly two confirmation callbacks: `https://staging.relayapp.me/auth/confirm?intent=creator` and `https://staging.relayapp.me/auth/confirm?intent=supporter`. A separate Patreon client uses the sole callback `https://staging.relayapp.me/connect/patreon/callback`; the existing client was preserved. Fresh isolated user login and provider consent have not occurred. Use fresh Chrome/Firefox profiles, cookie domain `.staging.relayapp.me`, exact staging CORS and the separate staging extension IDs. Fresh signup/login and loading the approved Chrome/Firefox staging folders are the next browser handoff. Firefox’s actual internal UUID must be recorded before a narrow origin grant; installed origins/grants and collection permission remain live acceptance evidence. The public Auth settings probe returns 200 with email/signup enabled and email auto-confirm off; it created no user. Actual signup, email confirmation and login remain pending (`public-auth-settings-smoke.json` in the host-setup evidence directory).

## Current worker and public-edge gate

The actual public smoke passed at 14:59:38 UTC. Both `staging.relayapp.me` and `api.staging.relayapp.me` pass TLS 1.3 hostname/chain verification. Login HTML is 200; hydration is unverified. Staging credentialed CORS is allowed, the production origin is not credentialed, Chrome-origin exchange OPTIONS is 204, web-origin exchange OPTIONS is 403, and the protected session route returns unauthenticated 401. Caddy is the fifth container, the prior four private services and core marker are unchanged, and worker count is zero. Proof: `C:/Users/jorda/AppData/Local/Temp/relay-ps15-host-setup-20261021/resume-staging-edge-session-route.json` and `.log`, script SHA-256 `5d7d7044437d960d8aec252e9ef4a47d955a052b07e1e1f64501cbcbfa4ad844`. The failed earlier probes remain recorded in [PS-15](PS-15-RELIABILITY-ACCEPTANCE.md); no application-check bypass or production mutation occurred. Fresh auth/consent, installed-browser requests, hydration and actual two-API/two-worker overlap/restart acceptance remain open. PS-15 is not complete; PS-16–22 implementation stays gated. A separate external Windows read-only smoke at 15:00:35 UTC returned 200 for login and API health using strict TLS, no redirects, no cookies and no Authorization (`external-public-smoke.json` in that directory).
