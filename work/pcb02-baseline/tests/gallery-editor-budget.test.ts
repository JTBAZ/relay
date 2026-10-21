import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileProviderBudget } from "../src/gallery-editor/budget.js";

const signal = new AbortController().signal;
let directory: string;
let ledgerPath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "relay-editor-budget-"));
  ledgerPath = join(directory, "ledger.json");
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const reservation = (amountUsd: number, phase: "development" | "heldout") => ({ model: "synthetic-test-model", amountUsd, phase, signal });
const errorCode = (code: string) => expect.objectContaining({ code });

describe("durable gallery editor provider budget", () => {
  it("persists reservations across instances and retains the full charge when usage is unknown", async () => {
    const first = new FileProviderBudget(ledgerPath);
    const id = await first.reserve(reservation(9, "heldout"));
    await first.settle(id, null);
    const restarted = new FileProviderBudget(ledgerPath);
    await expect(restarted.reserve(reservation(1.01, "heldout"))).rejects.toEqual(errorCode("BUDGET_EXHAUSTED"));
    const second = await restarted.reserve(reservation(1, "heldout"));
    const rows = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, reservedUsd: 9, actualUsd: null, settled: true, phase: "heldout" }),
      expect.objectContaining({ id: second, reservedUsd: 1, actualUsd: null, settled: false }),
    ]));
    await expect(restarted.reserve(reservation(0.01, "heldout"))).rejects.toEqual(errorCode("BUDGET_EXHAUSTED"));
  });

  it("releases only known unspent reservation and keeps settlement idempotent", async () => {
    const budget = new FileProviderBudget(ledgerPath);
    const id = await budget.reserve(reservation(10, "development"));
    await budget.settle(id, 2.5);
    await budget.settle(id, 0); // A retry cannot rewrite reported usage.
    const restarted = new FileProviderBudget(ledgerPath);
    await restarted.reserve(reservation(12.5, "development"));
    await expect(restarted.reserve(reservation(0.001, "development"))).rejects.toEqual(errorCode("BUDGET_EXHAUSTED"));
    const rows = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(rows[0]).toMatchObject({ id, reservedUsd: 10, actualUsd: 2.5, settled: true });
  });

  it("enforces both phase caps and the combined 25 USD ceiling after restart", async () => {
    const budget = new FileProviderBudget(ledgerPath);
    await budget.reserve(reservation(15, "development"));
    await expect(budget.reserve(reservation(0.001, "development"))).rejects.toEqual(errorCode("BUDGET_EXHAUSTED"));
    const restarted = new FileProviderBudget(ledgerPath);
    await restarted.reserve(reservation(10, "heldout"));
    await expect(restarted.reserve(reservation(0.001, "heldout"))).rejects.toEqual(errorCode("BUDGET_EXHAUSTED"));
    const rows = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(rows.reduce((sum: number, row: { reservedUsd: number }) => sum + row.reservedUsd, 0)).toBe(25);
    expect(rows).toHaveLength(2);
  });

  it("rejects invalid reservations and settlements without changing the ledger", async () => {
    const budget = new FileProviderBudget(ledgerPath);
    await expect(budget.reserve(reservation(Number.NaN, "development"))).rejects.toEqual(errorCode("BUDGET_INVALID"));
    const id = await budget.reserve(reservation(1, "development"));
    await expect(budget.settle(id, -1)).rejects.toEqual(errorCode("BUDGET_INVALID"));
    await expect(budget.settle("missing", 0)).rejects.toEqual(errorCode("BUDGET_INVALID"));
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toEqual([expect.objectContaining({ id, reservedUsd: 1, actualUsd: null, settled: false })]);
  });
});
