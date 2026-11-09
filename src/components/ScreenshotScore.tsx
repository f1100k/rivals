import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, ImageUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readScreenshotScore, voteScreenshot } from "@/lib/screenshot-score.functions";

type Shot = { path: string | null; byName: string | null; hasShot: boolean; scoreA: number | null; scoreB: number | null; approved: boolean; yes: number; no: number; myVote: boolean | null };

function toDataUrl(file: File) {
  return new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(new Error("Não consegui abrir a imagem."));
    r.readAsDataURL(file);
  });
}

export function ScreenshotScore({ matchId }: { matchId: string }) {
  const read = useServerFn(readScreenshotScore);
  const vote = useServerFn(voteScreenshot);
  const qc = useQueryClient();
  const key = ["match-shot", matchId];
  const { data: shot } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_match_shot_gk", { p_match: matchId });
      if (error) throw error;
      return data as unknown as Shot | null;
    },
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const locked = !!shot?.hasShot;

  async function pick(file: File | undefined | null) {
    if (!file || busy || locked || !file.type.startsWith("image/")) return;
    try {
      setPending(await toDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui abrir a imagem.");
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item || locked) return;
      e.preventDefault();
      pick(item.getAsFile());
      toast.message("Print colado. Confira e clique em Enviar.");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const s = await read({ data: { matchId, image: pending } });
      setPending(null);
      toast.success(`Print enviado (${s.mine} x ${s.theirs}). Agora a galera vota se aceita.`);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ler o print.");
      qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }

  async function onVote(ok: boolean) {
    setBusy(true);
    try {
      const r = await vote({ data: { matchId, ok } });
      if (r.status === "rejected") toast.message("Print recusado por 6 jogadores. Mandem outro print.");
      else if (r.status === "completed") toast.success("Print aceito, partida encerrada!");
      else if (r.status === "approved") toast.success("Print aceito.");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui votar.");
    } finally {
      setBusy(false);
    }
  }

  const url = shot?.path ? supabase.storage.from("match-prints").getPublicUrl(shot.path).data.publicUrl : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-bold">Placar pelo print</h3>
      {locked ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Print enviado por <b className="text-foreground">{shot?.byName ?? "jogador"}</b> · Time A {shot?.scoreA} x {shot?.scoreB} Time B. Ninguém pode enviar outro enquanto a votação não recusar este.
          </p>
          {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Print da partida" className="max-h-80 rounded-md border border-border" /></a>}
          {shot?.approved ? (
            <p className="font-semibold text-primary">Print aceito pela galera ✔</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onVote(true)} disabled={busy} variant={shot?.myVote === true ? "default" : "outline"}>
                  <ThumbsUp className="size-4" /> Aceitar ({shot?.yes ?? 0}/6)
                </Button>
                <Button onClick={() => onVote(false)} disabled={busy} variant={shot?.myVote === false ? "destructive" : "outline"}>
                  <ThumbsDown className="size-4" /> Recusar ({shot?.no ?? 0}/6)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">6 aceites validam o print. 6 recusas apagam ele e liberam um novo envio. Dá pra trocar o voto.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Tire o print da tela de estatísticas e aperte <kbd className="rounded border border-border px-1">Ctrl</kbd> + <kbd className="rounded border border-border px-1">V</kbd> aqui — ou escolha o arquivo. Todos vão ver e votar; com 6 aceites a fila fecha.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold ${busy ? "pointer-events-none opacity-60" : ""}`}>
              <ImageUp className="size-4" />
              Escolher arquivo
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ClipboardPaste className="size-4" /> ou Ctrl + V</span>
          </div>
          {pending && (
            <div className="mt-4 space-y-3">
              <img src={pending} alt="Print colado" className="max-h-64 rounded-md border border-border" />
              <div className="flex gap-2">
                <Button onClick={save} disabled={busy}>{busy ? "Lendo o print..." : "Enviar"}</Button>
                <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>Descartar</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
