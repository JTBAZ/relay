# Deployment and isolated acceptance

Status: isolated database bootstrap verified; independent completion audit pending, 2026-10-21. A separate staging VPS is active, with initial login and password-change handoff pending. Runtime configuration, deployment, hosted acceptance and cutover remain held.

The user authenticated Coolify on the Hetzner VPS. A read-only command in each running API container compared its database and Supabase host with project `nxfawnuflagbimcyrsqs`. Both matched. Despite its **RELAY - STAGING** name, this Supabase project also serves the running production API. The separate Coolify staging project does not provide database isolation. Before provisioning, the connected account had no development branches or other Relay Supabase project.

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

PS-15 now has a separate Supabase project and private staging R2 bucket. Remaining setup includes isolated Auth configuration, dedicated Redis, bucket-scoped credentials, the reviewed API/worker build, correct web/API origins and OAuth callbacks, and authenticated test browser sessions. Queue names and R2 object paths currently lack deployment-prefix settings, so a new tenant alone cannot isolate these acceptance cases. Do not copy production provider credentials into the new environment as a substitute for fresh test consent. Neither the production-linked clone nor the new VPS is configured for current isolated acceptance.

The empty schema and privacy bootstrap is complete; retain the historical migration discrepancies and its actual source receipts. Next, use new staging secrets and stage-only persistent paths, with billing, outbound email and unrelated providers disabled. Record one image digest across staging API and workers. Start with consumers stopped: API startup can register repeat producers even when `RELAY_SPLIT_WORKER_PROCESS=1`. Enable workers only after verifying their database, Redis and R2 targets. Measure capacity before scaling to two API and two worker processes for overlap and restart acceptance. Set staging callbacks and webhook origins independently, then connect Relaytest through fresh consent. Reusing the same upstream campaign still requires test-owned content for mutation cases.

The current debug runtime manifest describes Patreon cookies as always file-backed, although the selector now supports shared database storage. The PS-14 correction remains pending review. Treat that manifest as insufficient evidence until its cookie field agrees with the selected adapter; keep the correction within the reliability configuration/evidence scope.

## Isolated project

The user selected the existing organization and approved creation at Supabase's quoted zero monthly project charge. One project was created, then its identity and healthy status were read back:

- Name: **RELAY - ISOLATED STAGING**.
- Project: `pbwvdieelcxddkmufyrn`, organization `fmasioxxfyjjpevjmrvv`.
- Region: `us-east-2` (Ohio); PostgreSQL 17.11.
- API: `https://pbwvdieelcxddkmufyrn.supabase.co`.
- Status: `ACTIVE_HEALTHY`.

The [isolated bootstrap](ISOLATED-STAGING-BOOTSTRAP.md) applied all 116 frozen source units and reviewed privacy phases, with actual source checksums and hosted migration versions read back. All 157 application tables are empty, all 158 tables have RLS enabled, and the independent catalog query matches three functions, thirteen policies, one trigger, 496 indexes and one sequence. Browser schema access remains closed. The independent completion audit is pending. No production data, Auth identities, credentials or historical migration ledgers were copied. Redis, staging secrets, domains and authenticated test browser sessions remain to be prepared. The zero quote concerns the returned project price; it is not a claim about every future service or usage charge.

The authenticated Cloudflare dashboard now contains a new **relay-isolated-staging** R2 bucket, Standard storage in Eastern North America. Its creation readback shows public access disabled, zero bytes and no objects. Existing buckets were not edited. Proof: `C:/Users/jorda/AppData/Local/Temp/relay-staging-r2-created-20261021.png`. A new Object Read & Write credential form is prepared for this bucket alone, with a one-week lifetime; it remains unsubmitted, and no new key has been issued or installed. Do not reuse the existing Relay account-wide credential for staging.

The latest combined root production build passes after the concurrent Library changes: `C:/Users/jorda/AppData/Local/Temp/relay-ps13-before/root-build-final.json` records exit zero, no blocked transports and 592 stable source hashes across the run. Preserve the earlier failure evidence and separate web/extension verification limits. No Coolify settings were saved, reset or deployed; the existing unsaved/unapplied configuration banners were left intact. No provider requests or acceptance mutations ran through the containers.

A read-only capacity snapshot reports 1,920 MiB total VPS memory, 540 MiB available and two CPUs. The running production API has no cgroup memory cap and uses about 165 MiB at that instant. This does not establish spare capacity for image builds or two staging API/worker replicas. Local Windows has about 2 GiB available at the same check and no Docker CLI. Evidence: `C:/Users/jorda/AppData/Local/Temp/relay-staging-capacity-20261021.json`. Prepare a build/runtime capacity plan before adding hosted processes; no existing service was stopped or resized.

## Separate staging VPS

After the cost and terms handoff, the user manually ordered OVH VPS order **9224390**. The order is processed and the server is active:

- Host: `vps-53656c45.vps.ovh.us`, IPv4 `51.81.210.166`.
- Ubuntu 24.04; four vCPUs, 8 GB RAM and 75 GB NVMe.
- Location: Oregon, `os-us-west-or-2`.
- Monthly charge: **US$10**, tax **US$0**, no term commitment; automatic renewal is next scheduled for **21 November 2026**.

Order confirmation: [relay-ovh-staging-order-confirmed-20261021.png](C:/Users/jorda/AppData/Local/Temp/relay-ovh-staging-order-confirmed-20261021.png). This provides the planned separate build/runtime capacity; its workload headroom has not been measured. KVM is open for the user's initial Ubuntu login and password-change handoff. The server has not been connected to Coolify, configured with database/Auth secrets or providers, or deployed. Keep those steps separate from order completion and database schema verification.
