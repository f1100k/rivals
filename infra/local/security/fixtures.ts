// Contas e partidas descartáveis para os testes de segurança; nada do seed é tocado.
import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

const API_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Segredo padrão da CLI do Supabase local; o guard abaixo impede rodar fora da máquina.
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const EMAIL_DOMAIN = "security.test";

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API_URL ?? ""))
  throw new Error(`Os testes de segurança só rodam no Supabase local, não em ${API_URL}.`);

export const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
  max: 2,
  onnotice: () => {},
});

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(API_URL, SERVICE_KEY, noSession);
export const anon = createClient(API_URL, ANON_KEY, noSession);

export interface Player {
  id: string;
  client: SupabaseClient;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** Mesmo formato de token do GoTrue, sem esbarrar no rate limit de login. */
function tokenFor(id: string) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: id,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

export function clientFor(id: string): SupabaseClient {
  const token = tokenFor(id);
  return createClient(API_URL, ANON_KEY, { accessToken: async () => token });
}

export async function createPlayers(count: number): Promise<Player[]> {
  const run = randomUUID().slice(0, 8);
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `sec-${run}-${index}@${EMAIL_DOMAIN}`,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { name: `Sec ${run} ${index}`, primary_position: "Ala" },
      });
      if (error || !data.user) throw new Error(`criar jogador de teste: ${error?.message}`);
      await sql`UPDATE public.profiles SET rating = 1000 WHERE id = ${data.user.id}`;
      return { id: data.user.id, client: clientFor(data.user.id) };
    }),
  );
}

const createdMatches = new Set<string>();

export interface MatchOptions {
  status: string;
  region?: string;
  print?: { by: string; scoreA: number; scoreB: number; approved: boolean };
}

/** Partida 5x5: os cinco primeiros jogadores no time A, os cinco seguintes no time B. */
export async function createMatch(players: Player[], options: MatchOptions): Promise<string> {
  const print = options.print;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.matches
      (mode, region, status, captain_a, captain_b, shot_by, shot_score_a, shot_score_b, shot_path, shot_approved)
    VALUES
      (5, ${options.region ?? "SA"}, ${options.status}, ${players[0]!.id}, ${players[5]!.id},
       ${print?.by ?? null}, ${print?.scoreA ?? null}, ${print?.scoreB ?? null},
       ${print ? "fixture/print.png" : null}, ${print?.approved ?? false})
    RETURNING id`;
  const id = row!.id;
  createdMatches.add(id);
  for (const [index, player] of players.slice(0, 10).entries()) {
    await sql`
      INSERT INTO public.match_players (match_id, user_id, team, rating_before, position, accepted)
      VALUES (${id}, ${player.id}, ${index < 5 ? "a" : "b"}, 1000, 'Ala', true)`;
  }
  return id;
}

export async function matchRow(id: string) {
  const [row] = await sql<
    { status: string; shot_approved: boolean; shot_by: string | null; shot_score_a: number | null }[]
  >`SELECT status, shot_approved, shot_by, shot_score_a FROM public.matches WHERE id = ${id}`;
  return row;
}

export async function statsOf(match: string, user: string) {
  const [row] = await sql<{ goals: number; mvp: boolean }[]>`
    SELECT goals, mvp FROM public.match_player_stats WHERE match_id = ${match} AND user_id = ${user}`;
  return row;
}

export async function deleteMatches() {
  const ids = [...createdMatches];
  createdMatches.clear();
  await removeMatches(ids);
}

/** Apaga as linhas que bloqueariam a remoção (FKs sem CASCADE, como as criadas ao finalizar). */
async function clearReferences(parent: string, ids: string[]) {
  const references = await sql<{ source: string; column: string }[]>`
    SELECT c.conrelid::regclass::text AS source, a.attname AS column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = ${parent}::regclass AND c.confdeltype IN ('a', 'r')`;
  for (const { source, column } of references)
    await sql.unsafe(`DELETE FROM ${source} WHERE ${column} = ANY($1)`, [ids]);
}

async function removeMatches(ids: string[]) {
  if (!ids.length) return;
  await clearReferences("public.matches", ids);
  await sql`DELETE FROM public.matches WHERE id = ANY(${ids})`;
}

export async function clearAvatars(user: string) {
  const bucket = admin.storage.from("avatars");
  const { data } = await bucket.list(user, { limit: 1000 });
  if (data?.length) await bucket.remove(data.map((file) => `${user}/${file.name}`));
}

/** Remove tudo o que a suíte criou, inclusive sobras de uma execução interrompida. */
export async function cleanup() {
  await deleteMatches();
  const users = await sql<{ id: string }[]>`
    SELECT id FROM auth.users WHERE email LIKE ${`sec-%@${EMAIL_DOMAIN}`}`;
  const ids = users.map((user) => user.id);
  if (!ids.length) return;
  for (const id of ids) await clearAvatars(id);
  const matches = await sql<{ match_id: string }[]>`
    SELECT DISTINCT match_id FROM public.match_players WHERE user_id = ANY(${ids})`;
  await removeMatches(matches.map((match) => match.match_id));
  await sql`DELETE FROM public.queue WHERE user_id = ANY(${ids})`;
  await clearReferences("public.profiles", ids);
  await sql`DELETE FROM auth.users WHERE id = ANY(${ids})`;
}

export const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
