import { DISCORD_APPLICATION, DISCORD_VERIFY_KEY, queueAction, queueError, queueInteraction } from "./discord-queue";
import { SITE_URL } from "./links";

function bytes(hex: string) { return Uint8Array.from(hex.match(/.{2}/g) ?? [], (value) => parseInt(value, 16)); }

export async function verifyDiscordRequest(request: Request, body: string) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", bytes(DISCORD_VERIFY_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, bytes(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

async function discord(method: string, path: string, body: unknown, lovable: string, connection: string) {
  const res = await fetch(`https://connector-gateway.lovable.dev/discord${path}`, {
    method, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Do not log the request URL: interaction tokens are credentials.
    const error = await res.text();
    console.error(`Discord queue request failed [${res.status}]: ${error}`);
    throw new Error(`Discord queue response ${res.status}`);
  }
}

export async function handleQueueInteraction(request: Request, lovable: string, connection: string) {
  const body = await request.text();
  if (!(await verifyDiscordRequest(request, body))) return new Response("Invalid signature", { status: 401 });
  let input: unknown;
  try { input = JSON.parse(body); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (typeof input === "object" && input !== null && "type" in input && input.type === 1) return Response.json({ type: 1 });
  const parsed = queueInteraction.safeParse(input);
  if (!parsed.success) return new Response("Invalid interaction", { status: 400 });
  const interaction = parsed.data;
  const action = queueAction(interaction.data.custom_id);
  if (!action) return Response.json({ type: 4, data: { content: "Opção de fila inválida.", flags: 64 } });
  // Acknowledge through Discord's callback immediately, then await all work in
  // this request: no detached promises depending on Worker lifetime.
  await discord("POST", `/interactions/${interaction.id}/${interaction.token}/callback`, { type: 5, data: { flags: 64 } }, lovable, connection);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("discord_queue_action", {
    p_discord_id: interaction.member.user.id, p_interaction_id: interaction.id,
    p_action: action.action, ...(action.position ? { p_position: action.position } : {}),
  });
  const content = error ? queueError(error.message)
    : data === "joined" ? `Você entrou na fila como **${action.position}**. Abra o site para acompanhar o draft: ${SITE_URL}/queue`
    : data === "left" ? "Você saiu da fila."
    : data === "present" ? "Presença confirmada. Você continua na fila por mais 10 minutos."
    : "Você não está na fila. Se a partida já começou, acompanhe pelo site.";
  await discord("PATCH", `/webhooks/${DISCORD_APPLICATION}/${interaction.token}/messages/@original`, { content, allowed_mentions: { parse: [] } }, lovable, connection);
  return new Response(null, { status: 204 });
}