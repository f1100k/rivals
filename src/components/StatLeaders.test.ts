import { describe, expect, it } from "vitest";
import { STAT_BOARDS } from "@/components/StatLeaders";

describe("ranking stat boards", () => {
  it("shows the Save/GK board and no duplicate Defesa board", () => {
    expect(STAT_BOARDS.map((b) => b.key)).toEqual(["goals", "gk_saves", "interceptions", "mvps", "passes", "assists"]);
    expect(STAT_BOARDS.find((b) => b.key === "saves")).toBeUndefined();
    expect(STAT_BOARDS.find((b) => b.key === "gk_saves")?.title).toBe("Save/GK");
  });
});
