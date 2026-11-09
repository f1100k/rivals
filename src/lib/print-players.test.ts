import { describe, expect, it } from "vitest";
import { matchPrintPlayers, normalizeName, type PrintPlayer, type PrintPerson } from "./print-players";

const row = (gameName: string, siteName: string, goals: number, extra: Partial<PrintPlayer> = {}): PrintPlayer => ({
  gameName,
  siteName,
  goals,
  assists: 0,
  passes: 0,
  interceptions: 0,
  saves: 0,
  score: 0,
  mvp: false,
  ...extra,
});

const people: PrintPerson[] = [
  { id: "u-shey", name: "shey" },
  { id: "u-l", name: "L" },
  { id: "u-maca", name: "macaconha" },
  { id: "u-cold", name: "cold" },
  { id: "u-lukita", name: "lukita" },
  { id: "u-neymar", name: "Neymar Prateado" },
  { id: "u-lost", name: "LosT" },
  { id: "u-rafx", name: "rafx" },
  { id: "u-undxr", name: "undxr" },
  { id: "u-bugs", name: "Bugs Bunny" },
];

const print: PrintPlayer[] = [
  row("rvo.shey", "shey", 0, { interceptions: 4, saves: 1 }),
  row("rvo.L 龍", "L", 0, { passes: 3 }),
  row("rvo.macaconha", "macaconha", 0, { assists: 1 }),
  row("rvo.cold", "cold", 0, { passes: 7 }),
  row("rvo.lukita", "lukita", 1, { assists: 1 }),
  row("DRAGO Neymar Prateado", "Neymar Prateado", 0, { assists: 1 }),
  row("DRAGO LosT", "LosT", 1, { mvp: true, score: 5550 }),
  row("DRAGO rafx", "rafx", 0, { passes: 8 }),
  row("undxr · ⸸Amandaa⸸", "undxr", 0, { passes: 8 }),
  row("Bugs Bunny", "Bugs Bunny", 2),
];

const goalsOf = (id: string) => matchPrintPlayers(people, print).find((s) => s.user_id === id)?.goals;

describe("print player matching", () => {
  it("keeps the Defesa column value in saves once, independently of interceptions", () => {
    const stats = matchPrintPlayers([{ id: "keeper", name: "Goleiro" }], [row("Goleiro", "Goleiro", 0, { saves: 7, interceptions: 3 })]);
    expect(stats).toEqual([{ user_id: "keeper", goals: 0, assists: 0, passes: 0, interceptions: 3, saves: 7, score: 0, mvp: false }]);
  });
  it("attributes all statistics to participants with the same name on the print and site", () => {
    const stats = matchPrintPlayers(
      [{ id: "arroganti", name: "Arroganti" }, { id: "other", name: "Other" }],
      [row("Arroganti", "", 2, { assists: 1, passes: 7, interceptions: 3, saves: 4, score: 2000, mvp: true })],
    );
    expect(stats).toEqual([{ user_id: "arroganti", goals: 2, assists: 1, passes: 7, interceptions: 3, saves: 4, score: 2000, mvp: true }]);
  });

  it("strips clan prefixes and symbol noise from game names", () => {
    expect(normalizeName("rvo.shey")).toBe("rvo shey");
    expect(normalizeName("undxr · ⸸Amandaa⸸")).toBe("undxr amandaa");
    expect(normalizeName("rvo.L 龍")).toBe("rvo l");
  });

  it("saves the goals of every scorer in the print", () => {
    expect(goalsOf("u-lukita")).toBe(1);
    expect(goalsOf("u-lost")).toBe(1);
    expect(goalsOf("u-bugs")).toBe(2);
  });

  it("keeps MVP and per-player numbers on the right person", () => {
    const stats = matchPrintPlayers(people, print);
    const lost = stats.find((s) => s.user_id === "u-lost");
    expect(lost).toMatchObject({ mvp: true, score: 5550, goals: 1 });
    const shey = stats.find((s) => s.user_id === "u-shey");
    expect(shey).toMatchObject({ goals: 0, interceptions: 4, saves: 1 });
  });

  it("matches every player of the print, not only the ones the reader was sure about", () => {
    const unsure = print.map((r) => row(r.gameName, "", r.goals));
    expect(matchPrintPlayers(people, unsure)).toHaveLength(10);
  });

  it("matches a one-letter site name against a decorated game name", () => {
    expect(goalsOf("u-l")).toBe(0);
  });

  it("drops rows that belong to nobody on the site", () => {
    const stats = matchPrintPlayers(people, [...print, row("rvo.estranho", "", 5)]);
    expect(stats).toHaveLength(10);
    expect(stats.some((s) => s.goals === 5)).toBe(false);
  });

  it("never gives one player's numbers to two rows", () => {
    const stats = matchPrintPlayers(people, [...print, row("DRAGO LosT", "LosT", 4)]);
    expect(stats.filter((s) => s.user_id === "u-lost")).toHaveLength(1);
  });

  it("leaves a row unassigned when two site players fit equally well", () => {
    const twins: PrintPerson[] = [
      { id: "u-a", name: "Kaio" },
      { id: "u-b", name: "kaio" },
      { id: "u-c", name: "Rafa" },
    ];
    const stats = matchPrintPlayers(twins, [row("kaio", "", 3), row("Rafa", "Rafa", 1)]);
    expect(stats.map((s) => s.user_id)).toEqual(["u-c"]);
  });
});
