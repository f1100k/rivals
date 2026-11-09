import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWinStreakSettings, setWinStreakSettings } from "@/lib/inhouse.functions";
import { appliedWinStreakBonus, WIN_STREAK_DEFAULTS, type WinStreakSettings } from "@/lib/inhouse";

/** Admin-only controls for the winning-run bonus the finalizer pays out. */
export function AdminWinStreak() {
  const load = useServerFn(getWinStreakSettings);
  const save = useServerFn(setWinStreakSettings);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["win-streak-settings"], queryFn: () => load(), retry: false });
  const [enabled, setEnabled] = useState(WIN_STREAK_DEFAULTS.enabled);
  const [maxBonus, setMaxBonus] = useState(String(WIN_STREAK_DEFAULTS.maxBonus));
  const [maxStreak, setMaxStreak] = useState(String(WIN_STREAK_DEFAULTS.maxRewardedStreak));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setMaxBonus(String(data.maxBonus));
    setMaxStreak(String(data.maxRewardedStreak));
  }, [data]);

  const draft: WinStreakSettings = {
    enabled,
    maxBonus: Number(maxBonus) || 0,
    maxRewardedStreak: Number(maxStreak) || 1,
  };

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await save({ data: draft });
      await qc.invalidateQueries({ queryKey: ["win-streak-settings"] });
      toast.success("Regras do bônus de vitórias salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="mt-4 text-sm text-destructive">{error.message}</p>;
  if (!data) return <p className="mt-4 animate-pulse text-sm text-muted-foreground">Carregando as regras do bônus…</p>;

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">Bônus de sequência de vitórias</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada vitória seguida aumenta o bônus em só +5 (+5, +10, +15, +20…). Ele soma ao Elo no fim da partida.
        Uma derrota zera a sequência.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-primary" />
          Bônus ativo
        </label>
        <label className="grid gap-1 text-sm">
          Bônus máximo por partida
          <Input type="number" min={0} max={100000} value={maxBonus} onChange={(e) => setMaxBonus(e.target.value)} className="w-32" />
        </label>
        <label className="grid gap-1 text-sm">
          Premiada até
          <Input type="number" min={1} max={100} value={maxStreak} onChange={(e) => setMaxStreak(e.target.value)} className="w-32" />
        </label>
        <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar regras"}</Button>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <li key={n} className="rounded-lg border border-border px-3 py-2">
            <span className="text-muted-foreground">{n}ª vitória</span>
            <p className="font-display font-bold">+{appliedWinStreakBonus(n, draft)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
