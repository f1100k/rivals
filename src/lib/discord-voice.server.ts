// Server-only: temporary Team A / Team B voice calls on the Discord server.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/discord";
export const GUILD_ID = "1567373771617337474"; // RIVALS InHouse
export const WAITING_ROOM = "1567373773001334980"; // Sala de espera ⌚
const VOICE_CATEGORY = "1567373773001334979"; // Canais de voz

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const discord = process.env["DISCORD_API_KEY"];
  if (!lovable || !discord) throw new Error("Discord não configurado");
  return fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": discord, "Content-Type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

async function must(res: Response, what: string) {
  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord ${what} failed [${res.status}]: ${text}`);
    throw new Error(`Discord ${what} ${res.status}: ${text}`);
  }
  return res;
}

/** Current voice channel of a member, or null when not connected to voice. */
export async function voiceChannelOf(discordId: string): Promise<string | null> {
  const res = await api("GET", `/guilds/${GUILD_ID}/voice-states/${discordId}`);
  if (res.status === 404) return null;
  await must(res, "voice-state");
  const json = (await res.json()) as { channel_id: string | null };
  return json.channel_id ?? null;
}

export async function moveMember(discordId: string, channelId: string) {
  await must(await api("PATCH", `/guilds/${GUILD_ID}/members/${discordId}`, { channel_id: channelId }), "move");
}

export async function createVoiceChannel(name: string): Promise<string> {
  const res = await must(await api("POST", `/guilds/${GUILD_ID}/channels`, { name, type: 2, parent_id: VOICE_CATEGORY }), "create channel");
  return ((await res.json()) as { id: string }).id;
}

export async function deleteChannel(channelId: string) {
  const res = await api("DELETE", `/channels/${channelId}`);
  if (res.status === 404) return;
  await must(res, "delete channel");
}
