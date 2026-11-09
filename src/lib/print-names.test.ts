import { describe, it, expect } from "vitest";
import { matchPrintNames } from "./print-players";
import { previewRating } from "@/components/AdminPointsBatch";

const people = [
  { id: "vg", name: "vg gk" },
  { id: "tsu", name: "Tsuᶻᵃᵍ/ᵍᵏ" },
  { id: "kosky", name: "Kosky Moreno" },
];

describe("print name matching for admin points", () => {
  it("uses the AI's exact site-name guess", () => {
    expect(matchPrintNames([{ printName: "Tsuzag/gk", siteName: "Tsuᶻᵃᵍ/ᵍᵏ" }], people)).toEqual([{ printName: "Tsuzag/gk", userId: "tsu" }]);
  });
  it("falls back to fuzzy matching when the guess is empty", () => {
    expect(matchPrintNames([{ printName: "Kosky Moreno", siteName: "" }], people)[0]?.userId).toBe("kosky");
  });
  it("never links the same player twice and leaves unknown names for a manual pick", () => {
    const out = matchPrintNames([{ printName: "vg gk", siteName: "vg gk" }, { printName: "VG GK", siteName: "vg gk" }, { printName: "Fulano", siteName: "" }], people);
    expect(out.map((r) => r.userId)).toEqual(["vg", null, null]);
  });
});

describe("points preview", () => {
  it("adds 38 points", () => expect(previewRating(0, 38)).toBe(38));
  it("never goes below zero when removing", () => expect(previewRating(10, -15)).toBe(0));
});
