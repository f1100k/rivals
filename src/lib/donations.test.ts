import { describe, expect, it, vi } from "vitest";
import { copyDonationPix, SUPPORTER_THRESHOLD_BRL } from "./donations";

describe("donation details", () => {
  it("copies the exact Pix supplied by the owner", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyDonationPix(writeText);
    expect(writeText).toHaveBeenCalledWith("00020126360014BR.GOV.BCB.PIX0114+55649930062655204000053039865802BR5901N6001C62070503***630482FA");
  });

  it("uses five reais as the exclusive lower threshold for supporter rewards", () => {
    expect(SUPPORTER_THRESHOLD_BRL).toBe(5);
  });
});