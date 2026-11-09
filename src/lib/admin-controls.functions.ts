import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { botRequest, closeVoteRequest } from "./admin-controls";
import type { z } from "zod";

export const addQueueBots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof botRequest>) => botRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !allowed) throw new Error("Somente administradores podem adicionar bots.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const ids: string[] = [];
    try {
      for (let i = 0; i < data.count; i++) {
        const tag = crypto.randomUUID();
        const { data: created, error } = await db.auth.admin.createUser({
          email: `bot-${tag}@inhouse-test.invalid`, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
          user_metadata: { name: `Bot Teste ${tag.slice(0, 4)}`, primary_position: data.position, secondary_position: data.position === "Ala" ? "Fixo" : "Ala" },
        });
        if (error || !created.user) throw new Error("Não foi possível criar os bots de teste.");
        ids.push(created.user.id);
        const { error: profileError } = await db.from("profiles").update({ is_ghost: true, rating: 0 }).eq("id", created.user.id);
        if (profileError) throw new Error("Não foi possível preparar os bots.");
      }
      const { data: added, error } = await context.supabase.rpc("admin_enqueue_test_bots", { p_users: ids, p_position: data.position, p_test: data.test ?? false });
      if (error) throw new Error("Não foi possível adicionar os bots à fila.");
      return { added: added ?? 0 };
    } catch (error) {
      // Only accounts created by this request can be rolled back; real players are never touched.
      for (const id of ids) await db.auth.admin.deleteUser(id);
      throw error;
    }
  });

export const closeMatchVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof closeVoteRequest>) => closeVoteRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_close_match_vote", { p_match: data.match, p_side: data.side, p_reason: data.reason });
    if (error) throw new Error(error.message.includes("sem_permissao") ? "Somente administradores podem encerrar a votação." : "A partida não está disponível para encerrar.");
    const { cleanupFinishedVoiceSafely } = await import("@/lib/match-voice.server");
    await cleanupFinishedVoiceSafely();
    const { publishResult } = await import("@/lib/discord.server");
    await publishResult(data.match);
    const { purgeFinishedBots } = await import("@/lib/bot-cleanup.server");
    await purgeFinishedBots().catch((e) => console.error("bot purge", e));
    return true;
  });