import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlayerLikeRoster } from "@/components/PlayerLikeRoster";
import { supabase } from "@/integrations/supabase/client";
import { getMyLikeMatches, likePlayer } from "@/lib/player-likes.functions";

/** Minutes after a match ends during which its likes stay visible on the queue page. */
export const LIKE_WINDOW_MINUTES = 30;

export function isWithinLikeWindow(completedAt: string | null | undefined, now = Date.now()) {
  if (!completedAt) return false;
  const ended = new Date(completedAt).getTime();
  return Number.isFinite(ended) && now - ended <= LIKE_WINDOW_MINUTES * 60_000;
}

function useLikeAction(onDone: (targetId: string, matchId: string) => void) {
  const likeFn = useServerFn(likePlayer);
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  async function like(matchId: string, targetId: string, name: string) {
    if (pending) return;
    setPending(targetId);
    try {
      await likeFn({ data: { matchId, targetId } });
      onDone(targetId, matchId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-like-matches"] }),
        qc.invalidateQueries({ queryKey: ["my-liked-ids", matchId] }),
        qc.invalidateQueries({ queryKey: ["player-profile", targetId] }),
      ]);
      toast.success(`Você curtiu ${name}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível curtir."); }
    finally { setPending(null); }
  }
  return { pending, like };
}

/** Likes inside the active match's Resultado tab. */
export function MatchLikes({ matchId, teammates }: { matchId: string; teammates: { userId: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data: likedIds } = useQuery({
    queryKey: ["my-liked-ids", matchId],
    queryFn: async () => { const r = await supabase.rpc("get_my_match_liked_ids", { p_match: matchId }); if (r.error) throw r.error; return (r.data ?? []) as string[]; },
    staleTime: 60_000,
  });
  const { pending, like } = useLikeAction((targetId, id) => qc.setQueryData<string[]>(["my-liked-ids", id], ids => [...(ids ?? []), targetId]));
  const liked = new Set(likedIds ?? []);
  return <section className="border-b border-border py-6">
    <h2 className="text-xl font-bold">Curtidas · esta partida</h2>
    <p className="mt-1 text-sm text-muted-foreground">Curta os companheiros do seu time. Você pode curtir cada companheiro uma vez por partida.</p>
    {teammates.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum companheiro para curtir.</p> :
      <PlayerLikeRoster players={teammates.map(p => ({ ...p, liked: liked.has(p.userId) }))} pending={pending} disabled={!likedIds} onLike={p => like(matchId, p.userId, p.name)} />}
  </section>;
}

/** Likes for the match that just ended, shown on the queue page for a short time. */
export function PlayerLikes() {
  const fetchFn = useServerFn(getMyLikeMatches);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-like-matches"], queryFn: () => fetchFn(), refetchOnMount: "always", staleTime: 30_000 });
  const { pending, like } = useLikeAction(targetId =>
    qc.setQueryData<Awaited<ReturnType<typeof fetchFn>>>(["my-like-matches"], current => current?.map(match => ({ ...match, players: match.players.map(player => player.userId === targetId ? { ...player, liked: true } : player) }))));
  const currentMatch = data?.[0];
  if (!currentMatch || !isWithinLikeWindow(currentMatch.completedAt) || currentMatch.players.length === 0) return null;

  return (
    <section className="mt-8 border-t border-border py-6">
      <h2 className="text-xl font-bold">Curtidas · última partida</h2>
      <p className="mt-1 text-sm text-muted-foreground">Curta os companheiros do seu time. Você pode curtir cada companheiro uma vez por partida.</p>
      <PlayerLikeRoster players={currentMatch.players} pending={pending} onLike={p => like(currentMatch.id, p.userId, p.name)} />
    </section>
  );
}
