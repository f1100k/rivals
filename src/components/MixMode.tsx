import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { MIX_MVP_KEY, MIX_RANKING_KEY, MIX_STATE_KEY, fetchMixMvpRanking, fetchMixRanking, fetchMixState, mixStatusText } from "@/lib/mix";

export function useMixState() {
  return useQuery({ queryKey: MIX_STATE_KEY, queryFn: fetchMixState, refetchInterval: 30000, refetchIntervalInBackground: false });
}

/** Banner on the queue page while the Mix is on or scheduled. */
export function MixBanner() {
  const { data } = useMixState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const text = mixStatusText(data, now);
  if (!text) return null;
  const live = text.startsWith("Modo Mix ativo");
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${live ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
      <Shuffle className={`mt-0.5 size-5 shrink-0 ${live ? "text-primary" : "text-muted-foreground"}`} />
      <div className="text-sm">
        <p className="font-display text-base font-bold">{text}</p>
        <p className="text-muted-foreground">Os 2 maiores MMR são capitães e o resto é sorteado, equilibrado pelo MMR. Sem escolha de time. Vale só para o Ranking Mix (não mexe no MMR).</p>
      </div>
    </div>
  );
}

export function MixRanking({ onPlayerSelect, season = null }: { onPlayerSelect: (id: string) => void; season?: string | null }) {
  const { data = [] } = useQuery({ queryKey: [...MIX_RANKING_KEY, season ?? "atual"], queryFn: () => fetchMixRanking(season), refetchInterval: 30000, refetchIntervalInBackground: false });
  return (
    <div className="mt-8">
      <p className="mb-3 text-sm text-muted-foreground">Só partidas do modo Mix. Saldo = vitórias menos derrotas; no empate, ganha quem tem mais vitórias.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-2 sm:p-3">#</th><th className="p-2 sm:p-3">Jogador</th><th className="p-2 text-right sm:p-3">V</th><th className="p-2 text-right sm:p-3">D</th><th className="p-2 text-right sm:p-3">Saldo</th></tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-2 sm:p-3"><span className={`grid h-7 w-7 place-items-center rounded font-bold ${i < 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{i + 1}</span></td>
                <td className="max-w-0 p-2 sm:max-w-none sm:p-3">
                  <Button variant="ghost" className="h-auto max-w-full justify-start gap-2 px-0 text-left" onClick={() => onPlayerSelect(p.id)} aria-label={`Ver perfil de ${p.name}`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-xs font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span>
                    <EquippedEmblem userId={p.id} className="h-5 w-5" /><PlayerName userId={p.id} name={p.name} className="truncate font-semibold" /><StaffTag userId={p.id} className="ml-1" />
                  </Button>
                </td>
                <td className="p-2 text-right sm:p-3">{p.wins}</td>
                <td className="p-2 text-right text-muted-foreground sm:p-3">{p.losses}</td>
                <td className={`p-2 text-right font-display text-lg font-bold sm:p-3 ${p.balance > 0 ? "text-primary" : "text-muted-foreground"}`}>{p.balance > 0 ? `+${p.balance}` : p.balance}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma partida Mix terminada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MixMvpRanking({ onPlayerSelect, season = null }: { onPlayerSelect: (id: string) => void; season?: string | null }) {
  const { data = [] } = useQuery({ queryKey: [...MIX_MVP_KEY, season ?? "atual"], queryFn: () => fetchMixMvpRanking(season), refetchInterval: 30000, refetchIntervalInBackground: false });
  return (
    <div className="mt-8">
      <p className="mb-3 text-sm text-muted-foreground">Quantas vezes cada jogador foi MVP nas partidas do modo Mix (selo MVP do print aprovado). No empate, fica na frente quem jogou menos partidas.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-2 sm:p-3">#</th><th className="p-2 sm:p-3">Jogador</th><th className="p-2 text-right sm:p-3">Partidas</th><th className="p-2 text-right sm:p-3">MVPs</th></tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-2 sm:p-3"><span className={`grid h-7 w-7 place-items-center rounded font-bold ${i < 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{i + 1}</span></td>
                <td className="max-w-0 p-2 sm:max-w-none sm:p-3">
                  <Button variant="ghost" className="h-auto max-w-full justify-start gap-2 px-0 text-left" onClick={() => onPlayerSelect(p.id)} aria-label={`Ver perfil de ${p.name}`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-xs font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span>
                    <EquippedEmblem userId={p.id} className="h-5 w-5" /><PlayerName userId={p.id} name={p.name} className="truncate font-semibold" /><StaffTag userId={p.id} className="ml-1" />
                  </Button>
                </td>
                <td className="p-2 text-right text-muted-foreground sm:p-3">{p.games}</td>
                <td className="p-2 text-right sm:p-3"><span className="inline-flex items-center gap-1 font-display text-lg font-bold text-primary"><Crown className="size-4" />{p.mvps}</span></td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Ninguém foi MVP numa partida Mix ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
