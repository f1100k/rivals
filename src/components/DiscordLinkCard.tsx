import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMyDiscordLink, linkDiscord, unlinkDiscord } from "@/lib/discord-voice.functions";

const CLIENT_ID = "1567379012471492668";
const STATE_KEY = "discord-link-state";

/**
 * Return addresses registered in the Discord app. Discord refuses any other address, so on
 * rivalsinhouse.app we come back through the registered lovable.app address, which forwards
 * to rivalsinhouse.app/perfil keeping the login data after the "#".
 */
export const DISCORD_REGISTERED_ORIGINS = [
  "https://level-up-rematch-hub.lovable.app",
  "https://id-preview--65ac68b6-10ae-4672-8626-ae4642662b17.lovable.app",
] as const;

export function discordRedirectFor(origin: string) {
  const registered = (DISCORD_REGISTERED_ORIGINS as readonly string[]).includes(origin) ? origin : DISCORD_REGISTERED_ORIGINS[0];
  return `${registered}/perfil`;
}

export function discordRedirectUri() {
  return discordRedirectFor(window.location.origin);
}

export function startDiscordLink() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: "token", scope: "identify", redirect_uri: discordRedirectUri(), state });
  window.location.href = `https://discord.com/oauth2/authorize?${params}`;
}

export function useDiscordLink() {
  const fn = useServerFn(getMyDiscordLink);
  return useQuery({ queryKey: ["discord-link"], queryFn: () => fn() });
}

let discordCallbackHandled = false;

/** Finish the Discord OAuth callback exactly once, no matter which mounted component sees the hash. */
export function useDiscordLinkCallback() {
  const qc = useQueryClient();
  const linkFn = useServerFn(linkDiscord);
  const [busy, setBusy] = useState(false);

  // Finish the Discord login when we come back with a token in the URL hash.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("access_token");
    const err = hash.get("error");
    if ((!token && !err) || discordCallbackHandled) return;
    discordCallbackHandled = true;
    history.replaceState(null, "", window.location.pathname);
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (err || !token) { toast.error("Ligação com o Discord cancelada."); return; }
    if (!expected || hash.get("state") !== expected) { toast.error("Ligação com o Discord inválida. Tenta de novo."); return; }
    setBusy(true);
    linkFn({ data: { accessToken: token } })
      .then((l) => { toast.success(`Discord ligado: ${l.username}`); return qc.invalidateQueries({ queryKey: ["discord-link"] }); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui ligar o Discord."))
      .finally(() => setBusy(false));
  }, [linkFn, qc]);

  return busy;
}

export function DiscordLinkCard() {
  const qc = useQueryClient();
  const { data: link, isLoading } = useDiscordLink();
  const unlinkFn = useServerFn(unlinkDiscord);
  const [unlinking, setUnlinking] = useState(false);
  const busy = useDiscordLinkCallback();

  async function unlink() {
    setUnlinking(true);
    try { await unlinkFn(); await qc.invalidateQueries({ queryKey: ["discord-link"] }); toast.success("Discord desligado."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    setUnlinking(false);
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/70 p-4">
      <h2 className="font-display text-lg uppercase">Discord</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ligue seu Discord para o bot te levar da Sala de espera para a call do seu time quando a partida começar.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isLoading ? <span className="text-sm text-muted-foreground">Carregando…</span> : link ? (
          <>
            <span className="text-sm">Ligado como <strong>{link.username}</strong></span>
            <Button variant="outline" size="sm" onClick={unlink} disabled={unlinking}>Desligar</Button>
          </>
        ) : (
          <Button onClick={startDiscordLink} disabled={busy} className="font-display uppercase">Conectar Discord</Button>
        )}
      </div>
    </div>
  );
}
