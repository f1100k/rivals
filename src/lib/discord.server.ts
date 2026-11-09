// Server-only: publishes in-house results and ranking to the Discord server.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { rankName } from "./inhouse";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/discord";
const CHANNEL_RESULTS = "1567373773001334978"; // #partidas-🏟️
const CHANNEL_RANKING = "1567382286712709150"; // #ranking-📊

function db() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new Error("Dados da in-house indisponíveis para o Discord");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function call(path: string, method: string, payload?: unknown) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const discord = process.env["DISCORD_API_KEY"];
  if (!lovable || !discord) throw new Error("Discord não configurado");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": discord, "Content-Type": "application/json" },
    body: payload === undefined ? null : JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Discord message failed [${res.status}]: ${body}`);
    throw new Error(`Discord ${res.status}: ${body}`);
  }
  return res;
}

const post = (channel: string, payload: unknown) => call(`/channels/${channel}/messages`, "POST", payload);
const BOT_ID = "1567379012471492668";
const RANKING_TITLE = "Ranking In-house";

const fmt = (d: number | null) => (d == null ? "" : d > 0 ? ` (+${d})` : ` (${d})`);

export async function announceMatch(matchId: string) {
  const { data, error } = await db()
    .from("matches")
    .select("id, status, shot_score_a, shot_score_b, players:match_players(team, delta, profiles(name))")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Error(`Leitura da partida: ${error.message}`);
  if (!data || data.status !== "completed") return;
  const players = (data.players ?? []) as unknown as { team: string; delta: number | null; profiles: { name: string } | null }[];
  const team = (t: string) => players.filter((p) => p.team.toLowerCase() === t.toLowerCase());
  const winA = team("A").some((p) => (p.delta ?? 0) > 0);
  const list = (t: string) => team(t).map((p) => `${p.profiles?.name ?? "?"}${fmt(p.delta)}`).join("\n") || "—";
  const score = data.shot_score_a != null && data.shot_score_b != null ? `**${data.shot_score_a} x ${data.shot_score_b}**` : "Placar sem print";
  await post(CHANNEL_RESULTS, {
    allowed_mentions: { parse: [] },
    nonce: matchId.replaceAll("-", "").slice(0, 25),
    enforce_nonce: true,
    embeds: [{
      title: `🏆 Vitória do Time ${winA ? "A" : "B"}`,
      description: score,
      color: 0xf97316,
      fields: [
        { name: `Time A${winA ? " ✅" : ""}`, value: list("A"), inline: true },
        { name: `Time B${winA ? "" : " ✅"}`, value: list("B"), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

export function buildRankingEmbed(rows: { name: string; rating: number; wins: number; losses: number }[]) {
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((p, i) => {
    const games = p.wins + p.losses;
    const wr = games ? Math.round((p.wins / games) * 100) : 0;
    const pos = medals[i] ?? `\`${String(i + 1).padStart(2, " ")}\``;
    return `${pos} **${p.name}**\n┗ \`${p.rating} MMR\` · ${rankName(p.rating)} · ${p.wins}V/${p.losses}D · ${wr}%`;
  });
  return {
    title: `🏆 ${RANKING_TITLE} — Top 10`,
    description: lines.join("\n\n") || "Sem jogadores ainda.",
    color: 0xa855f7,
    footer: { text: "Atualiza automaticamente · última atualização" },
    timestamp: new Date().toISOString(),
  };
}

export async function postRanking() {
  const { data, error } = await db()
    .from("profiles")
    .select("name, rating, wins, losses")
    .eq("is_ghost", false)
    .order("rating", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Leitura do ranking: ${error.message}`);
  const payload = { allowed_mentions: { parse: [] }, embeds: [buildRankingEmbed(data ?? [])] };

  // Keep a single ranking message: edit the bot's latest one, remove older duplicates.
  let mine: { id: string }[] = [];
  try {
    const res = await call(`/channels/${CHANNEL_RANKING}/messages?limit=50`, "GET");
    const list = (await res.json()) as unknown;
    if (Array.isArray(list)) {
      mine = list.filter((m) => m?.author?.id === BOT_ID && (m.embeds ?? []).some((e: { title?: string }) => e?.title?.includes(RANKING_TITLE)));
    }
  } catch (e) {
    console.error("Discord ranking lookup failed", e);
  }
  if (mine.length === 0) {
    await post(CHANNEL_RANKING, payload);
    return;
  }
  const [latest, ...old] = mine as [{ id: string }, ...{ id: string }[]]; // Discord returns newest first
  await call(`/channels/${CHANNEL_RANKING}/messages/${latest.id}`, "PATCH", payload);
  for (const m of old) {
    await call(`/channels/${CHANNEL_RANKING}/messages/${m.id}`, "DELETE").catch((e) => console.error("Discord ranking delete failed", e));
  }
}

export async function publishResult(matchId: string) {
  // Admin test-queue matches never reach Discord.
  const { data: m } = await db().from("matches").select("region").eq("id", matchId).maybeSingle();
  if (m?.region === "TESTE") return;
  const results = await Promise.allSettled([announceMatch(matchId), postRanking()]);
  for (const result of results) {
    if (result.status === "rejected") console.error("Discord publish failed", result.reason);
  }
}

const CHANNEL_NOTICES = "1567772276806520902"; // #📢・avisos

export async function postAnnouncement(message: string) {
  await post(CHANNEL_NOTICES, {
    content: "@everyone",
    allowed_mentions: { parse: ["everyone"] },
    embeds: [{ title: "📢 Aviso geral", description: message, color: 0xe11d48, timestamp: new Date().toISOString() }],
  });
}
