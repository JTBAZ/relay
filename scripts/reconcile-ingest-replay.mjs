/** Operator-only replay reconciliation. Stop ingestion writers before running this command. */
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { FileCanonicalStore } from "../dist/src/ingest/canonical-store.js";
import { IngestService } from "../dist/src/ingest/ingest-service.js";
import { InMemoryEventBus } from "../dist/src/events/event-bus.js";
import { validateIngestBatchBody } from "../dist/src/ingest/validate-body.js";
import { IngestReplayConflict, parseReplayResolutions } from "../dist/src/ingest/replay-compatibility.js";

const { values } = parseArgs({ options: {
  batch: { type: "string" }, decisions: { type: "string" }, canonical: { type: "string" }, database: { type: "boolean" }
} });
if (!values.batch || !values.decisions || Boolean(values.canonical) === Boolean(values.database)) {
  throw new Error("Usage: node scripts/reconcile-ingest-replay.mjs --batch batch.json --decisions decisions.json (--canonical canonical.json | --database)");
}
const parsed = validateIngestBatchBody(JSON.parse(await readFile(values.batch, "utf8")));
if (!parsed.ok) throw new Error(`Invalid ingest batch: ${JSON.stringify(parsed.details)}`);
const decisions = parseReplayResolutions(JSON.parse(await readFile(values.decisions, "utf8")));
if (decisions.length === 0) throw new Error("Supply at least one exact-identity decision.");
let prisma;
try {
  let store;
  let bus;
  if (values.database) {
    ({ prisma } = await import("../dist/src/lib/db.js"));
    const { DbCanonicalStore } = await import("../dist/src/ingest/canonical-store-db.js");
    const { DbEventBus } = await import("../dist/src/events/event-bus-db.js");
    store = new DbCanonicalStore(prisma);
    bus = new DbEventBus(prisma);
  } else {
    if (!(await stat(values.canonical)).isFile()) throw new Error("The canonical path must be an existing file.");
    store = new FileCanonicalStore(values.canonical);
    bus = new InMemoryEventBus();
  }
  const result = await new IngestService(store, bus).runBatch(parsed.batch, randomUUID(), undefined, decisions);
  console.log(JSON.stringify({ result, events_emitted: bus.getAll().length }, null, 2));
} catch (error) {
  if (error instanceof IngestReplayConflict) {
    console.error(JSON.stringify({ error: error.message, parts: error.parts, legacy_key: error.legacyKey }));
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await prisma?.$disconnect();
}
