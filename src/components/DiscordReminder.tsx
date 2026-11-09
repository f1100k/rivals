import { MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import { startDiscordLink, useDiscordLink, useDiscordLinkCallback } from "./DiscordLinkCard";

/** Banner reminding every signed-in player to link their Discord account. */
export function DiscordReminder() {
  useDiscordLinkCallback();
  const { data: link, isLoading } = useDiscordLink();
  if (isLoading || link) return null;
  return (
    <aside className="border-b border-primary/30 bg-background/90 px-4 py-3" aria-label="Lembrete do Discord">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <MessageCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">Conecte seu Discord para o bot te colocar na call do seu time quando a partida começar.</p>
        <Button size="sm" variant="outline" onClick={startDiscordLink}>Conectar Discord</Button>
      </div>
    </aside>
  );
}
