import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LikeMatch {
  id: string;
  completedAt: string;
  players: { userId: string; name: string; liked: boolean }[];
}

export const getMyLikeMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_like_matches");
    if (error) throw new Error("Não foi possível carregar as partidas.");
    return (data ?? []) as unknown as LikeMatch[];
  });

export const likePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string; targetId: string }) => {
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(input.matchId) || !uuid.test(input.targetId)) throw new Error("Dados inválidos.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("like_player", { p_match: data.matchId, p_target: data.targetId });
    if (error) throw new Error(error.message);
    return true;
  });
