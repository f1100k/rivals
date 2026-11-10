// Cada teste executa o ataque real contra o Supabase local, com o token de um jogador comum.
// Blocos "continua funcionando" protegem o fluxo legítimo das correções.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  admin,
  anon,
  cleanup,
  clearAvatars,
  createMatch,
  createPlayers,
  deleteMatches,
  matchRow,
  PNG_1PX,
  sql,
  statsOf,
  type Player,
} from "./fixtures";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers() }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const { aiRead } = vi.hoisted(() => ({ aiRead: vi.fn() }));
vi.mock("@/lib/ai-mock.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai-mock.server")>();
  return {
    ...real,
    mockScreenshotResponse: (...args: Parameters<typeof real.mockScreenshotResponse>) => {
      aiRead();
      return real.mockScreenshotResponse(...args);
    },
  };
});

let players: Player[];
let team: Player[];
let outsider: Player;

const STATS = (user: string, goals: number) => [{ user_id: user, goals, mvp: true }];

beforeAll(async () => {
  await cleanup();
  players = await createPlayers(13);
  team = players.slice(0, 10);
  outsider = players[10]!;
});

afterEach(deleteMatches);

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("crítico: edição do próprio perfil", () => {
  const profileOf = async (id: string) => {
    const [row] = await sql`SELECT * FROM public.profiles WHERE id = ${id}`;
    return row!;
  };

  it.each([
    ["rating", 99999],
    ["wins", 999],
    ["losses", 77],
    ["win_streak", 50],
    ["best_win_streak", 50],
    ["is_ghost", true],
    ["name", "Nome sem validar"],
  ])("não deixa o jogador alterar %s", async (column, value) => {
    const player = players[11]!;
    const before = await profileOf(player.id);
    await player.client.from("profiles").update({ [column]: value }).eq("id", player.id);
    expect((await profileOf(player.id))[column]).toEqual(before[column]);
  });

  it("não deixa o jogador remover a própria suspensão", async () => {
    const player = players[11]!;
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await sql`UPDATE public.profiles SET banned_until = ${until}, ban_reason = 'teste' WHERE id = ${player.id}`;
    await player.client
      .from("profiles")
      .update({ banned_until: null, ban_reason: null })
      .eq("id", player.id);
    const after = await profileOf(player.id);
    await sql`UPDATE public.profiles SET banned_until = NULL, ban_reason = NULL WHERE id = ${player.id}`;
    expect(after.banned_until).not.toBeNull();
    expect(after.ban_reason).toBe("teste");
  });

  it("continua funcionando: foto e posições preferidas", async () => {
    const player = players[11]!;
    const { error } = await player.client
      .from("profiles")
      .update({ avatar_url: `${player.id}/a.png`, primary_position: "Fixo", secondary_position: "Pivô" })
      .eq("id", player.id);
    expect(error).toBeNull();
    const after = await profileOf(player.id);
    expect(after.avatar_url).toBe(`${player.id}/a.png`);
    expect(after.primary_position).toBe("Fixo");
    expect(after.secondary_position).toBe("Pivô");
  });

  it("controle: o jogador não altera o perfil de outra pessoa", async () => {
    const victim = players[12]!;
    const before = await profileOf(victim.id);
    await players[11]!.client.from("profiles").update({ avatar_url: "x" }).eq("id", victim.id);
    expect((await profileOf(victim.id)).avatar_url).toEqual(before.avatar_url);
  });
});

describe("alto: cancelar fila ou partida por rota exposta", () => {
  it("participante não apaga a partida em andamento com match_decline", async () => {
    const match = await createMatch(team, { status: "room" });
    await team[0]!.client.rpc("match_decline", { p_match_id: match });
    expect((await matchRow(match))?.status).toBe("room");
  });

  it.each([
    ["anônimo", () => anon],
    ["jogador logado", () => outsider.client],
  ])("%s não drena a fila com try_matchmake", async (_who, caller) => {
    const queued = players.slice(0, 10);
    await sql`DELETE FROM public.queue WHERE user_id = ANY(${queued.map((p) => p.id)})`;
    for (const player of queued)
      await sql`INSERT INTO public.queue (user_id, mode, region, position) VALUES (${player.id}, 5, 'ZZ', 'Ala')`;
    await caller().rpc("try_matchmake");
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM public.queue WHERE region = 'ZZ'`;
    await sql`DELETE FROM public.match_players WHERE user_id = ANY(${queued.map((p) => p.id)})`;
    await sql`DELETE FROM public.matches WHERE region = 'ZZ'`;
    await sql`DELETE FROM public.queue WHERE region = 'ZZ'`;
    expect(count).toBe(10);
  });

  it.each([
    ["match_cleanup", {}],
    ["match_accept", { p_match_id: "00000000-0000-0000-0000-000000000000" }],
    ["match_decline", { p_match_id: "00000000-0000-0000-0000-000000000000" }],
    ["match_report", { p_match_id: "00000000-0000-0000-0000-000000000000", p_score_a: 1, p_score_b: 0 }],
    ["vote_match", { p_side: "a" }],
    ["join_queue", { p_mode: 5, p_region: "SA" }],
    ["leave_queue", {}],
  ])("RPC legada %s não é executável por clientes", async (fn, args) => {
    const { error } = await outsider.client.rpc(fn, args);
    expect(error?.code).toBe("42501");
  });

  it("controle: evento sem assinatura no webhook do Discord é recusado", async () => {
    const { handleQueueInteraction } = await import("@/lib/discord-queue.server");
    const request = new Request("http://localhost/api/public/discord/interactions", {
      method: "POST",
      body: JSON.stringify({ type: 3, data: { custom_id: "queue:leave" } }),
    });
    const response = await handleQueueInteraction(request, "key", "connection");
    expect(response.status).toBe(401);
  });
});

describe("alto: finalizar sem print aprovado ou travar em disputa", () => {
  it("seis votos em vote_match não finalizam sem print", async () => {
    const match = await createMatch(team, { status: "room" });
    for (const player of team.slice(0, 6)) await player.client.rpc("vote_match", { p_side: "a" });
    expect((await matchRow(match))?.status).not.toBe("completed");
  });

  it("report_result_gk mais cinco confirmações não finalizam sem print", async () => {
    const match = await createMatch(team, { status: "room" });
    await team[0]!.client.rpc("report_result_gk", { p_a: 9, p_b: 0 });
    for (const player of team.slice(1, 6)) await player.client.rpc("confirm_result_gk", { p_ok: true });
    expect((await matchRow(match))?.status).not.toBe("completed");
  });

  it("confirmações não finalizam com print ainda não aprovado", async () => {
    const match = await createMatch(team, {
      status: "room",
      print: { by: team[0]!.id, scoreA: 3, scoreB: 1, approved: false },
    });
    await team[0]!.client.rpc("report_result_gk", { p_a: 3, p_b: 1 });
    for (const player of team.slice(1, 6)) await player.client.rpc("confirm_result_gk", { p_ok: true });
    expect((await matchRow(match))?.status).not.toBe("completed");
  });

  it("confirmações não finalizam com placar diferente do print aprovado", async () => {
    const match = await createMatch(team, {
      status: "room",
      print: { by: team[0]!.id, scoreA: 3, scoreB: 1, approved: true },
    });
    await team[0]!.client.rpc("report_result_gk", { p_a: 0, p_b: 9 });
    for (const player of team.slice(1, 6)) await player.client.rpc("confirm_result_gk", { p_ok: true });
    expect((await matchRow(match))?.status).not.toBe("completed");
  });

  it("um jogador sozinho não trava a partida em disputa", async () => {
    const match = await createMatch(team, { status: "room" });
    await team[0]!.client.rpc("report_result_gk", { p_a: 3, p_b: 1 });
    await team[1]!.client.rpc("confirm_result_gk", { p_ok: false });
    expect((await matchRow(match))?.status).not.toBe("disputed");
  });

  it("continua funcionando: seis recusas levam a partida para disputa", async () => {
    const match = await createMatch(team, { status: "room" });
    await team[0]!.client.rpc("report_result_gk", { p_a: 3, p_b: 1 });
    for (const player of team.slice(1, 7)) await player.client.rpc("confirm_result_gk", { p_ok: false });
    expect((await matchRow(match))?.status).toBe("disputed");
  });

  it("continua funcionando: confirmações com print aprovado e mesmo placar finalizam", async () => {
    const match = await createMatch(team, {
      status: "room",
      print: { by: team[0]!.id, scoreA: 3, scoreB: 1, approved: true },
    });
    await team[0]!.client.rpc("report_result_gk", { p_a: 3, p_b: 1 });
    for (const player of team.slice(1, 6)) await player.client.rpc("confirm_result_gk", { p_ok: true });
    expect((await matchRow(match))?.status).toBe("completed");
  });

  it("continua funcionando: votos no vencedor com print aprovado finalizam", async () => {
    const match = await createMatch(team, {
      status: "room",
      print: { by: team[0]!.id, scoreA: 3, scoreB: 1, approved: true },
    });
    for (const player of team.slice(0, 6)) {
      const { error } = await player.client.rpc("vote_result_gk", { p_side: "a" });
      expect(error).toBeNull();
    }
    expect((await matchRow(match))?.status).toBe("completed");
  });
});

describe("alto: reescrever a print e as estatísticas", () => {
  const printBy = (uploader: Player, approved = false) => ({
    by: uploader.id,
    scoreA: 3,
    scoreB: 1,
    approved,
  });

  it.each(["completed", "voting"])("autor não reescreve estatísticas com a partida em %s", async (status) => {
    const author = team[0]!;
    const match = await createMatch(team, { status, print: printBy(author, status === "completed") });
    await sql`INSERT INTO public.match_player_stats (match_id, user_id, goals, mvp) VALUES (${match}, ${author.id}, 1, false)`;
    await author.client.rpc("set_screenshot_stats_gk", {
      p_match: match,
      p_stats: STATS(author.id, 50),
    });
    expect(await statsOf(match, author.id)).toMatchObject({ goals: 1, mvp: false });
  });

  it("jogador não grava estatísticas inventadas chamando a RPC direto", async () => {
    const author = team[0]!;
    const match = await createMatch(team, { status: "voting", print: printBy(author) });
    await author.client.rpc("set_screenshot_stats_gk", {
      p_match: match,
      p_stats: STATS(author.id, 50),
    });
    expect(await statsOf(match, author.id)).toBeUndefined();
  });

  it("jogador não define placar inventado chamando a RPC direto", async () => {
    const match = await createMatch(team, { status: "room" });
    await team[0]!.client.rpc("set_screenshot_score_gk", {
      p_match: match,
      p_mine: 9,
      p_theirs: 0,
      p_path: `${match}/qualquer.png`,
    });
    expect((await matchRow(match))?.shot_by).toBeNull();
  });

  describe("gravação pelo servidor", () => {
    const write = (user: string, match: string, goals = 5) =>
      admin.rpc("set_screenshot_stats_gk", {
        p_user: user,
        p_match: match,
        p_stats: STATS(user, goals),
      });

    it("grava uma vez para o autor da print", async () => {
      const author = team[0]!;
      const match = await createMatch(team, { status: "voting", print: printBy(author) });
      expect((await write(author.id, match)).error).toBeNull();
      expect(await statsOf(match, author.id)).toMatchObject({ goals: 5, mvp: true });
    });

    it("não sobrescreve estatísticas já gravadas", async () => {
      const author = team[0]!;
      const match = await createMatch(team, { status: "voting", print: printBy(author) });
      await write(author.id, match);
      expect((await write(author.id, match, 50)).error?.message).toContain("estatisticas_ja_enviadas");
      expect(await statsOf(match, author.id)).toMatchObject({ goals: 5 });
    });

    it("recusa quem não é o autor da print", async () => {
      const match = await createMatch(team, { status: "voting", print: printBy(team[0]!) });
      expect((await write(team[1]!.id, match)).error?.message).toContain("sem_permissao");
    });

    it("recusa depois da print aprovada", async () => {
      const author = team[0]!;
      const match = await createMatch(team, { status: "voting", print: printBy(author, true) });
      expect((await write(author.id, match)).error?.message).toContain("print_ja_aprovado");
    });

    it.each(["completed", "cancelled"])("recusa com a partida em %s", async (status) => {
      const author = team[0]!;
      const match = await createMatch(team, { status, print: printBy(author) });
      expect((await write(author.id, match)).error?.message).toContain("partida_encerrada");
    });
  });
});

describe("médio: código da sala só para jogadores logados", () => {
  const CODE = "482913";

  async function roomWithCode() {
    const match = await createMatch(team, { status: "room" });
    await sql`UPDATE public.matches SET room_code = ${CODE} WHERE id = ${match}`;
    return match;
  }

  it("anônimo não lê o código da sala", async () => {
    const match = await roomWithCode();
    const { data } = await anon.from("matches").select("room_code").eq("id", match);
    expect(data ?? []).toEqual([]);
  });

  it("anônimo não recebe o código ao pedir todas as colunas", async () => {
    const match = await roomWithCode();
    const { data } = await anon.from("matches").select("*").eq("id", match);
    expect(data ?? []).toEqual([]);
  });

  it("anônimo não descobre o código filtrando por ele", async () => {
    const match = await roomWithCode();
    const { data } = await anon.from("matches").select("id").eq("id", match).eq("room_code", CODE);
    expect(data ?? []).toEqual([]);
  });

  it("continua funcionando: jogador logado lê o código, mesmo sem jogar a partida", async () => {
    const match = await roomWithCode();
    const { data, error } = await outsider.client.from("matches").select("room_code").eq("id", match);
    expect(error).toBeNull();
    expect(data).toEqual([{ room_code: CODE }]);
  });

  it("continua funcionando: histórico público de partidas sem login", async () => {
    const match = await createMatch(team, { status: "completed" });
    const { fetchMatches } = await import("@/lib/inhouse.functions");
    const handler = fetchMatches as unknown as (input: { data: object }) => Promise<{ id: string }[]>;
    expect((await handler({ data: {} })).map((row) => row.id)).toContain(match);
  });
});

describe("médio: leitura de dados de moderação", () => {
  it.each([
    ["anônimo", () => anon],
    ["jogador logado", () => outsider.client],
  ])("%s não lê o motivo e o prazo de suspensão de ninguém", async (_who, caller) => {
    const target = players[12]!;
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await sql`UPDATE public.profiles SET banned_until = ${until}, ban_reason = 'motivo interno' WHERE id = ${target.id}`;
    const { data } = await caller()
      .from("profiles")
      .select("ban_reason, banned_until")
      .eq("id", target.id);
    await sql`UPDATE public.profiles SET banned_until = NULL, ban_reason = NULL WHERE id = ${target.id}`;
    expect(data ?? []).toEqual([]);
  });

  it("continua funcionando: colunas públicas do ranking", async () => {
    const { data, error } = await anon
      .from("profiles")
      .select("id, name, rating, wins, losses, avatar_url, is_ghost")
      .eq("id", outsider.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it.each(["mod_actions", "user_roles", "prize_payouts", "discord_links", "player_report_state", "rating_history"])(
    "controle: anônimo não lê %s",
    async (table) => {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    },
  );

  it.each([
    ["get_admin_overview", {}],
    ["get_admin_player_reports", {}],
  ])("controle: jogador comum não executa %s", async (fn, args) => {
    const { error } = await outsider.client.rpc(fn, args);
    expect(error).not.toBeNull();
  });
});

describe("médio: envio de imagens em massa", () => {
  const png = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

  async function callRead(player: Player, matchId: string) {
    const { readScreenshotScore } = await import("@/lib/screenshot-score.functions");
    const handler = readScreenshotScore as unknown as (input: {
      data: { matchId: string; image: string };
      context: { supabase: Player["client"]; userId: string };
    }) => Promise<{ mine: number; theirs: number; matched: number }>;
    return handler({ data: { matchId, image: PNG_1PX }, context: { supabase: player.client, userId: player.id } });
  }

  beforeEach(async () => {
    aiRead.mockClear();
    await clearAvatars(outsider.id);
    await sql`DELETE FROM public.screenshot_read_attempts`.catch(() => undefined);
  });

  it("quem não jogou a partida não aciona a leitura por IA", async () => {
    const match = await createMatch(team, { status: "room" });
    await expect(callRead(outsider, match)).rejects.toThrow("Só quem jogou a partida pode mandar o print.");
    expect(aiRead).not.toHaveBeenCalled();
  });

  it("partida encerrada não aciona a leitura por IA", async () => {
    const match = await createMatch(team, { status: "cancelled" });
    await expect(callRead(team[0]!, match)).rejects.toThrow();
    expect(aiRead).not.toHaveBeenCalled();
  });

  it("limita as leituras por jogador", async () => {
    const match = await createMatch(team, { status: "room" });
    const player = team[0]!;
    for (let i = 0; i < 5; i++) {
      const { error } = await player.client.rpc("claim_screenshot_read_gk", { p_match: match });
      expect(error).toBeNull();
    }
    await expect(callRead(player, match)).rejects.toThrow(/muitas/i);
    expect(aiRead).not.toHaveBeenCalled();
  });

  it("continua funcionando: participante envia a print e as estatísticas são gravadas", async () => {
    const player = team[0]!;
    const match = await createMatch(team, { status: "room" });
    const result = await callRead(player, match);
    expect(aiRead).toHaveBeenCalledOnce();
    expect(result.matched).toBe(10);
    const row = await matchRow(match);
    expect(row?.shot_by).toBe(player.id);
    expect(row?.shot_approved).toBe(false);
    const prints = admin.storage.from("match-prints");
    const { data: files } = await prints.list(match);
    await prints.remove((files ?? []).map((file) => `${match}/${file.name}`));
  });

  it("avatar acima do tamanho é recusado", async () => {
    const { error } = await outsider.client.storage
      .from("avatars")
      .upload(`${outsider.id}/grande.png`, png(6 * 1024 * 1024), { contentType: "image/png" });
    expect(error?.message).toMatch(/maximum allowed size/i);
  });

  it("arquivo que não é imagem é recusado", async () => {
    const { error } = await outsider.client.storage
      .from("avatars")
      .upload(`${outsider.id}/pagina.html`, new Blob(["<script>"], { type: "text/html" }), {
        contentType: "text/html",
      });
    expect(error?.message).toMatch(/mime type/i);
  });

  it("limita a quantidade de envios por hora", async () => {
    const bucket = outsider.client.storage.from("avatars");
    for (let i = 0; i < 20; i++) {
      const { error } = await bucket.upload(`${outsider.id}/f${i}.png`, png(16), { contentType: "image/png" });
      expect(error).toBeNull();
    }
    const { error } = await bucket.upload(`${outsider.id}/extra.png`, png(16), { contentType: "image/png" });
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("controle: jogador não envia para a pasta de outra pessoa", async () => {
    const { error } = await outsider.client.storage
      .from("avatars")
      .upload(`${team[0]!.id}/invasao.png`, png(16), { contentType: "image/png" });
    expect(error?.message).toMatch(/row-level security/i);
  });
});
