import { useState } from "react";
import { Copy, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleanRoomCode, isValidRoomCode, ROOM_CODE_MAX, ROOM_CODE_MIN } from "@/lib/room-code";

export function RoomCode({ roomCode, onSave }: { roomCode: string | null; onSave: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = isValidRoomCode(code);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (await onSave(code)) setCode("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-y border-border py-6 xl:border-y-0 xl:border-l xl:border-border xl:py-0 xl:pl-6">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold">Código da sala</h2>
        <p className="mt-1 text-sm text-muted-foreground">Compartilhado pelos jogadores da partida</p>
        <div className="my-5 flex min-h-20 items-center justify-between gap-4 border border-border bg-muted px-4 py-3">
          {roomCode ? <strong className="min-w-0 break-all font-display text-2xl">{roomCode}</strong> : <span className="text-muted-foreground">Nenhum código informado</span>}
          <Button
            size="icon"
            variant="outline"
            aria-label="Copiar código"
            title="Copiar código"
            disabled={!roomCode}
            onClick={() => {
              if (!roomCode) return;
              navigator.clipboard.writeText(roomCode)
                .then(() => toast.success("Código copiado."))
                .catch(() => toast.error("Não foi possível copiar."));
            }}
          ><Copy size={18} /></Button>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Input aria-label="Código da sala" placeholder={roomCode ? "Novo código (só números)" : "Código da sala (só números)"} inputMode="numeric" autoComplete="off" maxLength={ROOM_CODE_MAX} value={code} disabled={saving} onChange={(event) => setCode(cleanRoomCode(event.target.value))} className="h-10 flex-1" />
          <Button type="submit" disabled={!valid || saving} className="h-10">
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? "Salvando…" : roomCode ? "Atualizar código" : "Salvar código"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Só números, de {ROOM_CODE_MIN} a {ROOM_CODE_MAX} dígitos. Letras e textos não são aceitos.</p>
      </div>
    </section>
  );
}