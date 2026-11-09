import { supabase } from "@/integrations/supabase/client";

export type SeasonStatus = "planned" | "active" | "finished";
export type Season = {
  id: string; number: number; name: string; status: SeasonStatus;
  planned_start: string | null; planned_end: string | null; started_at: string | null; finished_at: string | null; players: number;
};
export type SeasonStats = {
  wins: number; losses: number; goals: number; assists: number; passes: number; interceptions: number;
  gk_saves: number; gk_games: number; mvps: number; likes: number; final_rank: number | null; final_rating: number;
};
export type PlayerSeason = {
  id: string; number: number; name: string; status: "active" | "finished";
  started_at: string | null; finished_at: string | null; planned_end: string | null; stats: SeasonStats | null;
};
export type SeasonTag = {
  id: string; name: string; text_color: string; background_color: string; effect: string | null; equipped: boolean;
  granted_at: string; season_id: string | null; season_number: number | null; season_name: string | null;
};
export type PlayerSeasons = { seasons: PlayerSeason[]; tags: SeasonTag[] };

export const SEASONS_KEY = ["seasons"] as const;
export const playerSeasonsKey = (id: string) => ["player-seasons", id] as const;

/** Short label shown next to a title, e.g. "S0". */
export const seasonShort = (n: number | null | undefined) => (n === null || n === undefined ? null : `S${n}`);

/** Titles of one season ("geral" = all of them). */
export function tagsOfSeason(tags: SeasonTag[], season: string) {
  return season === "geral" ? tags : tags.filter((t) => t.season_id === season);
}

/** Groups titles by season for the "Conquistas" view, newest season first, titles without season last. */
export function groupTagsBySeason(tags: SeasonTag[]) {
  const groups = new Map<string, { label: string; number: number | null; tags: SeasonTag[] }>();
  for (const t of tags) {
    const key = t.season_id ?? "none";
    const g = groups.get(key) ?? { label: t.season_name ?? "Sem season", number: t.season_number, tags: [] };
    g.tags.push(t);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
}

/** Seasons a player can look at: the running one first, then finished ones newest first. */
export function viewableSeasons<T extends Pick<Season, "status" | "number">>(seasons: T[]) {
  return seasons
    .filter((s) => s.status === "active" || s.status === "finished")
    .sort((a, b) => (a.status === "active" ? -1 : 0) - (b.status === "active" ? -1 : 0) || b.number - a.number);
}

/**
 * All-time win/loss record. Every finished season resets the profile counters,
 * so the career is the current counters plus each finished season's frozen record.
 */
export function careerRecord(current: { wins: number; losses: number }, seasons: Pick<PlayerSeason, "status" | "stats">[]) {
  return seasons.reduce(
    (acc, s) => (s.status === "finished" && s.stats ? { wins: acc.wins + s.stats.wins, losses: acc.losses + s.stats.losses } : acc),
    { wins: current.wins, losses: current.losses },
  );
}

export const nextSeasonNumber = (seasons: Pick<Season, "number">[]) => (seasons.length ? Math.max(...seasons.map((s) => s.number)) + 1 : 0);

export async function fetchSeasons(): Promise<Season[]> {
  const { data, error } = await supabase.rpc("get_seasons");
  if (error) throw error;
  return (data as unknown as Season[]) ?? [];
}

export async function fetchPlayerSeasons(id: string): Promise<PlayerSeasons> {
  const { data, error } = await supabase.rpc("get_player_seasons", { p_user: id });
  if (error) throw error;
  return (data as unknown as PlayerSeasons) ?? { seasons: [], tags: [] };
}

const ERRORS: Record<string, string> = {
  sem_permissao: "Apenas admins podem mexer nas seasons.",
  numero_invalido: "Coloque um número de season válido (0 ou mais).",
  numero_repetido: "Já existe uma season com esse número.",
  fim_antes_do_inicio: "O fim precisa ser depois do início.",
  so_season_nao_iniciada: "Só dá para apagar season que ainda não começou.",
  season_ja_iniciada: "Essa season já foi iniciada.",
  outra_season_ativa: "Já tem uma season em andamento. Finalize ela primeiro.",
  season_nao_ativa: "Essa season não está em andamento.",
  season_inexistente: "Season não encontrada.",
};
export function seasonError(e: unknown) {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) : null;
