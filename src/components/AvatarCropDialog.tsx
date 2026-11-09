import { useState } from "react";
import Cropper from "react-easy-crop";
import { RotateCcw, Save, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cropAvatar, type CropArea } from "@/lib/avatar-crop";
import { toast } from "sonner";

export function AvatarCropDialog({ source, onClose, onSave, banner = false }: {
  source: string;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  banner?: boolean;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!area || saving) return;
    setSaving(true);
    try {
      await onSave(await cropAvatar(source, area, banner));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui salvar a foto.");
    } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="z-[100] max-w-lg" aria-describedby={undefined} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
        <DialogTitle>{banner ? "Enquadrar banner" : "Enquadrar foto"}</DialogTitle>
        <div className="avatar-crop-stage relative h-72 overflow-hidden rounded-lg bg-muted sm:h-80">
          <Cropper image={source} crop={crop} zoom={zoom} aspect={banner ? 3 : 1} cropShape={banner ? "rect" : "round"} showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
        </div>
        <div className="flex items-center gap-3">
          <ZoomIn className="h-5 w-5 shrink-0 text-muted-foreground" />
          <Slider aria-label="Zoom da foto" value={[zoom]} min={1} max={3} step={0.01} disabled={saving} onValueChange={(values) => setZoom(values[0] ?? 1)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }}><RotateCcw /> Redefinir</Button>
          <Button disabled={saving || !area} onClick={save}><Save /> {saving ? "Salvando…" : banner ? "Salvar banner" : "Salvar foto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}