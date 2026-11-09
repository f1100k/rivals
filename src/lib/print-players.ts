/** A row read from the match screenshot's statistics table. */
export type PrintPlayer = {
  gameName: string;
  siteName: string;
  goals: number;
  assists: number;
  passes: number;
  interceptions: number;
  saves: number;
  score: number;
  mvp: boolean;
};

export type PrintPerson = { id: string; name: string };

export type PrintStat = {
  user_id: string;
  goals: number;
  assists: number;
  passes: number;
  interceptions: number;
  saves: number;
  score: number;
  mvp: boolean;
};

/** Lowercase, accents and clan/symbol noise removed, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How strongly a name from the print points at a site player: 0 means unrelated. */
function nameScore(printName: string, siteName: string): number {
  const a = normalizeName(printName);
  const b = normalizeName(siteName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // "rvo.shey" -> "shey", "DRAGO LosT" -> "LosT", "undxr · ⸸Amandaa⸸" -> "undxr"
  if (short.length >= 4 && long.includes(short)) return 80;
  const at = a.split(" ");
  const bt = b.split(" ");
  const single = at.length === 1 ? at[0] : bt.length === 1 ? bt[0] : undefined;
  const other = at.length === 1 ? bt : at;
  if (single !== undefined && other.includes(single)) return 55;

  if (at.some((t) => t.length >= 3 && bt.includes(t))) return 60;
  return 0;
}

/** Finds the site player a print row belongs to, or null when nobody fits safely. */
export function matchPrintPlayer(row: PrintPlayer, people: PrintPerson[], used: Set<string>): string | null {
  let bestId: string | null = null;
  let best = 0;
  for (const p of people) {
    if (used.has(p.id) || !p.name) continue;
    const score = Math.max(nameScore(row.siteName, p.name), nameScore(row.gameName, p.name));
    if (score > best) {
      best = score;
      bestId = p.id;
    } else if (score === best && score > 0) {
      bestId = null; // two players fit equally well: leave the row unassigned
    }
  }
  return best >= 55 ? bestId : null;
}

/** A name read from any screenshot, with the AI's guess of the matching site name. */
export type PrintName = { printName: string; siteName: string };

/**
 * Links names read from a screenshot to site players. An exact site-name guess wins;
 * otherwise the same fuzzy rules as match stats apply. Each player is used at most once
 * and unmatched names come back with userId null so an admin can pick by hand.
 */
export function matchPrintNames(rows: PrintName[], people: PrintPerson[]): { printName: string; userId: string | null }[] {
  const used = new Set<string>();
  const out: { printName: string; userId: string | null }[] = [];
  for (const row of rows ?? []) {
    const printName = (row.printName ?? "").trim();
    if (!printName) continue;
    const exact = people.find((p) => !used.has(p.id) && p.name === row.siteName);
    const id = exact?.id ?? matchPrintPlayer({ gameName: printName, siteName: row.siteName ?? "", goals: 0, assists: 0, passes: 0, interceptions: 0, saves: 0, score: 0, mvp: false }, people, used);
    if (id) used.add(id);
    out.push({ printName, userId: id });
  }
  return out;
}

/** Turns print rows into per-player stats, skipping rows that no site player matches. */
export function matchPrintPlayers(people: PrintPerson[], rows: PrintPlayer[]): PrintStat[] {
  const used = new Set<string>();
  return (rows ?? []).flatMap((row) => {
    const id = matchPrintPlayer(row, people, used);
    if (!id) return [];
    used.add(id);
    return [{
      user_id: id,
      goals: row.goals,
      assists: row.assists,
      passes: row.passes,
      interceptions: row.interceptions,
      saves: row.saves,
      score: row.score,
      mvp: row.mvp,
    }];
  });
}
