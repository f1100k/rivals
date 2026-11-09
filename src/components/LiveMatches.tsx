import { useQuery } from "@tanstack/react-query";
import { Copy, Eye, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type LiveMatch = { id: string; status: string; room_code: string | null; created_at: string };

export function LiveMatches() {
  const { data = [] } = useQuery({
    queryKey: ["live-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id,status,room_code,created_at")
        .not("status", "in", "(completed,cancelled)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as LiveMatch[];
    },
    refetchInterval: 15000, refetchIntervalInBackground: false,
    staleTime: 10000,
  });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado. Entre como espectador!");
    } catch {
      toast.error("Não deu para copiar.");
    }
  };

  return (
    <aside className="rounded-2xl border border-primary/40 bg-card/80 p-5 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {data.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:hidden" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${data.length ? "bg-destructive" : "bg-muted-foreground"}`} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ao vivo</p>
      </div>
      <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Radio size={18} /> Partidas ao vivo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use o código da sala para entrar como espectador e assistir.</p>

      <div className="mt-4 space-y-3">
        {data.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nenhuma partida rolando agora.
          </p>
        )}
        {data.map((m, i) => (
          <div key={m.id} className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Partida #{data.length - i}</span>
              <span>{m.status === "draft" ? "Escolhendo times" : "Em jogo"}</span>
            </div>
            {m.room_code ? (
              <button
                type="button"
                onClick={() => copy(m.room_code!)}
                className="mt-2 flex w-full items-center justify-between rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 font-display text-lg font-bold tracking-widest text-primary transition hover:bg-primary/20"
                aria-label={`Copiar código ${m.room_code}`}
              >
                {m.room_code} <Copy size={16} />
              </button>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Aguardando código da sala…</p>
            )}
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Eye size={12} /> Modo espectador liberado</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
