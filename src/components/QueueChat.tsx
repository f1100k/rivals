import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const CHAT_MAX_LENGTH = 300;

export type ChatMessage = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  name: string;
  avatarUrl: string | null;
  isMe: boolean;
};

/**
 * Room chat on the queue page. `matchId = null` is the waiting-room chat for
 * everyone in the queue; a match id is the private chat of that match's players.
 * Access, length and spam rules are enforced by the database RPCs.
 */
export function QueueChat({
  matchId,
  title,
  subtitle,
  isStaff = false,
  className = "",
}: {
  matchId: string | null;
  title: string;
  subtitle?: string;
  isStaff?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const key = ["queue-chat", matchId ?? "lobby"];
  const { data: messages = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await supabase.rpc("get_queue_chat", matchId ? { p_match: matchId } : {});
      if (r.error) throw r.error;
      return (r.data ?? []) as unknown as ChatMessage[];
    },
    // Realtime is the main signal; this is only a safety net if the socket drops.
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`queue-chat-${matchId ?? "lobby"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_chat_messages" }, (payload) => {
        const row = (payload.new && "match_id" in payload.new ? payload.new : payload.old) as { match_id?: string | null } | null;
        if (payload.eventType === "DELETE" || (row?.match_id ?? null) === matchId) {
          queryClient.invalidateQueries({ queryKey: ["queue-chat", matchId ?? "lobby"] });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await supabase.rpc("send_queue_chat", { p_match: matchId as string, p_body: body });
    setSending(false);
    if (r.error) {
      toast.error(r.error.message || "Não foi possível mandar a mensagem.");
      return;
    }
    setText("");
    queryClient.invalidateQueries({ queryKey: key });
  }

  async function remove(id: string) {
    const r = await supabase.rpc("delete_queue_chat_message", { p_id: id });
    if (r.error) toast.error(r.error.message);
    else queryClient.invalidateQueries({ queryKey: key });
  }

  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-border bg-card ${className}`} aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle size={16} className="text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em]">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div ref={listRef} className="h-72 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 lg:h-auto lg:min-h-72">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Ninguém falou nada ainda. Mande um oi!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`group flex items-start gap-2 ${m.isMe ? "flex-row-reverse" : ""}`}>
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-xs font-bold text-primary">
                <Avatar path={m.avatarUrl} name={m.name} userId={m.userId} />
              </span>
              <div className={`min-w-0 max-w-[80%] rounded-lg px-3 py-1.5 ${m.isMe ? "bg-primary/15 ring-1 ring-primary/40" : "bg-muted"}`}>
                <p className={`flex items-center gap-2 text-[11px] text-muted-foreground ${m.isMe ? "justify-end" : ""}`}>
                  <span className="truncate font-semibold text-foreground">{m.isMe ? "Você" : m.name}</span>
                  <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                  {isStaff && (
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100"
                      aria-label={`Apagar mensagem de ${m.name}`}
                      title="Apagar mensagem"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Escreva uma mensagem…"
          aria-label="Mensagem"
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Enviar mensagem">
          <Send size={16} />
        </Button>
      </form>
    </section>
  );
}
