/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listCreatorDiscountCodes = vi.fn();
const createCreatorDiscountCode = vi.fn();
const patchCreatorDiscountCode = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/relay-api")>("@/lib/relay-api");
  return {
    ...actual,
    listCreatorDiscountCodes: (...args: unknown[]) => listCreatorDiscountCodes(...args),
    createCreatorDiscountCode: (...args: unknown[]) => createCreatorDiscountCode(...args),
    patchCreatorDiscountCode: (...args: unknown[]) => patchCreatorDiscountCode(...args)
  };
});

import DiscountCodeLibraryPanel from "../../web/app/components/studio/DiscountCodeLibraryPanel";
import type { CreatorDiscountCodeRecord } from "../../web/lib/relay-api";
import { emptyTierRuleDraft } from "../../web/app/studio/promos/tier-rule-model";

const CODE_A: CreatorDiscountCodeRecord = {
  id: "c_a",
  creator_id: "cr_test",
  code: "ALPHA",
  percent_off: 10,
  label: null,
  active: true,
  created_at: "",
  updated_at: ""
};

describe("DiscountCodeLibraryPanel modes", () => {
  beforeEach(() => {
    listCreatorDiscountCodes.mockReset();
    createCreatorDiscountCode.mockReset();
    patchCreatorDiscountCode.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("self-loads when codes prop is omitted (Hero mode)", async () => {
    listCreatorDiscountCodes.mockResolvedValue([CODE_A]);
    render(
      <DiscountCodeLibraryPanel creatorId="cr_test" studioWriteBlocked={false} />
    );
    await waitFor(() => {
      expect(listCreatorDiscountCodes).toHaveBeenCalledWith("cr_test");
      expect(screen.getByText("ALPHA")).toBeTruthy();
    });
    expect(
      document.querySelector("[data-discount-code-library]")?.getAttribute("data-controlled")
    ).toBe("0");
  });

  it("does not self-load in controlled mode and creates into hub callbacks", async () => {
    const onCodesChanged = vi.fn();
    const onCodeCreated = vi.fn();
    createCreatorDiscountCode.mockResolvedValue({
      ...CODE_A,
      id: "c_new",
      code: "NEW10"
    });
    render(
      <DiscountCodeLibraryPanel
        creatorId="cr_test"
        studioWriteBlocked={false}
        codes={[]}
        onCodesChanged={onCodesChanged}
        onCodeCreated={onCodeCreated}
      />
    );
    expect(listCreatorDiscountCodes).not.toHaveBeenCalled();
    expect(screen.getByText(/No codes yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Discount code/i), {
      target: { value: "NEW10" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Add code/i }));
    await waitFor(() => {
      expect(createCreatorDiscountCode).toHaveBeenCalled();
      expect(onCodeCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c_new", code: "NEW10" })
      );
      expect(onCodesChanged).toHaveBeenCalled();
    });
  });

  it("shows usage summaries when provided", () => {
    render(
      <DiscountCodeLibraryPanel
        creatorId="cr_test"
        studioWriteBlocked={false}
        codes={[CODE_A]}
        usageSummaries={[
          {
            discount_code_id: "c_a",
            tier_rule_active_count: 2,
            tier_rule_inactive_count: 0,
            post_offer_active_count: 1,
            post_offer_inactive_count: 0
          }
        ]}
      />
    );
    expect(screen.getByText(/2 tier rules/)).toBeTruthy();
    expect(screen.getByText(/1 post offer/)).toBeTruthy();
  });

  it("surfaces create errors without clearing the form intent", async () => {
    const onError = vi.fn();
    createCreatorDiscountCode.mockRejectedValue(new Error("duplicate code"));
    render(
      <DiscountCodeLibraryPanel
        creatorId="cr_test"
        studioWriteBlocked={false}
        codes={[]}
        onError={onError}
      />
    );
    fireEvent.change(screen.getByLabelText(/Discount code/i), {
      target: { value: "DUP" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Add code/i }));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("duplicate code");
      expect(screen.getByText("duplicate code")).toBeTruthy();
    });
  });

  it("requires confirmation before deactivating a code with active references", async () => {
    const onCodeUpdated = vi.fn();
    patchCreatorDiscountCode.mockResolvedValue({ ...CODE_A, active: false });
    render(
      <DiscountCodeLibraryPanel
        creatorId="cr_test"
        studioWriteBlocked={false}
        codes={[CODE_A]}
        usageSummaries={[
          {
            discount_code_id: "c_a",
            tier_rule_active_count: 1,
            tier_rule_inactive_count: 0,
            post_offer_active_count: 0,
            post_offer_inactive_count: 0
          }
        ]}
        onCodeUpdated={onCodeUpdated}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate$/i }));
    expect(patchCreatorDiscountCode).not.toHaveBeenCalled();
    expect(screen.getByText(/Referenced by 1 active assignment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm deactivate/i }));
    await waitFor(() => {
      expect(patchCreatorDiscountCode).toHaveBeenCalledWith({
        creatorId: "cr_test",
        codeId: "c_a",
        active: false
      });
      expect(onCodeUpdated).toHaveBeenCalled();
    });
  });

  it("deactivates immediately when there are no active references", async () => {
    patchCreatorDiscountCode.mockResolvedValue({ ...CODE_A, active: false });
    render(
      <DiscountCodeLibraryPanel
        creatorId="cr_test"
        studioWriteBlocked={false}
        codes={[CODE_A]}
        onCodesChanged={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate$/i }));
    await waitFor(() => {
      expect(patchCreatorDiscountCode).toHaveBeenCalled();
    });
  });
});

describe("VS4 draft return intent (hub contract)", () => {
  it("preselects new code and restores draft fields after Add-code round trip", () => {
    let draft = {
      ...emptyTierRuleDraft("tier_silver"),
      headline: "Keep me",
      cta_text: "Claim",
      patreon_destination_url: "https://www.patreon.com/x"
    };
    let tab: "rules" | "codes" = "rules";
    let returnToRules = false;

    const onAddCode = () => {
      returnToRules = true;
      tab = "codes";
    };
    const onCodeCreated = (id: string) => {
      draft = { ...draft, discount_code_id: id };
      if (returnToRules) {
        returnToRules = false;
        tab = "rules";
      }
    };
    const onManualTab = (next: "rules" | "codes" | "pieces") => {
      if (next !== "codes") returnToRules = false;
      if (next === "rules" || next === "codes") tab = next;
    };

    onAddCode();
    expect(tab).toBe("codes");
    expect(returnToRules).toBe(true);
    onCodeCreated("c_new");
    expect(tab).toBe("rules");
    expect(draft).toMatchObject({
      headline: "Keep me",
      discount_code_id: "c_new",
      gate_relay_tier_id: "tier_silver"
    });

    onAddCode();
    onManualTab("pieces");
    expect(returnToRules).toBe(false);
    onCodeCreated("c_other");
    expect(tab).toBe("codes"); // stayed — no forced return
  });
});
