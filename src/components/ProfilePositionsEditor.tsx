import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { gamePositions, savePlayerPositions } from "@/lib/inhouse.functions";
import type { PlayerProfile } from "@/lib/player-profile";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function ProfilePositionsEditor({ profile }: { profile: PlayerProfile }) {
  const [primary, setPrimary] = useState<string>(profile.primary_position ?? "none");
  const [secondary, setSecondary] = useState<string>(profile.secondary_position ?? "none");
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(savePlayerPositions);
  const client = useQueryClient();
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await fn({ data: { primary: primary === "none" ? null : primary, secondary: secondary === "none" ? null : secondary } });
      await client.invalidateQueries({ queryKey: ["player-profile", profile.id] });
      toast.success("Posições atualizadas!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui salvar as posições."); }
    finally { setSaving(false); }
  }
  return <section className="mt-6 border-t border-border pt-6">
    <h2 className="font-display text-lg font-bold">Minhas posições</h2>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {([{ label: "Posição primária", value: primary, set: setPrimary, other: secondary }, { label: "Posição secundária", value: secondary, set: setSecondary, other: primary }]).map((field) => <div key={field.label}>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{field.label}</p>
        <Select value={field.value} onValueChange={field.set} disabled={saving}><SelectTrigger aria-label={field.label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não definida</SelectItem>{gamePositions.map((p) => <SelectItem key={p} value={p} disabled={p === field.other}>{p}</SelectItem>)}</SelectContent></Select>
      </div>)}
    </div>
    <Button onClick={save} disabled={saving || primary === "none" || secondary === "none" || (primary === (profile.primary_position ?? "none") && secondary === (profile.secondary_position ?? "none"))} className="mt-4"><Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar posições"}</Button>
  </section>;
}