// Server-only sweep; its cursor lives on the preserved Discord queue panel.
import { DISCORD_APPLICATION, DISCORD_QUEUE_CHANNEL, queuePanel } from "./discord-queue";

type Message = { id: string; author: { id: string }; components?: { components?: { custom_id?: string }[] }[]; embeds?: { footer?: { text?: string } }[] };
const CURSOR = "queue-cleaned:";

function isQueuePanel(message: Message) {
  const ids = new Set(message.components?.flatMap((row) => row.components?.map((c) => c.custom_id) ?? []) ?? []);
  return message.author.id === DISCORD_APPLICATION && queuePanel().components.every((row) => row.components.every((c) => ids.has(c.custom_id)));
}

async function api(method: string, path: string, body?: unknown) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["DISCORD_API_KEY"];
  if (!lovable || !connection) throw new Error("Discord não configurado");
  const response = await fetch(`https://connector-gateway.lovable.dev/discord/channels/${DISCORD_QUEUE_CHANNEL}${path}`, {
    method, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (method === "DELETE" && response.status === 404) return response;
  if (!response.ok) {
    const error = await response.text();
    console.error(`Discord queue cleanup failed [${response.status}]: ${error}`);
    throw new Error(`Discord queue cleanup ${response.status}: ${error}`);
  }
  return response;
}

export async function cleanupFinishedQueueChannel() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: match, error } = await supabaseAdmin.from("matches")
    .select("id, status, completed_at").in("status", ["completed", "cancelled"])
    .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!match || !["completed", "cancelled"].includes(match.status) || !match.completed_at) return;
  const endedAt = Date.parse(match.completed_at);
  if (!Number.isFinite(endedAt)) return;

  // Scan before deleting so a missing or untrusted panel can never empty #fila.
  const messages: Message[] = [];
  let before = "";
  for (let page = 0; page < 20; page++) {
    const response = await api("GET", `/messages?limit=100${before ? `&before=${before}` : ""}`);
    const batch = await response.json() as Message[];
    messages.push(...batch);
    if (batch.length < 100) break;
    const last = batch.at(-1);
    if (!last || last.id === before) throw new Error("Discord history pagination stalled");
    before = last.id;
    if (page === 19) throw new Error("Discord queue history exceeds safe cleanup limit");
  }
  const panels = messages.filter(isQueuePanel);
  const panel = panels[0];
  if (!panel || panel.embeds?.some((embed) => embed.footer?.text === `${CURSOR}${match.id}`)) return;

  // Confirm the persisted state again immediately before destructive work.
  const { data: confirmed, error: confirmError } = await supabaseAdmin.from("matches")
    .select("status, completed_at").eq("id", match.id).maybeSingle();
  if (confirmError) throw new Error(confirmError.message);
  if (!confirmed || !["completed", "cancelled"].includes(confirmed.status) || confirmed.completed_at !== match.completed_at) return;
  const preserved = new Set(panels.map((p) => p.id));
  for (const message of messages) {
    const sentAt = Number(BigInt(message.id) >> 22n) + 1420070400000;
    // Keep new conversations belonging to the next match, including concurrent messages.
    if (!preserved.has(message.id) && sentAt <= endedAt) await api("DELETE", `/messages/${message.id}`);
  }
  const payload = queuePanel();
  await api("PATCH", `/messages/${panel.id}`, {
    ...payload, embeds: payload.embeds.map((embed) => ({ ...embed, footer: { text: `${CURSOR}${match.id}` } })),
  });
}