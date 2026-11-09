// Pure helpers shared between the client and the tests.
// The real state lives in Lovable Cloud (src/lib/inhouse.functions.ts).

export type Mode = 3 | 4 | 5;
export type Region = "SA" | "NA" | "EU";

export interface Player {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

export const START_RATING = 0;
export const WIN_DELTA = 18;
export const UNDERDOG_WIN_DELTA = 28;
export const LOSS_DELTA = -19;

/** Rewards use the five-player pre-match team averages; ties get the normal reward. */
export function eloDelta(team: number, opp: number, result: 0 | 1) {
  return result === 0 ? LOSS_DELTA : team < opp ? UNDERDOG_WIN_DELTA : WIN_DELTA;
}

/** Chess-style Elo constant used by the competitive scoring. */
export const ELO_K = 32;

/** Expected win rate of team A against team B, from their pre-match MMR averages. */
export function winProbability(avgA: number, avgB: number) {
  const a = Number.isFinite(avgA) ? avgA : 0;
  const b = Number.isFinite(avgB) ? avgB : 0;
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * Elo update for one player: K x (S - E), with S = 1 win / 0 loss and E taken
 * from the team averages. Keeps decimals; rounding happens when the value is stored.
 */
export function eloUpdate(teamAvg: number, oppAvg: number, result: 0 | 1) {
  return ELO_K * (result - winProbability(teamAvg, oppAvg));
}

/** Each extra win in a run adds this much to the bonus. */
export const WIN_STREAK_BASE = 5;

/** 1st win pays no bonus, then grows by 5 per win: 5, 10, 15, 20, 25... */
export function winStreakBonus(streak: number) {
  const n = Math.floor(streak);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return WIN_STREAK_BASE * (n - 1);
}

export interface WinStreakSettings {
  enabled: boolean;
  /** Hard ceiling on the bonus paid by a single match. */
  maxBonus: number;
  /** Winning runs longer than this stop growing the bonus. */
  maxRewardedStreak: number;
}

/** Default administrative controls: the progression is on and capped at the 10th win. */
export const WIN_STREAK_DEFAULTS: WinStreakSettings = { enabled: true, maxBonus: 1280, maxRewardedStreak: 10 };

/** The bonus actually paid, after the admin caps. */
export function appliedWinStreakBonus(streak: number, settings: WinStreakSettings = WIN_STREAK_DEFAULTS) {
  if (!settings.enabled) return 0;
  const n = Math.floor(streak);
  if (!Number.isFinite(n) || n <= 1) return 0;
  const capped = Math.min(n, Math.max(1, Math.floor(settings.maxRewardedStreak)));
  return Math.min(winStreakBonus(capped), Math.max(0, settings.maxBonus));
}

/** Snake-draft by rating so both teams' totals stay as close as possible. */
export function balanceTeams(players: Player[]): [Player[], Player[]] {
  const sorted = [...players].sort((x, y) => y.rating - x.rating);
  const a: Player[] = [];
  const b: Player[] = [];
  sorted.forEach((p, i) => {
    const round = Math.floor(i / 2);
    const first = round % 2 === 0 ? a : b;
    const second = first === a ? b : a;
    (i % 2 === 0 ? first : second).push(p);
  });
  return [a, b];
}

export const avg = (ps: Player[]) => (ps.length ? ps.reduce((s, p) => s + p.rating, 0) / ps.length : 0);

export type TeamSide = "a" | "b";
export type TeamRole = "favorito" | "desafiador";

/**
 * Total MMR of each side plus who carries the favorite label.
 * The label only appears on a closed 5v5 draft, and never on an exact tie.
 */
export function matchOdds(aRatings: number[], bRatings: number[]) {
  const totalA = aRatings.reduce((s, r) => s + r, 0);
  const totalB = bRatings.reduce((s, r) => s + r, 0);
  const closed = aRatings.length === 5 && bRatings.length === 5;
  const favorite: TeamSide | null = !closed || totalA === totalB ? null : totalA > totalB ? "a" : "b";
  // Win chance comes from the five-player averages, the same way the Elo update does.
  const probA = closed ? winProbability(totalA / 5, totalB / 5) : null;
  return { totalA, totalB, margin: Math.abs(totalA - totalB), favorite, probA, probB: probA === null ? null : 1 - probA };
}

/** The favorite is the higher-MMR side; the other one is the challenger. */
export function teamRole(side: TeamSide, favorite: TeamSide | null): TeamRole | null {
  return favorite === null ? null : side === favorite ? "favorito" : "desafiador";
}

export function rankName(r: number) {
  const step = rankStep(r);
  const name = tierNames[Math.floor(step / 3)] ?? "Elite";
  return `${name} · Div ${(step % 3) + 1}`;
}

const tierNames = ["Bronze", "Prata", "Ouro", "Platina", "Diamante", "Elite"];
export const DIVISION_MMR = 100;
export function rankStep(r: number) {
  const rating = Number.isFinite(r) ? Math.max(0, r) : 0;
  return Math.min(tierNames.length * 3 - 1, Math.floor(rating / DIVISION_MMR));
}
/** Progress (0-1) inside the current division and points to the next one. */
export function tierProgress(r: number) {
  const step = rankStep(r);
  if (step === tierNames.length * 3 - 1) return { pct: 1, next: null as string | null, left: 0 };
  const lo = step * DIVISION_MMR;
  const hi = lo + DIVISION_MMR;
  return { pct: Math.min(1, Math.max(0, (r - lo) / DIVISION_MMR)), next: rankName(hi), left: hi - r };
}

export interface RankLadderEntry { tier: string; div: 1 | 2 | 3; min: number }
/** Every rank step with the MMR needed to reach it (Elite Div 3 is the cap). */
export const RANK_LADDER: RankLadderEntry[] = tierNames.flatMap((tier, ti) =>
  ([1, 2, 3] as const).map((div) => ({ tier, div, min: (ti * 3 + (div - 1)) * DIVISION_MMR })),
);

export function fmtTime(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
