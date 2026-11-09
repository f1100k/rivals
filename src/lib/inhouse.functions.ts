import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validatePositions, type PlayerProfile } from "./player-profile";
import type { WinStreakSettings } from "./inhouse";
import type { MatchKick } from "./match-kick";
import { isValidRoomCode, ROOM_CODE_ERROR } from "./room-code";

export type Mode = 3 | 4 | 5;
export type Region = "SA" | "NA" | "EU";

export interface Me {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  avatar_url?: string | null;
}

export interface QueueEntry {
  mode: Mode;
  region: Region;
  joinedAt: string;
}

export interface MatchPlayer {
  userId: string;
  name: string;
  rating: number;
  team: "a" | "b" | null;
  accepted: boolean;
  delta: number | null;
  isMe: boolean;
}

export interface ActiveMatch {
  id: string;
  mode: Mode;
  region: Region;
  status: "ready" | "lobby" | "completed" | "cancelled";
  deadline: string | null;
  scoreA: number | null;
  scoreB: number | null;
  createdAt: string;
  players: MatchPlayer[];
}

export interface HistoryMatch {
  id: string;
  mode: Mode;
  region: Region;
  scoreA: number | null;
  scoreB: number | null;
  createdAt: string;
  players: { name: string; team: string; delta: number | null }[];
}

export interface InhouseState {
  me: Me | null;
  queue: QueueEntry | null;
  queueCount: number;
  match: ActiveMatch | null;
  history: HistoryMatch[];
}

// ============ Estado (protegido: só com sessão) ============

export const getInhouseState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_inhouse_state");
    if (error) throw new Error(error.message);
    return data as unknown as InhouseState;
  });

export const renameProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("rename_profile", { p_name: data.name });
    if (error) {
      const msg = error.message.includes("invalid_name")
        ? "O nick precisa ter entre 2 e 20 caracteres."
        : error.message;
      throw new Error(msg);
    }
    return true;
  });

// ============ Leituras públicas (ranking e histórico) ============

export interface RankingRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  avatar_url: string | null;
}

export interface PublicMatch {
  id: string;
  mode: Mode;
  region: Region;
  scoreA: number | null;
  scoreB: number | null;
  createdAt: string;
  players: { userId?: string; name: string; team: string; delta: number | null }[];
}

function makePublicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Opaque sb_ keys aren't JWTs; send only apikey, never the bearer.
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Optional season id; null/absent = the season running now. */
const validateSeason = (input: { season?: string | null } | undefined) => {
  const season = input?.season ?? null;
  if (season !== null && !UUID_RE.test(season)) throw new Error("Season inválida.");
  return { season };
};

/** Ranking of the season running now (only who already played in it), or the frozen final ranking of a finished season. */
export const fetchRanking = createServerFn({ method: "GET" }).inputValidator(validateSeason).handler(async ({ data: input }) => {
  const client = makePublicClient();
  if (input.season) {
    const { data, error } = await client.rpc("get_season_ranking", { p_season: input.season });
    if (error) return [] as RankingRow[];
    return (data ?? []) as unknown as RankingRow[];
  }
  const { data, error } = await client
    .from("profiles")
    .select("id, name, rating, wins, losses, avatar_url")
    .eq("is_ghost", false)
    .or("wins.gt.0,losses.gt.0")
    .order("rating", { ascending: false })
    .order("wins", { ascending: false })
    .limit(100);
  if (error) return [] as RankingRow[];
  return data as RankingRow[];
});

export type StatLeader = { id: string; name: string; avatar_url: string | null; games: number; goals: number; assists: number; passes: number; interceptions: number; saves: number; gk_saves: number; gk_games: number; mvps: number };

export const fetchStatLeaders = createServerFn({ method: "GET" }).inputValidator(validateSeason).handler(async ({ data: input }) => {
  const client = makePublicClient();
  const { data, error } = await client.rpc("get_stat_leaders", input.season ? { p_season: input.season } : {});
  if (error) return [] as StatLeader[];
  return (data ?? []) as unknown as StatLeader[];
});

export const searchPlayers = createServerFn({ method: "GET" })
  .inputValidator((input: { search: string }) => ({ search: input.search.trim().slice(0, 80) }))
  .handler(async ({ data }) => {
    const client = makePublicClient();
    const term = data.search.replace(/[\\%_]/g, "\\$&");
    const { data: players, error } = await client.from("profiles")
      .select("id, name, rating, wins, losses, avatar_url")
      .eq("is_ghost", false).ilike("name", `%${term}%`).order("rating", { ascending: false }).limit(50);
    if (error) throw new Error("Não consegui pesquisar os jogadores.");
    return players as RankingRow[];
  });

export const getPlayerProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) throw new Error("Jogador inválido.");
    return input;
  })
  .handler(async ({ data }) => {
    const client = makePublicClient();
    const { data: profile, error } = await client.rpc("get_player_profile", { p_user: data.id });
    if (error) throw new Error("Não consegui carregar o perfil.");
    return profile as unknown as PlayerProfile | null;
  });

export const savePlayerPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validatePositions)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles")
      .update({ primary_position: data.primary, secondary_position: data.secondary }).eq("id", context.userId);
    if (error) throw new Error("Não consegui salvar suas posições.");
    return true;
  });

export const fetchMatches = createServerFn({ method: "GET" }).inputValidator(validateSeason).handler(async ({ data: input }) => {
  const client = makePublicClient();
  const { data: bounds } = await client.rpc("season_bounds", { p_season: input.season as string });
  const window = (bounds as { from_at: string; to_at: string }[] | null)?.[0];
  let query = client
    .from("matches")
    .select(
      "id, mode, region, scoreA:shot_score_a, scoreB:shot_score_b, createdAt:created_at, players:match_players(user_id, profiles(name), team, delta)",
    )
    .eq("status", "completed");
  if (window && window.from_at !== "-infinity") query = query.gte("created_at", window.from_at);
  if (window && window.to_at !== "infinity") query = query.lt("created_at", window.to_at);
  const { data, error } = await query
    .order("completed_at", { ascending: false })
    .limit(30);
  if (error) return [] as PublicMatch[];
  const raw = data as unknown as {
    id: string;
    mode: number;
    region: string;
    scoreA: number | null;
    scoreB: number | null;
    createdAt: string;
    players: { user_id: string; profiles: { name: string } | null; team: string; delta: number | null }[];
  }[];
  return raw.map((m) => ({
    id: m.id,
    mode: m.mode as PublicMatch["mode"],
    region: m.region as PublicMatch["region"],
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    createdAt: m.createdAt,
    players: m.players.map((p) => ({ userId: p.user_id, name: p.profiles?.name ?? "?", team: p.team, delta: p.delta })),
  }));
});

// ============ Fluxo 5v5 com goleiros (fila online) ============

export type GamePosition = "Goleiro" | "Pivô" | "Ala" | "Fixo";
export const gamePositions: GamePosition[] = ["Goleiro", "Pivô", "Ala", "Fixo"];

export interface GkMatchPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  position: GamePosition;
  primaryPosition: GamePosition | null;
  secondaryPosition: GamePosition | null;
  team: "a" | "b" | null;
  vote: "a" | "b" | null;
  cancelVote: boolean;
  confirm: boolean | null;
  isMe: boolean;
  isCaptain: boolean;
}

export interface GkMatch {
  kick?: MatchKick | null;
  vacancies?: number;
  id: string;
  status: "draft" | "room" | "voting" | "reporting" | "disputed";
  reportA: number | null;
  reportB: number | null;
  reportedBy: string | null;
  roomCode: string | null;
  createdAt: string;
  captainA: string | null;
  captainB: string | null;
  players: GkMatchPlayer[];
}

export interface GkLastResult {
  scoreA: number | null;
  scoreB: number | null;
  players: {
    name: string;
    team: string;
    delta: number | null;
    /** Elo part of the change, before the winning-run bonus. */
    elo: number | null;
    /** Extra MMR paid by the winning run. */
    bonus: number | null;
    before: number | null;
    after: number | null;
  }[];
}

export interface GkCounts {
  total: number;
  goalkeepers: number;
  outfield: number;
}

export interface GkQueuePlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  position: GamePosition;
  joinedAt: string;
  isMe: boolean;
}

export interface GkState {
  lastRemoval?: { id: string; matchId: string } | null;
  me: (Me & { isStaff?: boolean }) | null;
  queue: { position: GamePosition; joinedAt: string } | null;
  counts: GkCounts;
  /** People waiting in the same queue pool; only sent while the caller is queued. */
  queuePlayers?: GkQueuePlayer[];
  match: GkMatch | null;
  lastResult: GkLastResult | null;
  /** True while the caller is in the admin-only test queue or a test match. */
  testMode?: boolean;
}

export interface GkDraftInfo {
  deadline: string | null;
  turn: "a" | "b";
  picksLeft: number;
  /** "gk" while the captains are still picking goalkeepers, "line" afterwards. */
  phase?: "gk" | "line";
}

export const getInhouseStateGk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Mark me online in the queue and drop players offline for 5+ minutes.
    // One round trip: heartbeat, draft tick, then state read, in that order inside the DB.
    const { data, error } = await context.supabase.rpc("poll_inhouse_gk");
    if (error) throw new Error(error.message);
    const res = data as unknown as { state: GkState; draft: GkDraftInfo | null };
    return { ...res.state, draft: res.draft ?? null };
  });

export const joinQueueGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { position: GamePosition; test?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = data.test
      ? await context.supabase.rpc("join_test_queue_gk", { p_position: data.position })
      : await context.supabase.rpc("join_queue_gk", { p_position: data.position });
    if (error) {
      const msg = error.message.includes("invalid_position") ? "Posição inválida." : error.message.includes("finalize_partida_atual") ? "Finalize sua partida atual (votação e print das estatísticas) antes de entrar em outra fila." : error.message;
      throw new Error(msg);
    }
    return ok;
  });

export const leaveQueueGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("leave_queue_gk");
    if (error) throw new Error(error.message.includes("finalize_partida_atual") ? "Sua partida continua aberta até a votação e o print das estatísticas." : error.message);
    return true;
  });

export const draftPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { target: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("draft_pick", { p_target: data.target });
    if (error) {
      const msg = error.message.includes("nao_e_sua_vez")
        ? "Aguarde a vez do seu capitão."
        : error.message.includes("jogador_indisponivel")
          ? "Jogador indisponível."
          : error.message.includes("escolha_goleiro")
            ? "Agora é a escolha dos goleiros: escolha um goleiro."
            : error.message.includes("escolha_linha")
              ? "Os goleiros já foram escolhidos. Escolha um jogador de linha."
              : error.message;
      throw new Error(msg);
    }
    return ok;
  });

export const setRoomCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = String(input?.code ?? "").trim();
    if (!isValidRoomCode(code)) throw new Error(ROOM_CODE_ERROR);
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("set_room_code", { p_code: data.code });
    if (error) {
      const msg = error.message.includes("invalid_code") ? ROOM_CODE_ERROR : error.message;
      throw new Error(msg);
    }
    return ok;
  });

export const voteMatchGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { side: "a" | "b" }) => input)
  .handler(async ({ data, context }) => {
    const { data: status, error } = await context.supabase.rpc("vote_result_gk", { p_side: data.side });
    if (error) {
      const msg = error.message.includes("retire_voto_atual") ? "Retire seu voto atual antes de escolher outra opção." : error.message.includes("ja_votou") ? "Você já votou." : error.message;
      throw new Error(msg);
    }
    if (status === "completed") {
      const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
      const voice = cleanupFinishedVoiceSafely().catch(() => undefined);
      const { data: last } = await context.supabase
        .from("match_players")
        .select("match_id, matches!inner(status, completed_at)")
        .eq("user_id", context.userId)
        .eq("matches.status", "completed")
        .order("completed_at", { referencedTable: "matches", ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.match_id) {
        const { publishResult } = await import("@/lib/discord.server");
        await publishResult(last.match_id).catch(() => undefined);
        const { data: shot } = await context.supabase.from("matches").select("shot_path").eq("id", last.match_id).maybeSingle();
        if (shot?.shot_path) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.storage.from("match-prints").remove([shot.shot_path]).catch(() => undefined);
        }
      }
      await voice;
    }
    return status;
  });

export const voteCancelMatchGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok, error } = await context.supabase.rpc("vote_cancel_match_gk");
    if (error) throw new Error(error.message.includes("retire_voto_atual") ? "Retire seu voto atual antes de escolher outra opção." : error.message.includes("aguarde_fim_draft") ? "Aguarde os goleiros terminarem as escolhas." : error.message.includes("ja_votou_cancelar") ? "Você já votou para cancelar." : error.message);
    if (ok === "cancelled") {
      const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
      await cleanupFinishedVoiceSafely();
    }
    return ok;
  });

export const withdrawMatchVoteGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("withdraw_match_vote_gk");
    if (error) throw new Error(error.message.includes("sem_partida_ativa") ? "Essa partida já foi encerrada." : error.message.includes("aguarde_fim_draft") ? "Aguarde os goleiros terminarem as escolhas." : error.message);
    return data;
  });

const friendly = (m: string) =>
  m.includes("empate_nao_permitido") ? "Empate não é permitido."
  : m.includes("placar_invalido") ? "Placar inválido."
  : m.includes("partida_ja_finalizada") ? "Essa partida já foi finalizada."
  : m.includes("sem_permissao") ? "Você não tem permissão."
  : m.includes("jogador_suspenso") ? "Você está suspenso e não pode entrar na fila."
  : m.includes("nao_pode_banir_admin") ? "Não dá pra suspender um administrador."
  : m;

export const reportResultGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { a: number; b: number }) => ({ a: Math.trunc(Number(input.a)), b: Math.trunc(Number(input.b)) }))
  .handler(async ({ data, context }) => {
    const { data: status, error } = await context.supabase.rpc("report_result_gk", { p_a: data.a, p_b: data.b });
    if (error) throw new Error(friendly(error.message));
    return status;
  });

export const confirmResultGk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ok: boolean }) => ({ ok: input.ok === true }))
  .handler(async ({ data, context }) => {
    const { data: status, error } = await context.supabase.rpc("confirm_result_gk", { p_ok: data.ok });
    if (error) throw new Error(friendly(error.message));
    if (status === "completed") {
      const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
      await cleanupFinishedVoiceSafely();
    }
    return status;
  });

export interface AdminOverview {
  isAdmin: boolean;
  stats: { users: number; queue: number; live: number; reporting: number; disputed: number };
  matches: { id: string; status: string; reportA: number | null; reportB: number | null; reportedBy: string | null; createdAt: string; roomCode?: string | null; completedAt?: string | null; players: { userId?: string; name: string; team: string | null; confirm: boolean | null; vote?: string | null; cancelVote?: boolean; position?: string | null; isGhost?: boolean }[] }[];
  queue: { userId: string; name: string; position: string; joinedAt: string }[];
  users: { id: string; name: string; rating: number; bannedUntil: string | null; banReason: string | null; isGhost: boolean; roles: string[] }[];
  actions: { action: string; reason: string | null; createdAt: string; actor: string | null; target: string | null }[];
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_admin_control_overview");
    if (error) throw new Error(friendly(error.message));
    return data as unknown as AdminOverview;
  });

type AdminAction =
  | { kind: "resolve"; match: string; a: number; b: number; reason: string }
  | { kind: "cancel"; match: string; reason: string }
  | { kind: "void"; match: string; reason: string }
  | { kind: "ban"; user: string; hours: number; reason: string }
  | { kind: "kick"; user: string; reason: string }
  | { kind: "role"; user: string; role: "admin" | "moderator"; on: boolean };

export const adminAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminAction) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const r =
      data.kind === "resolve" ? await sb.rpc("admin_resolve_match", { p_match: data.match, p_a: data.a, p_b: data.b, p_reason: data.reason })
      : data.kind === "cancel" ? await sb.rpc("admin_cancel_match", { p_match: data.match, p_reason: data.reason })
      : data.kind === "void" ? await sb.rpc("admin_void_match", { p_match: data.match, p_reason: data.reason })
      : data.kind === "ban" ? await sb.rpc("admin_ban", { p_user: data.user, p_hours: data.hours, p_reason: data.reason })
      : data.kind === "kick" ? await sb.rpc("admin_kick_queue", { p_user: data.user, p_reason: data.reason })
      : await sb.rpc("admin_set_role", { p_user: data.user, p_role: data.role, p_on: data.on });
    if (r.error) throw new Error(friendly(r.error.message));
    if (data.kind === "resolve" || data.kind === "cancel") {
      const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
      await cleanupFinishedVoiceSafely();
    }
    if (data.kind === "resolve") {
      const { publishResult } = await import("@/lib/discord.server");
      await publishResult(data.match);
    }
    return true;
  });

// ============ Controles do bônus de sequência (admin) ============

export const getWinStreakSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_win_streak_settings");
    if (error) throw new Error("Não consegui carregar as regras do bônus de vitórias.");
    return data as unknown as WinStreakSettings;
  });

export const setWinStreakSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: WinStreakSettings) => ({
    enabled: input.enabled === true,
    maxBonus: Math.trunc(Number(input.maxBonus)),
    maxRewardedStreak: Math.trunc(Number(input.maxRewardedStreak)),
  }))
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase.rpc("set_win_streak_settings", {
      p_enabled: data.enabled,
      p_max_bonus: data.maxBonus,
      p_max_streak: data.maxRewardedStreak,
    });
    if (error) {
      const msg = error.message.includes("sem_permissao")
        ? "Somente administradores podem mudar o bônus de vitórias."
        : error.message.includes("bonus_invalido")
          ? "O bônus máximo precisa estar entre 0 e 100000."
          : error.message.includes("sequencia_invalida")
            ? "A sequência premiada precisa ter entre 1 e 100 vitórias."
            : error.message;
      throw new Error(msg);
    }
    return saved as unknown as WinStreakSettings;
  });
