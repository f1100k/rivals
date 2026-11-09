import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type Notice = { id: string; kind: string; title: string; body: string | null; read_at: string | null; created_at: string };

/** Queries to refresh when a reward of this kind arrives, so the new item shows without reloading. */
function refreshFor(kind: string): string[][] {
  switch (kind) {
    case "coins": return [["coin-balance"], ["shop"]];
    case "frame": return [["avatar-frame-access"], ["avatar-frames"], ["shop"]];
    case "protection": return [["point-protection"]];
    case "tag": return [["profile-tags"], ["equipped-profile-tags"]];
    case "feature": return [["has-feature"], ["shop"]];
    default: return [];
  }
}

function timeAgo(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["notifications", userId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await supabase.from("user_notifications").select("id, kind, title, body, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      if (r.error) throw r.error;
      return r.data as Notice[];
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notice;
        qc.setQueryData<Notice[]>(["notifications", userId], (list) => [n, ...(list ?? []).filter((x) => x.id !== n.id)].slice(0, 20));
        toast.success(n.title, { description: n.body ?? undefined });
        for (const k of refreshFor(n.kind)) void qc.invalidateQueries({ queryKey: k });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, qc]);

  const unread = data?.filter((n) => !n.read_at).length ?? 0;

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) {
      const { error } = await supabase.rpc("mark_notifications_read");
      if (!error) qc.setQueryData<Notice[]>(key, (list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={unread ? `Notificações, ${unread} novas` : "Notificações"} className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground">
          <Bell size={15} />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold">Notificações</p>
        {!data?.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p> :
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {data.map((n) => <li key={n.id} className={`px-4 py-3 text-sm ${n.read_at ? "" : "bg-primary/5"}`}>
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{n.title}</p><span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span></div>
              {n.body && <p className="mt-0.5 text-muted-foreground">{n.body}</p>}
            </li>)}
          </ul>}
      </PopoverContent>
    </Popover>
  );
}
