import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2 } from "lucide-react";
import { searchPlayers } from "@/lib/inhouse.functions";
import { Avatar } from "./Avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { StaffTag } from "./StaffTag";
import { EquippedEmblem } from "./Emblems";
import { PlayerName } from "./NameFonts";

export function PlayerSearch({ search, onSearch, onSelect }: { search: string; onSearch: (value: string) => void; onSelect: (id: string) => void }) {
  const [term, setTerm] = useState(search.trim());
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const fn = useServerFn(searchPlayers);
  const { data, isFetching, error } = useQuery({ queryKey: ["player-search", term], queryFn: () => fn({ data: { search: term } }), enabled: Boolean(term), staleTime: 15000 });
  return <div className="mt-6">
    <div className="relative max-w-lg"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Pesquisar jogadores" placeholder="Pesquisar jogadores" value={search} maxLength={80} onChange={(e) => onSearch(e.target.value)} className="h-10 pl-10" /></div>
    {search.trim() && <div className="mt-3 border-y border-border py-3">
      {isFetching || term !== search.trim() ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Pesquisando…</p>
        : error ? <p role="alert" className="text-sm text-destructive">Não consegui pesquisar os jogadores.</p>
        : !data?.length ? <p className="text-sm text-muted-foreground">Nenhum jogador encontrado.</p>
        : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.map((p) => <Button key={p.id} variant="ghost" className="h-auto min-w-0 justify-start gap-3 px-2 py-3 text-left" onClick={() => onSelect(p.id)} aria-label={`Ver perfil de ${p.name}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span>
          <span className="min-w-0"><span className="flex min-w-0 items-center gap-1 font-semibold"><EquippedEmblem userId={p.id} className="h-4 w-4" /><PlayerName userId={p.id} name={p.name} className="truncate" /></span><StaffTag userId={p.id} className="mt-0.5" /><span className="block text-xs text-muted-foreground">{p.rating} MMR</span></span>
        </Button>)}</div>}
    </div>}
  </div>;
}