import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DiscordLink { discordId: string; username: string }

export const getMyDiscordLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscordLink | null> => {
    const { data, error } = await context.supabase.from("discord_links").select("discord_id, discord_username").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { discordId: data.discord_id, username: data.discord_username } : null;
  });

export const linkDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accessToken: string }) => {
    const t = String(input?.accessToken ?? "");
    if (!/^[A-Za-z0-9._-]{10,200}$/.test(t)) throw new Error("Token do Discord inválido.");
    return { accessToken: t };
  })
  .handler(async ({ data, context }): Promise<DiscordLink> => {
    // Verify identity directly with Discord using the user's own short-lived token.
    const res = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${data.accessToken}` } });
    if (!res.ok) throw new Error(`Não foi possível confirmar sua conta do Discord (${res.status}).`);
    const me = (await res.json()) as { id: string; username: string; global_name?: string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("discord_links").select("user_id").eq("discord_id", me.id).maybeSingle();
    if (taken && taken.user_id !== context.userId) throw new Error("Esse Discord já está ligado a outra conta do site.");
    const username = me.global_name || me.username;
    const { error } = await supabaseAdmin.from("discord_links").upsert({ user_id: context.userId, discord_id: me.id, discord_username: username, linked_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { discordId: me.id, username };
  });

export const unlinkDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("discord_links").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return true;
  });

/**
 * Called by participants while polling: opens Team A/B calls once the draft ends
 * and closes calls of finished/cancelled matches. Idempotent.
 */
export const syncMatchVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: mine } = await context.supabase
      .from("match_players")
      .select("match_id, matches!inner(status, created_at)")
      .eq("user_id", context.userId)
      .eq("matches.status", "room")
      .order("created_at", { referencedTable: "matches", ascending: false })
      .limit(1)
      .maybeSingle();
    const { openMatchVoice, cleanupFinishedVoice } = await import("@/lib/match-voice.server");
    await cleanupFinishedVoice();
    const { purgeFinishedBots } = await import("@/lib/bot-cleanup.server");
    await purgeFinishedBots().catch((e) => console.error("bot purge", e));
    if (mine?.match_id) return await openMatchVoice(mine.match_id);
    return null;
  });
