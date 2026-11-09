import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_GAMES, dayEndExclusive, dayStart, fmtGain, gamesMissing, isQualified, leagueRangeLabel, nextWeekDates, splitLeague, type LeagueRow } from "@/lib/league";

const row = (id: string, games: number, qualified: boolean, place: number | null = null): LeagueRow =>
  ({ id, name: id, avatar_url: null, games, wins: 0, losses: 0, mmr_gain: 0, qualified, place });

describe("Rivals League rules", () => {
  it("needs 15 matches in the week to qualify", () => {
    expect(DEFAULT_MIN_GAMES).toBe(15);
    expect(isQualified(15, DEFAULT_MIN_GAMES)).toBe(true);
    expect(isQualified(14, DEFAULT_MIN_GAMES)).toBe(false);
  });

  it("counts how many matches are still missing", () => {
    expect(gamesMissing(9, 15)).toBe(6);
    expect(gamesMissing(20, 15)).toBe(0);
  });

  it("keeps players under the minimum in a separate list", () => {
    const { qualified, pending } = splitLeague([row("a", 16, true, 1), row("b", 15, true, 2), row("c", 14, false)]);
    expect(qualified.map((r) => r.id)).toEqual(["a", "b"]);
    expect(pending.map((r) => r.id)).toEqual(["c"]);
  });

  it("runs Monday 00:00 to Sunday midnight in Brasília", () => {
    expect(dayStart("2026-11-09")).toBe("2026-11-09T03:00:00.000Z");
    expect(dayEndExclusive("2026-11-15")).toBe("2026-11-16T03:00:00.000Z");
    expect(leagueRangeLabel({ starts_at: "2026-11-09T03:00:00Z", ends_at: "2026-11-16T03:00:00Z" })).toBe("09/11 a 15/11");
  });

  it("suggests the coming Monday to Sunday", () => {
    expect(nextWeekDates(new Date("2026-11-09T12:00:00Z"))).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    expect(nextWeekDates(new Date("2026-11-11T12:00:00Z"))).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });

  it("shows MMR gained with a sign", () => {
    expect(fmtGain(14)).toBe("+14");
    expect(fmtGain(-181)).toBe("-181");
    expect(fmtGain(0)).toBe("0");
  });
});
