import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { fetchLeagueRanking, fmtGain, gamesMissing, leagueRangeLabel, splitLeague, type LeagueRow } from "@/lib/league";

function PlayerCell({ p, onSelect }: { p: LeagueRow; onSelect: (id: string) => void }) {
  return (
    <Button variant="ghost" className="relative z-20 h-auto max-w-full justify-start gap-2 overflow-x-clip px-0 text-left" onClick={() => onSelect(p.id)} aria-label={`Ver perfil de ${p.name}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span>
      <EquippedEmblem userId={p.id} className="h-5 w-5" />
      <PlayerName userId={p.id} name={p.name} className="min-w-0 truncate font-semibold sm:max-w-72" />
      <span className="hidden sm:inline-flex"><StaffTag userId={p.id} className="ml-1" /></span>
    </Button>
  );
}

const gainCls = (n: number) => (n > 0 ? "text-primary" : n < 0 ? "text-destructive" : "text-muted-foreground");

/** Weekly Rivals League: MMR gained in normal-queue matches of the event, minimum games to qualify. */
export function RivalsLeagueRanking({ eventId, myId, onPlayerSelect }: { eventId: string; myId: string | null; onPlayerSelect: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ["league-ranking", eventId],
    queryFn: () => fetchLeagueRanking(eventId),
    refetchInterval: (q) => (q.state.data?.event?.status === "active" ? 30000 : false),
    refetchIntervalInBackground: false,
  });
  const e = data?.event;
  if (!e) return <p className="mt-8 text-center text-sm text-muted-foreground">Carregando a Rivals League…</p>;
  const { qualified, pending } = splitLeague(data.rows);
  const live = e.status === "active";
  const over = live && Date.now() >= new Date(e.ends_at).getTime();
  const lastDay = leagueRangeLabel(e).split(" a ")[1];
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <p className="flex items-center gap-2 font-display text-xl font-bold"><Swords className="h-5 w-5 text-primary" />{e.name} <span className="text-sm font-semibold text-muted-foreground">· {leagueRangeLabel(e)}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">
          Conta o MMR ganho só nas partidas da fila normal dessa semana (Mix não conta). Para entrar no ranking, jogue no mínimo <b className="text-foreground">{e.min_games} partidas</b>.
        </p>
        <p className="mt-2 text-xs font-semibold text-primary">{over ? "Tempo encerrado · partidas novas não contam mais" : live ? `Ao vivo · termina ${lastDay} à meia-noite` : "Finalizada · resultado guardado"}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm sm:min-w-[640px]">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-2 sm:p-3">#</th><th className="p-2 sm:p-3">Jogador</th><th className="p-2 sm:p-3">MMR ganho</th><th className="p-2 sm:p-3">V - D</th><th className="hidden p-3 text-right sm:table-cell">Partidas</th></tr>
          </thead>
          <tbody>
            {qualified.map((p) => (
              <tr key={p.id} className={`border-t border-border ${p.id === myId ? "bg-primary/10" : ""}`}>
                <td className="p-2 sm:p-3"><span className={`grid h-7 w-7 place-items-center rounded font-bold ${(p.place ?? 99) <= 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{p.place}</span></td>
                <td className="max-w-0 p-2 sm:max-w-none sm:p-3"><PlayerCell p={p} onSelect={onPlayerSelect} /></td>
                <td className={`p-2 font-display text-lg font-bold sm:p-3 ${gainCls(p.mmr_gain)}`}>{fmtGain(p.mmr_gain)}</td>
                <td className="p-2 text-muted-foreground sm:p-3">{p.wins}V - {p.losses}D</td>
                <td className="hidden p-3 text-right sm:table-cell">{p.games}</td>
              </tr>
            ))}
            {qualified.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Ninguém bateu {e.min_games} partidas ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <h3 className="border-b border-border p-3 font-display font-bold">Ainda não classificado</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-2 sm:p-3">Jogador</th><th className="p-2 sm:p-3">Partidas</th><th className="p-2 sm:p-3">MMR ganho</th></tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className={`border-t border-border ${p.id === myId ? "bg-primary/10" : ""}`}>
                  <td className="max-w-0 p-2 sm:max-w-none sm:p-3"><PlayerCell p={p} onSelect={onPlayerSelect} /></td>
                  <td className="p-2 sm:p-3"><p className="font-bold">{p.games}/{e.min_games}</p><span className="text-[10px] text-muted-foreground">{live ? `faltam ${gamesMissing(p.games, e.min_games)}` : "não classificou"}</span></td>
                  <td className={`p-2 font-semibold sm:p-3 ${gainCls(p.mmr_gain)}`}>{fmtGain(p.mmr_gain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
