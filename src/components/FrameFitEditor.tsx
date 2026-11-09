import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAvatarUrl, useFrameFits, useFrameCatalog } from "@/components/Avatar";
import { AVATAR_FRAMES, FIT_LIMITS, type AvatarFrameDef, frameStyle, resolveFit, type FrameFit } from "@/lib/avatar-frames";
import { setAvatarFrameFit } from "@/lib/avatar-frames.functions";

/** Admin tool: manually adjust size and position of each frame; saved for everyone. */
export function FrameFitEditor({ avatarPath, name, initialFrame }: { avatarPath?: string | null | undefined; name: string; initialFrame?: string | null | undefined }) {
  const fallback = AVATAR_FRAMES[0] as AvatarFrameDef;
  const catalog = useFrameCatalog();
  const [frameId, setFrameId] = useState(initialFrame ?? fallback.id);
  const def = catalog.find((f) => f.id === frameId) ?? fallback;
  const fits = useFrameFits();
  const saved = fits.data?.[def.id];
  const [fit, setFit] = useState<FrameFit>(() => resolveFit(def, saved));
  const [saving, setSaving] = useState(false);
  const url = useAvatarUrl(avatarPath);
  const save = useServerFn(setAvatarFrameFit);
  const qc = useQueryClient();

  useEffect(() => {
    setFit(resolveFit(def, saved));
  }, [def.id, saved?.fit, saved?.offsetX, saved?.offsetY]);

  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      await save({ data: { frame: def.id, ...fit } });
      await qc.invalidateQueries({ queryKey: ["avatar-frame-fits"] });
      toast.success(`Encaixe da ${def.label} salvo pra todo mundo!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o encaixe.");
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, key: keyof FrameFit, min: number, max: number, step: number, unit: string) => (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">{fit[key]}{unit}</span>
      </div>
      <Slider
        className="mt-2"
        min={min}
        max={max}
        step={step}
        value={[fit[key]]}
        onValueChange={([v]) => setFit((f) => ({ ...f, [key]: v }))}
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="mt-6 rounded-xl border border-border bg-background/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ajustar encaixe (manual)</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {catalog.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="outline"
            onClick={() => setFrameId(f.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${f.id === def.id ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-primary/50"}`}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid items-center gap-6 sm:grid-cols-[220px_1fr]">
        <div className="grid h-[220px] place-items-center overflow-hidden rounded-xl bg-muted/40">
          <span className="relative grid h-20 w-20 place-items-center rounded-full border-2 border-primary bg-primary/15 font-display text-3xl font-bold text-primary">
            {url ? <img src={url} alt={name} className="h-full w-full rounded-full object-cover" /> : name.slice(0, 1).toUpperCase()}
            <img src={def.image} alt="" aria-hidden className="avatar-frame-img" style={frameStyle(fit)} />
          </span>
        </div>
        <div className="space-y-4">
          {row("Tamanho", "fit", FIT_LIMITS.min, FIT_LIMITS.max, 1, "%")}
          {row("Horizontal", "offsetX", -FIT_LIMITS.offset, FIT_LIMITS.offset, 0.5, "%")}
          {row("Vertical", "offsetY", -FIT_LIMITS.offset, FIT_LIMITS.offset, 0.5, "%")}
          <div className="flex gap-2">
            <Button onClick={onSave} disabled={saving} className="font-display uppercase">
              <Save /> {saving ? "Salvando..." : "Salvar encaixe"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setFit({ fit: def.fit, offsetX: 0, offsetY: 0 })}>
              <RotateCcw /> Padrão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
