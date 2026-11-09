import { describe, expect, it } from "vitest";
import { rankName, tierProgress, RANK_LADDER } from "./inhouse";

describe("rank divisions", () => {
  it("advances every rank division at each 100 MMR boundary", () => {
    expect(rankName(0)).toBe("Bronze · Div 1");
    expect(rankName(99)).toBe("Bronze · Div 1");
    expect(rankName(100)).toBe("Bronze · Div 2");
    expect(rankName(200)).toBe("Bronze · Div 3");
    expect(rankName(300)).toBe("Prata · Div 1");
    expect(rankName(900)).toBe("Platina · Div 1");
    const tiers = ["Bronze", "Prata", "Ouro", "Platina", "Diamante", "Elite"];
    for (let step = 0; step < 18; step++) {
      const label = `${tiers[Math.floor(step / 3)]} · Div ${(step % 3) + 1}`;
      expect(rankName(step * 100)).toBe(label);
      expect(rankName(step * 100 + 99)).toBe(label);
    }
  });
  it("tracks progress to the next division", () => {
    expect(tierProgress(1000)).toEqual({ pct: 0, next: "Platina · Div 3", left: 100 });
    expect(tierProgress(1050)).toEqual({ pct: 0.5, next: "Platina · Div 3", left: 50 });
  });
  it("caps the highest rank", () => {
    expect(rankName(5000)).toBe("Elite · Div 3");
    expect(tierProgress(5000)).toEqual({ pct: 1, next: null, left: 0 });
  });
  it("maps every rank step to its MMR floor", () => {
    expect(RANK_LADDER).toHaveLength(18);
    expect(RANK_LADDER[0]).toEqual({ tier: "Bronze", div: 1, min: 0 });
    expect(RANK_LADDER[5]).toEqual({ tier: "Prata", div: 3, min: 500 });
    expect(RANK_LADDER[15]).toEqual({ tier: "Elite", div: 1, min: 1500 });
    expect(RANK_LADDER[17]).toEqual({ tier: "Elite", div: 3, min: 1700 });
  });
});