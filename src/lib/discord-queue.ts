import { z } from "zod";
import { SITE_URL } from "./links";

export const DISCORD_APPLICATION = "1567379012471492668";
export const DISCORD_GUILD = "1567373771617337474";
export const DISCORD_QUEUE_CHANNEL = "1567382123516797008";
export const DISCORD_VERIFY_KEY = "a335e349aff5687f2033a1e56354f9beaf2ee7573b77e35088cb68c5fe6b8be9";
export const queuePositions = ["Goleiro", "Pivô", "Ala", "Fixo"] as const;
const snowflake = z.string().regex(/^\d{17,20}$/);
export const queueInteraction = z.object({
  id: snowflake, application_id: z.literal(DISCORD_APPLICATION), type: z.literal(3),
  token: z.string().min(10).max(2048), guild_id: z.literal(DISCORD_GUILD),
  channel_id: z.literal(DISCORD_QUEUE_CHANNEL), member: z.object({ user: z.object({ id: snowflake }) }),
  data: z.object({ custom_id: z.string().max(100), component_type: z.literal(2) }),
});

export function queueAction(customId: string) {
  const position = queuePositions.find((p) => customId === `queue:join:${p}`);
  if (position) return { action: "join", position };
  if (customId === "queue:leave") return { action: "leave", position: null };
  if (customId === "queue:heartbeat") return { action: "heartbeat", position: null };
  return null;
}

export function queueError(message: string) {
  if (message.includes("discord_not_linked")) return `Conecte seu Discord no Perfil do site antes de entrar: ${SITE_URL}/perfil`;
  if (message.includes("finalize_partida_atual")) return "Você já está em uma partida. Termine a votação antes de entrar ou sair da fila.";
  if (message.includes("jogador_suspenso")) return "Sua conta está suspensa e não pode entrar na fila.";
  return "Não foi possível atualizar sua fila. Tente novamente.";
}

export function queuePanel() {
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ title: "Fila In-house · 5v5", description: `Escolha sua posição para entrar na mesma fila do site.\nConta vinculada: **Perfil → Conectar Discord**.\nConfirme **Ainda estou aqui** a cada 10 minutos ou mantenha a fila aberta no site.\nDraft e votação: ${SITE_URL}/queue` }],
    components: [
      { type: 1, components: queuePositions.map((p) => ({ type: 2, style: 1, label: p, custom_id: `queue:join:${p}` })) },
      { type: 1, components: [{ type: 2, style: 2, label: "Ainda estou aqui", custom_id: "queue:heartbeat" }, { type: 2, style: 4, label: "Sair da fila", custom_id: "queue:leave" }] },
    ],
  };
}