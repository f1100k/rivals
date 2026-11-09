import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export function DeleteAccountCard() {
  const del = useServerFn(deleteMyAccount);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await del({ data: { confirm: text.trim().toUpperCase() } });
      await supabase.auth.signOut();
      toast.success("Sua conta foi excluída.");
      navigate({ to: "/auth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir a conta.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-destructive/40 bg-card p-5">
      <h2 className="font-display text-lg font-bold uppercase text-destructive">Excluir minha conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Apaga seu nome, e-mail, foto, posições e vínculo com o Discord. Os resultados das partidas continuam
        para os outros jogadores, mas sem o seu nome. Não dá para desfazer.
      </p>
      {!open ? (
        <Button variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
          Quero excluir minha conta
        </Button>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite EXCLUIR" />
          <Button variant="destructive" disabled={busy || text.trim().toUpperCase() !== "EXCLUIR"} onClick={run}>
            {busy ? "Excluindo…" : "Excluir de vez"}
          </Button>
          <Button variant="ghost" onClick={() => { setOpen(false); setText(""); }}>Cancelar</Button>
        </div>
      )}
    </section>
  );
}
