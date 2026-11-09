import { describe, expect, it } from "vitest";
import { mixBalance, mixStatusText, sortMixMvpRows, sortMixRows } from "./mix";

describe("ranking Mix", () => {
  it("cada derrota tira uma vitória do saldo", () => {
    expect(mixBalance(10, 4)).toBe(6);
    expect(mixBalance(2, 5)).toBe(-3);
  });

  it("quem tem maior saldo fica no topo; empate vai para quem tem mais vitórias", () => {
    const rows = sortMixRows([
      { name: "A", wins: 3, losses: 0 },
      { name: "B", wins: 10, losses: 6 },
      { name: "C", wins: 5, losses: 2 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });
});

describe("horário do Mix", () => {
  const s = { active: false, manualOn: false, startsAt: "2026-11-08T23:00:00Z", endsAt: "2026-11-09T02:00:00Z" };
  it("fica ativo só entre 20h e 23h de Brasília", () => {
    expect(mixStatusText(s, Date.parse("2026-11-08T22:59:00Z"))).toMatch(/começa/);
    expect(mixStatusText(s, Date.parse("2026-11-08T23:00:00Z"))).toBe("Modo Mix ativo até 23:00");
    expect(mixStatusText(s, Date.parse("2026-11-09T02:00:00Z"))).toBeNull();
  });
  it("ligado na mão vale sem horário", () => {
    expect(mixStatusText({ active: true, manualOn: true, startsAt: null, endsAt: null })).toBe("Modo Mix ativo");
  });
});

describe("ranking Mix MVP", () => {
  it("quem tem mais MVPs fica no topo; empate vai para quem jogou menos partidas", () => {
    const rows = sortMixMvpRows([
      { name: "A", mvps: 2, games: 8 },
      { name: "B", mvps: 3, games: 10 },
      { name: "C", mvps: 2, games: 4 },
      { name: "D", mvps: 0, games: 5 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });
});
