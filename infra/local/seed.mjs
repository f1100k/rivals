// Dados iniciais do ambiente local: buckets, admin, moderador e jogadores de teste.
// Só roda em banco novo (quando o admin ainda não existe), para não apagar o que você testou.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

export const PASSWORD = "local123456";

// Mesmo UUID do dono em produção: `can_edit_frame_fits()` tem esse id fixo (migration 0061).
const ADMIN_ID = "75ecb680-4220-4411-b0b6-ea981f102c2f";

const BUCKETS = [
  ["avatars", true],
  ["frame-art", true],
  ["promos", true],
  ["name-fonts", true],
  ["emblems", true],
  ["match-prints", true],
  ["player-videos", false],
];

const GHOST_DEPENDENT_TABLES = ["queue", "point_protection_events", "point_protection_wallets"];

const POSITIONS = ["Goleiro", "Pivô", "Ala", "Fixo", "Ala", "Pivô"];

function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function seed(url, serviceKey, dbUrl) {
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const [name, isPublic] of BUCKETS) {
    const { error } = await db.storage.createBucket(name, { public: isPublic });
    if (error && !/already exists/i.test(error.message))
      throw new Error(`bucket ${name}: ${error.message}`);
  }

  const existing = await db.auth.admin.getUserById(ADMIN_ID);
  if (existing.data?.user) return { seeded: false };

  // As migrations 0004/0005 deixam 9 "Fantasmas" na fila real; o banco local começa com ela vazia.
  // São removidos por SQL porque foram inseridos direto em auth.users e a API de auth não os carrega.
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  await sql.begin(async (tx) => {
    for (const table of GHOST_DEPENDENT_TABLES)
      await tx`DELETE FROM ${tx(table)} WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@fantasma.invalid')`;
    await tx`DELETE FROM auth.users WHERE email LIKE '%@fantasma.invalid'`;
  });
  await sql.end();

  const create = async (email, name, primary, id) =>
    must(
      await db.auth.admin.createUser({
        ...(id ? { id } : {}),
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name, primary_position: primary },
      }),
      `criar ${email}`,
    ).user.id;

  const adminId = await create("admin@local.test", "Admin Local", "Ala", ADMIN_ID);
  const modId = await create("mod@local.test", "Moderador Local", "Fixo");
  must(
    await db.from("user_roles").insert([
      { user_id: adminId, role: "admin" },
      { user_id: modId, role: "moderator" },
    ]),
    "definir cargos",
  );

  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, "0");
    const id = await create(
      `jogador${n}@local.test`,
      `Jogador ${n}`,
      POSITIONS[(i - 1) % POSITIONS.length],
    );
    // MMRs diferentes: os dois maiores viram capitães e o ranking não fica vazio.
    must(
      await db
        .from("profiles")
        .update({ rating: 1300 - i * 75 })
        .eq("id", id),
      `rating de ${n}`,
    );
  }
  return { seeded: true };
}
