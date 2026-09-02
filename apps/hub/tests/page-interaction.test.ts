import { describe, expect, it } from "vitest";
import { pageInteractionsEnabled } from "@/features/actors/domain/page-interaction";

describe("pageInteractionsEnabled", () => {
  it("is off while controls show and the switch is off", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: false, switchEnabled: false }),
    ).toBe(false);
  });

  it("is on when the toolbar switch is enabled with controls still showing", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: false, switchEnabled: true }),
    ).toBe(true);
  });

  it("is on whenever controls are hidden, even if the switch is off", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: true, switchEnabled: false }),
    ).toBe(true);
  });

  it("is on when both Preview and the switch are true", () => {
    expect(
      pageInteractionsEnabled({ controlsHidden: true, switchEnabled: true }),
    ).toBe(true);
  });
});
