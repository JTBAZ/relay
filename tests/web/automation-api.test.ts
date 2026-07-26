/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATIONS_API_FIXTURES,
  AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
  AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW
} from "../automations/fixtures.js";

const relayFetch = vi.fn();

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-api")>();
  return {
    ...actual,
    relayFetch: (...args: Parameters<typeof actual.relayFetch>) => relayFetch(...args)
  };
});

import {
  archiveAutomation,
  createAutomation,
  getAutomation,
  listAutomationRuns,
  listAutomations,
  patchAutomation
} from "../../web/lib/automation-api";

describe("web/lib/automation-api → Relay paths (B06)", () => {
  beforeEach(() => {
    relayFetch.mockReset();
  });

  it("lists via GET collection", async () => {
    relayFetch.mockResolvedValue(AUTOMATIONS_API_FIXTURES.list);
    const rows = await listAutomations();
    expect(relayFetch).toHaveBeenCalledWith("/api/v1/creator/autopost/automations");
    expect(rows).toHaveLength(1);
  });

  it("gets via GET item", async () => {
    relayFetch.mockResolvedValue(AUTOMATIONS_API_FIXTURES.get);
    const id = AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id;
    await getAutomation(id);
    expect(relayFetch).toHaveBeenCalledWith(
      `/api/v1/creator/autopost/automations/${encodeURIComponent(id)}`
    );
  });

  it("creates via POST with JSON body", async () => {
    relayFetch.mockResolvedValue(AUTOMATIONS_API_FIXTURES.create);
    await createAutomation(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST);
    expect(relayFetch).toHaveBeenCalledWith("/api/v1/creator/autopost/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST)
    });
  });

  it("patches via PATCH with version", async () => {
    relayFetch.mockResolvedValue({
      ...AUTOMATIONS_API_FIXTURES.create,
      receipt: { ...AUTOMATIONS_API_FIXTURES.create.receipt, created: false, version: 2 }
    });
    const id = AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id;
    await patchAutomation(id, { version: 1, status: "paused" });
    expect(relayFetch).toHaveBeenCalledWith(
      `/api/v1/creator/autopost/automations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, status: "paused" })
      }
    );
  });

  it("archives via DELETE (not GET)", async () => {
    relayFetch.mockResolvedValue({
      ...AUTOMATIONS_API_FIXTURES.create,
      archived: true,
      receipt: {
        ...AUTOMATIONS_API_FIXTURES.create.receipt,
        created: false,
        status: "archived"
      }
    });
    const id = AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id;
    const out = await archiveAutomation(id);
    expect(out.archived).toBe(true);
    expect(relayFetch).toHaveBeenCalledWith(
      `/api/v1/creator/autopost/automations/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  });

  it("lists runs via GET …/runs", async () => {
    relayFetch.mockResolvedValue(AUTOMATIONS_API_FIXTURES.runs);
    const id = AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id;
    const runs = await listAutomationRuns(id);
    expect(runs).toHaveLength(1);
    expect(relayFetch).toHaveBeenCalledWith(
      `/api/v1/creator/autopost/automations/${encodeURIComponent(id)}/runs`
    );
  });
});
