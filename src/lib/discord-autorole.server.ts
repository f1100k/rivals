// Server-only: give the Membro role to every person the site can reach.
//
// Two sweeps, in order:
// 1. Accounts linked on the site (discord_links). Each one is fetched and
//    patched individually, so this works with the bot's normal permissions.
// 2. The whole member list, which only works while the bot has the privileged
//    "Server Members Intent" switched on in the Developer Portal. When it is
//    off, Discord answers 403 and the sweep is skipped without failing the run.
import { GUILD_ID } from "./discord-voice.server";
import {
  MEMBER_ROLE_ID,
  memberNeedsRole,
  membersMissingRole,
  type GuildMember,
} from "./discord-autorole";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/discord";

async function api(method: string, path: string): Promise<Response> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const discord = process.env["DISCORD_API_KEY"];
  if (!lovable || !discord) throw new Error("Discord não configurado");
  return fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": discord },
  });
}

async function grantRole(discordId: string): Promise<boolean> {
  const member = await api("GET", `/guilds/${GUILD_ID}/members/${discordId}`);
  if (member.status === 404) return false; // not in this server
  if (!member.ok) {
    console.error(`Discord read member ${discordId} [${member.status}]: ${await member.text()}`);
    return false;
  }
  if (!memberNeedsRole((await member.json()) as GuildMember)) return false;
  const put = await api("PUT", `/guilds/${GUILD_ID}/members/${discordId}/roles/${MEMBER_ROLE_ID}`);
  if (!put.ok) {
    console.error(`Discord add role ${discordId} [${put.status}]: ${await put.text()}`);
    return false;
  }
  return true;
}

async function linkedDiscordIds(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("discord_links").select("discord_id");
  if (error) throw new Error(`Discord links read failed: ${error.message}`);
  return (data ?? []).map((row) => row.discord_id).filter((id): id is string => Boolean(id));
}

/** People who never linked their account, discovered from the member list. */
async function sweepMemberList(): Promise<number> {
  const all: GuildMember[] = [];
  let after = "0";
  for (let page = 0; page < 20; page++) {
    const res = await api("GET", `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    if (!res.ok) throw new Error(`Discord list members ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as GuildMember[];
    all.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1]!.user!.id;
  }
  let added = 0;
  for (const id of membersMissingRole(all)) {
    const res = await api("PUT", `/guilds/${GUILD_ID}/members/${id}/roles/${MEMBER_ROLE_ID}`);
    if (res.ok) added++;
    else console.error(`Discord add role ${id} failed [${res.status}]: ${await res.text()}`);
  }
  return added;
}

export async function syncMemberRole(): Promise<{
  added: number;
  checked: number;
  listSweep: string;
}> {
  const ids = await linkedDiscordIds();
  let added = 0;
  for (const id of ids) {
    if (await grantRole(id)) added++;
  }

  let listSweep = "skipped";
  try {
    listSweep = `added ${await sweepMemberList()}`;
  } catch (e) {
    listSweep = "unavailable";
    console.error("Member list sweep skipped", e);
  }

  return { added, checked: ids.length, listSweep };
}
