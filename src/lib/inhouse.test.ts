import { describe, expect, it } from "vitest";
import { balanceTeams, eloDelta, avg, matchOdds, teamRole, winProbability, eloUpdate, winStreakBonus, appliedWinStreakBonus, type Player } from "./inhouse";

describe("inhouse rules", () => {
  it("favorite at 3500 against 2000 receives 18", () => expect(eloDelta(3500, 2000, 1)).toBe(18));
  it("challenger at 2000 against 3500 receives 28", () => expect(eloDelta(2000, 3500, 1)).toBe(28));
  it("equal averages receive 18", () => expect(eloDelta(1000, 1000, 1)).toBe(18));
  it("normal defeat loses 19", () => expect(eloDelta(3500, 2000, 0)).toBe(-19));
  it("balances 10 players into two teams of 5 with close averages", () => {
    const ps: Player[] = [1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600].map((r, i) => ({ id: String(i), name: String(i), rating: r, wins: 0, losses: 0 }));
    const [a, b] = balanceTeams(ps);
    expect(a).toHaveLength(5);
    expect(b).toHaveLength(5);
    expect(Math.abs(avg(a) - avg(b))).toBeLessThanOrEqual(40);
  });
  it("names the higher-MMR side the favorite on a closed 5v5", () => {
    const odds = matchOdds([300, 250, 200, 150, 100], [280, 240, 190, 140, 90]);
    expect({ totalA: odds.totalA, totalB: odds.totalB, margin: odds.margin, favorite: odds.favorite })
      .toEqual({ totalA: 1000, totalB: 940, margin: 60, favorite: "a" });
    // Averages 200 against 188: the favorite is ahead, but nowhere near certain.
    expect(odds.probA).toBeCloseTo(0.517, 3);
    expect(odds.probB).toBeCloseTo(0.483, 3);
    expect(teamRole("a", odds.favorite)).toBe("favorito");
    expect(teamRole("b", odds.favorite)).toBe("desafiador");
  });
  it("keeps both labels off while the draft is still open", () => {
    const odds = matchOdds([300, 250], [280, 240, 190]);
    expect(odds.favorite).toBeNull();
    expect(odds.probA).toBeNull();
    expect(odds.probB).toBeNull();
    expect(teamRole("a", odds.favorite)).toBeNull();
    expect(teamRole("b", odds.favorite)).toBeNull();
  });
  it("gives no favorite on an exact tie", () => {
    const odds = matchOdds([200, 200, 200, 200, 200], [200, 200, 200, 200, 200]);
    expect(odds.totalA).toBe(1000);
    expect(odds.margin).toBe(0);
    expect(odds.favorite).toBeNull();
  });
  it("gives the favorite about 83.3% and pays about 5.3 / 26.7 with K = 32", () => {
    const p = winProbability(740, 460);
    expect(p).toBeCloseTo(0.8333, 3);
    expect(eloUpdate(740, 460, 1)).toBeCloseTo(5.34, 1);
    expect(eloUpdate(740, 460, 0)).toBeCloseTo(-26.66, 1);
    expect(eloUpdate(460, 740, 1)).toBeCloseTo(26.66, 1);
    expect(eloUpdate(460, 740, 0)).toBeCloseTo(-5.34, 1);
  });
  it("adds only +5 per win in a streak instead of doubling", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(winStreakBonus)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    expect(appliedWinStreakBonus(6)).toBe(25);
    expect(appliedWinStreakBonus(11)).toBe(45);
    expect(appliedWinStreakBonus(3, { enabled: false, maxBonus: 1280, maxRewardedStreak: 10 })).toBe(0);
    expect(appliedWinStreakBonus(9, { enabled: true, maxBonus: 20, maxRewardedStreak: 10 })).toBe(20);
  });
});
