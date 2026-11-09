import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const KEY = "aviso-visto";
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function AnnouncementPopup() {
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => { setSeen(localStorage.getItem(KEY)); }, []);
  const { data } = useQuery({
    queryKey: ["announcement-latest"],
    enabled: seen !== undefined,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return null;
      const { data } = await supabase.from("announcements").select("id, message, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });
  const open = !!data && seen !== undefined && data.id !== seen && Date.now() - new Date(data.created_at).getTime() < MAX_AGE_MS;
  function dismiss() {
    if (!data) return;
    localStorage.setItem(KEY, data.id);
    setSeen(data.id);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md text-center [&>button.absolute]:hidden">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Megaphone className="size-6" /></div>
        <DialogTitle className="text-center font-display text-2xl">Aviso geral</DialogTitle>
        <DialogDescription className="whitespace-pre-wrap text-center text-base text-foreground">{data?.message}</DialogDescription>
        <Button className="mt-2 w-full" onClick={dismiss}>Entendi</Button>
      </DialogContent>
    </Dialog>
  );
}
