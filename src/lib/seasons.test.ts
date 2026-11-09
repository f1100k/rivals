import { describe, expect, it } from "vitest";
import { careerRecord, groupTagsBySeason, nextSeasonNumber, seasonShort, tagsOfSeason, viewableSeasons, type SeasonTag } from "./seasons";

const tag = (name: string, season: { id: string; n: number } | null): SeasonTag => ({
  id: name, name, text_color: "#fff", background_color: "#000", effect: null, equipped: false, granted_at: "2026-11-08T00:00:00Z",
  season_id: season?.id ?? null, season_number: season?.n ?? null, season_name: season ? `Season ${season.n}` : null,
});
const s0 = { id: "s0", n: 0 }, s1 = { id: "s1", n: 1 };

describe("seasons", () => {
  it("a primeira season é a Season 0 e as próximas seguem a contagem", () => {
    expect(nextSeasonNumber([])).toBe(0);
    expect(nextSeasonNumber([{ number: 0 }, { number: 1 }])).toBe(2);
  });

  it("Geral soma a season atual (zerada no início) com as seasons finalizadas", () => {
    const stats = (wins: number, losses: number) => ({ wins, losses, goals: 0, assists: 0, passes: 0, interceptions: 0, gk_saves: 0, gk_games: 0, mvps: 0, likes: 0, final_rank: 1, final_rating: 0 });
    const seasons = [
      { status: "active" as const, stats: stats(3, 1) },
      { status: "finished" as const, stats: stats(27, 11) },
    ];
    expect(careerRecord({ wins: 3, losses: 1 }, seasons)).toEqual({ wins: 30, losses: 12 });
    expect(careerRecord({ wins: 0, losses: 0 }, [{ status: "finished", stats: null }])).toEqual({ wins: 0, losses: 0 });
  });

  it("o seletor mostra a season atual primeiro e depois as finalizadas, sem as planejadas", () => {
    const list = viewableSeasons([
      { number: 0, status: "finished" as const }, { number: 2, status: "planned" as const }, { number: 1, status: "active" as const },
    ]);
    expect(list.map((s) => s.number)).toEqual([1, 0]);
  });

  it("título mostra a season ao lado (S0)", () => {
    expect(seasonShort(0)).toBe("S0");
    expect(seasonShort(null)).toBeNull();
  });

  it("cada season mostra só as conquistas dela; Geral mostra todas", () => {
    const tags = [tag("1º lugar", s0), tag("MVP", s1), tag("Apoiador", null)];
    expect(tagsOfSeason(tags, "s0").map((t) => t.name)).toEqual(["1º lugar"]);
    expect(tagsOfSeason(tags, "geral")).toHaveLength(3);
  });

  it("conquistas ficam agrupadas da season mais nova para a mais antiga", () => {
    const groups = groupTagsBySeason([tag("1º lugar", s0), tag("Apoiador", null), tag("MVP", s1)]);
    expect(groups.map((g) => g.label)).toEqual(["Season 1", "Season 0", "Sem season"]);
  });
});
