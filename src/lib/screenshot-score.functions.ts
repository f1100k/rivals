import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchPrintPlayers } from "@/lib/print-players";


const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    found: { type: "boolean" },
    result: { type: "string", enum: ["vitoria", "derrota", "desconhecido"] },
    left: { type: "integer" },
    right: { type: "integer" },
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          gameName: { type: "string" },
          siteName: { type: "string" },
          goals: { type: "integer" },
          assists: { type: "integer" },
          passes: { type: "integer" },
          interceptions: { type: "integer" },
          saves: { type: "integer" },
          score: { type: "integer" },
          mvp: { type: "boolean" },
        },
        required: ["gameName", "siteName", "goals", "assists", "passes", "interceptions", "saves", "score", "mvp"],
      },
    },
  },
  required: ["found", "result", "left", "right", "players"],
};

const PROMPT = `Esta é uma captura de tela da tela final de uma partida do jogo de futebol Rematch.
No topo há o resultado de quem tirou o print ("VITÓRIA" ou "DERROTA") e o placar oficial no formato "X  tempo  Y" (ex.: "3  06:23  2").
Use SOMENTE o placar do topo (não some os gols da tabela).
Responda: found=true se achou o placar; result = vitoria/derrota/desconhecido; left = número à esquerda do tempo; right = número à direita.
Se não for uma tela de resultado do jogo, found=false e left=right=0.
Também leia a tabela de cada jogador (as duas equipes): gameName = nome no jogo; colunas Gol, Assistência, Passe, Interceptação, Defesa, Pontuação; mvp=true para quem tem o selo MVP.
Mapeie as colunas explicitamente: Gol → goals; Assistência → assists; Passe → passes; Interceptação → interceptions; Defesa ou Defesas → saves; Pontuação → score.
Defesa/Defesas e Save/GK são a MESMA estatística: copie o número da coluna Defesa para saves. Não procure outra coluna de Save/GK, não confunda defesa com interceptação e não some os dois nomes como estatísticas separadas. Se a coluna estiver intitulada Save/GK ou Saves, use esse mesmo valor em saves uma única vez.
siteName: escolha da lista de jogadores do site abaixo o nome que corresponde a esse jogador (nomes podem ter prefixo de clã, maiúsculas ou pequenas diferenças). Se nenhum corresponder com segurança, siteName = "".`;

/** Reads the final score from a match screenshot and stores it for the caller's match. */
export const readScreenshotScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string; image: string }) => {
    if (typeof input.image !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(input.image)) throw new Error("Envie uma imagem PNG, JPG ou WEBP.");
    if (input.image.length > 8_000_000) throw new Error("Imagem muito grande (máx. ~6MB).");
    return { matchId: String(input.matchId), image: input.image };
  })
  .handler(async ({ data, context }) => {
    // Only one print per match is accepted: refuse before spending an AI read.
    const { data: already } = await context.supabase.from("matches").select("shot_score_a, status").eq("id", data.matchId).maybeSingle();
    if (already?.shot_score_a != null || already?.status === "completed") throw new Error("A print dessa partida já foi enviada e contabilizada.");
    const { data: roster } = await context.supabase
      .from("match_players")
      .select("user_id, profiles(name)")
      .eq("match_id", data.matchId);
    const people = ((roster ?? []) as unknown as { user_id: string; profiles: { name: string } | null }[]).map((r) => ({ id: r.user_id, name: r.profiles?.name ?? "" }));
    const { aiMockEnabled, mockScreenshotResponse } = await import("@/lib/ai-mock.server");
    const mock = aiMockEnabled() ? await mockScreenshotResponse(data.matchId, context.userId, people) : null;
    const key = process.env["LOVABLE_API_KEY"];
    if (!key && !mock) throw new Error("Leitura de print indisponível no momento.");
    const res = mock ?? await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key!, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "placar", strict: true, schema: SCHEMA } },
        input: [{ role: "user", content: [{ type: "input_text", text: `${PROMPT}\nJogadores do site: ${people.map((p) => JSON.stringify(p.name)).join(", ")}` }, { type: "input_image", image_url: data.image }] }],
      }),
    });
    if (!res.ok || !res.body) {
      console.error("screenshot score", res.status, await res.text().catch(() => ""));
      throw new Error(res.status === 402 || res.status === 403 ? "Sem créditos de IA para ler o print agora." : res.status === 429 ? "Muitas leituras agora, tente de novo em instantes." : "Não consegui ler o print.");
    }
    // Consume SSE until the stream ends, collecting output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let done = "";
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          if (ev.type === "response.output_text.done") done = ev.text ?? "";
          if (ev.type === "error" || ev.type === "response.failed") throw new Error("Não consegui ler o print.");
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Não")) throw e;
        }
      }
    }
    type Row = { gameName: string; siteName: string; goals: number; assists: number; passes: number; interceptions: number; saves: number; score: number; mvp: boolean };
    let out: { found: boolean; result: string; left: number; right: number; players: Row[] };
    try {
      out = JSON.parse(done || text);
    } catch {
      throw new Error("Não consegui ler o print.");
    }
    if (!out.found || out.left === out.right) throw new Error("Não achei o placar nesse print. Mande a tela de estatísticas da partida.");
    const hi = Math.max(out.left, out.right);
    const lo = Math.min(out.left, out.right);
    // Map to the uploader's side: VITÓRIA => the higher score is theirs.
    const mine = out.result === "derrota" ? lo : out.result === "vitoria" ? hi : out.left;
    const theirs = out.result === "derrota" ? hi : out.result === "vitoria" ? lo : out.right;
    // Store the print so every player can see and vote on it; deleted when the vote ends.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(data.image)!;
    const path = `${data.matchId}/${Date.now()}.${m[1]!.split("/")[1]}`;
    const bytes = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
    const up = await supabaseAdmin.storage.from("match-prints").upload(path, bytes, { contentType: m[1]! });
    if (up.error) throw new Error("Não consegui guardar o print.");
    const { error } = await context.supabase.rpc("set_screenshot_score_gk", { p_match: data.matchId, p_mine: mine, p_theirs: theirs, p_path: path });
    if (error) {
      await supabaseAdmin.storage.from("match-prints").remove([path]);
      throw new Error(
        error.message.includes("sem_permissao")
          ? "Só quem jogou a partida pode mandar o print."
          : error.message.includes("print_ja_enviado")
            ? "A print dessa partida já foi enviada e contabilizada."
          : error.message.includes("placar_diferente_da_votacao")
            ? "O placar do print não bate com o time vencedor da votação. Confira o print ou chame a staff."
            : error.message.includes("placar_empatado")
              ? "O print mostra empate; a partida precisa de um vencedor."
              : "Não consegui salvar o placar.",
      );
    }
    const stats = matchPrintPlayers(people, out.players ?? []);

    let matched = 0;
    if (stats.length) {
      const { data: n } = await context.supabase.rpc("set_screenshot_stats_gk", { p_match: data.matchId, p_stats: stats });
      matched = Number(n ?? 0);
    }
    return { mine, theirs, matched };
  });


/** Approve or reject the match print. 6 approvals accept it; 6 rejections clear it for a new print. */
export const voteScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string; ok: boolean }) => ({ matchId: String(input.matchId), ok: input.ok === true }))
  .handler(async ({ data, context }) => {
    const { data: path0 } = await context.supabase.from("matches").select("shot_path").eq("id", data.matchId).maybeSingle();
    const { data: res, error } = await context.supabase.rpc("vote_screenshot_gk", { p_match: data.matchId, p_ok: data.ok });
    if (error) throw new Error(error.message.includes("sem_print") ? "O print foi recusado; mande outro." : error.message.includes("partida_encerrada") ? "A partida já terminou." : "Não consegui registrar o voto.");
    const status = String(res ?? "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (status.startsWith("rejected:")) {
      const p = status.slice(9);
      if (p) await supabaseAdmin.storage.from("match-prints").remove([p]);
      return { status: "rejected" };
    }
    if (status === "completed") {
      if (path0?.shot_path) await supabaseAdmin.storage.from("match-prints").remove([path0.shot_path]);
      const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
      const { publishResult } = await import("@/lib/discord.server");
      await Promise.allSettled([cleanupFinishedVoiceSafely(), publishResult(data.matchId)]);
    }
    return { status };
  });
