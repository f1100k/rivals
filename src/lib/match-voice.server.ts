// Server-only orchestration of temporary match voice calls (uses admin client after caller checks).
import { WAITING_ROOM, createVoiceChannel, deleteChannel, moveMember, voiceChannelOf } from "./discord-voice.server";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function linkedPlayers(matchId: string) {
  const db = await admin();
  const { data, error } = await db.from("match_players").select("user_id, team").eq("match_id", matchId);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((p) => p.user_id);
  if (!ids.length) return [];
  const { data: links, error: lErr } = await db.from("discord_links").select("user_id, discord_id").in("user_id", ids);
  if (lErr) throw new Error(lErr.message);
  const byUser = new Map((links ?? []).map((l) => [l.user_id, l.discord_id]));
  return (data ?? [])
    .flatMap((p) => {
      const discordId = byUser.get(p.user_id);
      const team = String(p.team).toLowerCase();
      return discordId && (team === "a" || team === "b") ? [{ discordId, team }] : [];
    });
}

export async function openMatchVoice(matchId: string) {
  const db = await admin();
  const { data: m } = await db.from("matches").select("region").eq("id", matchId).maybeSingle();
  if (m?.region === "TESTE") return { created: false };
  // Claim the match atomically so concurrent polls create the calls once.
  const { data: claimed, error } = await db.from("match_voice").upsert({ match_id: matchId }, { onConflict: "match_id", ignoreDuplicates: true }).select("match_id");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return { created: false };

  const tag = matchId.slice(0, 4).toUpperCase();
  const channelA = await createVoiceChannel(`🅰️ Time A · ${tag}`);
  const channelB = await createVoiceChannel(`🅱️ Time B · ${tag}`);
  await db.from("match_voice").update({ channel_a: channelA, channel_b: channelB }).eq("match_id", matchId);

  let moved = 0;
  for (const p of await linkedPlayers(matchId)) {
    try {
      if ((await voiceChannelOf(p.discordId)) === WAITING_ROOM) {
        await moveMember(p.discordId, p.team === "a" ? channelA : channelB);
        moved++;
      }
    } catch (e) {
      console.error("Discord move failed", e);
    }
  }
  return { created: true, moved };
}

export async function cleanupFinishedVoice(opts: { sweepText?: boolean } = {}) {
  const db = await admin();
  const { data, error } = await db
    .from("match_voice")
    .select("match_id, channel_a, channel_b, created_at, matches!inner(status)")
    .is("cleaned_at", null);
  if (error) throw new Error(error.message);
  let cleanedAny = false;
  for (const row of data ?? []) {
    const status = (row.matches as unknown as { status: string }).status;
    // Only persisted terminal states authorize moving people and deleting calls.
    // Voting/reporting/disputed matches remain open regardless of their age.
    if (status !== "completed" && status !== "cancelled") continue;
    // Claim the row atomically so simultaneous players don't all clean the same calls.
    const claimedAt = new Date().toISOString();
    const { data: claim } = await db.from("match_voice").update({ cleaned_at: claimedAt }).eq("match_id", row.match_id).is("cleaned_at", null).select("match_id");
    if (!claim?.length) continue;
    const release = () => db.from("match_voice").update({ cleaned_at: null }).eq("match_id", row.match_id).eq("cleaned_at", claimedAt);
    const channels = [row.channel_a, row.channel_b].filter(Boolean) as string[];
    let failed = false;
    for (const p of await linkedPlayers(row.match_id)) {
      try {
        const current = await voiceChannelOf(p.discordId);
        if (current && channels.includes(current)) await moveMember(p.discordId, WAITING_ROOM);
      } catch (e) {
        failed = true;
        console.error("Discord move back failed", e);
      }
    }
    // Keep calls and the pending record if a move failed so later sync retries it.
    if (failed) { await release(); continue; }
    for (const c of channels) {
      try { await deleteChannel(c); } catch (e) { failed = true; console.error("Discord delete failed", e); }
    }
    if (failed) { await release(); continue; }
    cleanedAny = true;
  }
  // Text cleanup is heavy (reads #fila history): run it only when a match just closed
  // and no other match is still being played, so a parallel match keeps its chat.
  if (!cleanedAny && !opts.sweepText) return;
  const { count } = await db.from("matches").select("id", { count: "exact", head: true }).in("status", ["draft", "room", "voting", "reporting", "disputed"]);
  if ((count ?? 0) > 0) return;
  try {
    const { cleanupFinishedQueueChannel } = await import("./discord-queue-cleanup.server");
    await cleanupFinishedQueueChannel();
  } catch (error) { console.error("Discord queue cleanup pending", error); }
}

/** Finalization must stay successful even if Discord needs a later retry. */
export async function cleanupFinishedVoiceSafely() {
  try { await cleanupFinishedVoice(); }
  catch (error) { console.error("Discord voice cleanup failed", error); }
}
