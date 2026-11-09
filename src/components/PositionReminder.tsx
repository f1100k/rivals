import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Target } from "lucide-react";
import { getPlayerProfile } from "@/lib/inhouse.functions";
import { needsPositionReminder } from "@/lib/player-profile";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { ProfilePositionsEditor } from "./ProfilePositionsEditor";

export function PositionReminder({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(getPlayerProfile);
  const { data: profile } = useQuery({ queryKey: ["player-profile", userId], queryFn: () => fn({ data: { id: userId } }) });
  if (!profile || !needsPositionReminder(profile)) return null;
  return <>
    <aside className="border-b border-primary/30 bg-background/90 px-4 py-3" aria-label="Lembrete de posições">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <Target className="h-5 w-5 shrink-0 text-primary" /><p className="min-w-0 flex-1 text-sm">Faltam suas posições primária e secundária.</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Definir posições</Button>
      </div>
    </aside>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="w-[calc(100%-2rem)] rounded-lg bg-card"><DialogTitle>Complete seu perfil</DialogTitle><DialogDescription>Escolha suas duas posições.</DialogDescription><ProfilePositionsEditor profile={profile} /></DialogContent></Dialog>
  </>;
}