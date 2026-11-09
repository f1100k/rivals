// Comandos do ambiente local. Ver infra/local/README.md.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const supabaseBin = path.join(here, "node_modules", "supabase", "dist", "supabase.js");
const migrationsIn = path.join(root, "drizzle", "migrations");
const migrationsOut = path.join(here, "supabase", "migrations");
const envFile = path.join(root, ".env.local");
const ENV_MARKER = "# Gerado por infra/local/cli.mjs";
const SITE = "https://rivalsinhouse.app";
const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Chakra+Petch:wght@500;700&display=swap";

// Migrations que assumem dados de produção: ajustadas só na cópia gerada, nunca em drizzle/.
const PATCHES = {
  "0054_owner_loss_shield": [
    [
      "INSERT INTO public.loss_shield_owners(user_id) VALUES ('75ecb680-4220-4411-b0b6-ea981f102c2f') ON CONFLICT DO NOTHING;",
      "-- local: o usuário de produção não existe em banco novo.",
    ],
  ],
};

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function run(command, args, cwd = root) {
  // npm/npx são .cmd no Windows e precisam de shell; os argumentos aqui são sempre fixos.
  const result =
    process.platform === "win32" && command !== process.execPath
      ? spawnSync(`${command} ${args.join(" ")}`, { cwd, stdio: "inherit", shell: true })
      : spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) fail(`Falhou: ${command} ${args.join(" ")}`);
}

function supabase(...args) {
  run(process.execPath, [supabaseBin, ...args], here);
}

function requireSetup() {
  if (
    !fs.existsSync(supabaseBin) ||
    !fs.existsSync(path.join(root, "node_modules", "@supabase", "supabase-js"))
  )
    fail("Dependências ausentes. Rode `npm run local:setup` uma vez, com internet.");
}

function requireDocker() {
  const result = spawnSync("docker info", { stdio: "ignore", shell: true });
  if (result.status !== 0)
    fail("O Docker não está respondendo. Abra o Docker Desktop e tente de novo.");
}

/** Cada migration vira um arquivo em transação própria, na ordem do journal do Drizzle. */
function prepareMigrations() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsIn, "meta", "_journal.json"), "utf8"),
  );
  fs.rmSync(migrationsOut, { recursive: true, force: true });
  fs.mkdirSync(migrationsOut, { recursive: true });
  const start = 20200101000000n;
  for (const entry of journal.entries) {
    let sql = fs.readFileSync(path.join(migrationsIn, `${entry.tag}.sql`), "utf8");
    for (const [from, to] of PATCHES[entry.tag] ?? []) {
      if (!sql.includes(from))
        fail(`O ajuste local de ${entry.tag} não encontrou o trecho esperado.`);
      sql = sql.replace(from, to);
    }
    const version = (start + BigInt(entry.idx)).toString();
    fs.writeFileSync(
      path.join(migrationsOut, `${version}_${entry.tag}.sql`),
      `BEGIN;\n${sql}\n;COMMIT;\n`,
    );
  }
  return journal.entries.length;
}

function status() {
  const result = spawnSync(process.execPath, [supabaseBin, "status", "-o", "json"], {
    cwd: here,
    encoding: "utf8",
  });
  const text = result.stdout ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = json ? JSON.parse(json) : {};
  if (!parsed.API_URL) fail("Não consegui ler o status do Supabase local.");
  return parsed;
}

function writeEnv(info) {
  if (fs.existsSync(envFile) && !fs.readFileSync(envFile, "utf8").startsWith(ENV_MARKER))
    fail(
      ".env.local já existe e não foi gerado por este script. Renomeie o arquivo e rode de novo.",
    );
  fs.writeFileSync(
    envFile,
    [
      `${ENV_MARKER}; não versionar (sobrepõe o .env sincronizado com a Lovable).`,
      `SUPABASE_URL="${info.API_URL}"`,
      `SUPABASE_PUBLISHABLE_KEY="${info.PUBLISHABLE_KEY}"`,
      `SUPABASE_SERVICE_ROLE_KEY="${info.SECRET_KEY}"`,
      `VITE_SUPABASE_URL="${info.API_URL}"`,
      `VITE_SUPABASE_PUBLISHABLE_KEY="${info.PUBLISHABLE_KEY}"`,
      `VITE_LOCAL_OFFLINE="1"`,
      `LOCAL_AI_MOCK="1"`,
      "",
    ].join("\n"),
  );
}

async function applySeed(info) {
  const { seed, PASSWORD } = await import("./seed.mjs");
  const result = await seed(info.API_URL, info.SERVICE_ROLE_KEY, info.DB_URL);
  console.log(
    result.seeded
      ? `\nSeed aplicado (senha de todos: ${PASSWORD}).`
      : "\nSeed já aplicado; dados mantidos.",
  );
}

function readAssets(dir, found = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) readAssets(full, found);
    else if (item.name.endsWith(".asset.json"))
      found.push(JSON.parse(fs.readFileSync(full, "utf8")).url);
  }
  return found;
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** Os assets são servidos pela hospedagem da Lovable; localmente saem de public/ (ignorado pelo git). */
async function fetchAssets() {
  const urls = readAssets(path.join(root, "src", "assets"));
  for (const url of urls) {
    const target = path.join(root, "public", url);
    if (!fs.existsSync(target)) await download(SITE + url, target);
  }
  console.log(`Assets prontos: ${urls.length}.`);
}

async function fetchFonts() {
  const dir = path.join(root, "public", "__local-fonts");
  const cssFile = path.join(dir, "fonts.css");
  if (fs.existsSync(cssFile)) return;
  const response = await fetch(FONTS_CSS, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Google Fonts respondeu ${response.status}`);
  let css = await response.text();
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) ?? [])];
  for (const url of urls) {
    const name = url.split("/").pop();
    await download(url, path.join(dir, name));
    css = css.replaceAll(url, `/__local-fonts/${name}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cssFile, css);
  console.log(`Fontes prontas: ${urls.length} arquivos.`);
}

function loadLocalEnv() {
  if (!fs.existsSync(envFile)) fail("Falta o .env.local. Rode `npm run local:up` primeiro.");
  const values = {};
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_0-9]+)="(.*)"$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const commands = {
  /** Único passo que precisa de internet. */
  async setup() {
    requireDocker();
    run("npm", ["install", "--no-audit", "--no-fund"], here);
    run("npx", ["--yes", "bun@latest", "install", "--frozen-lockfile"]);
    await fetchAssets();
    await fetchFonts();
    await commands.up();
    console.log("\nSetup concluído. A partir de agora não precisa de internet.");
  },

  async up() {
    requireSetup();
    requireDocker();
    const total = prepareMigrations();
    supabase("start");
    // Em banco já existente, aplica só as migrations novas vindas da Lovable.
    supabase("migration", "up");
    const info = status();
    writeEnv(info);
    await applySeed(info);
    console.log(`\nPronto (${total} migrations no journal).`);
    console.log(`  App:     npm run local:dev  →  http://localhost:8080`);
    console.log(`  Studio:  ${info.STUDIO_URL}`);
    console.log(`  E-mails: ${info.MAILPIT_URL}`);
  },

  async reset() {
    requireSetup();
    requireDocker();
    prepareMigrations();
    supabase("db", "reset", "--no-seed");
    const info = status();
    writeEnv(info);
    await applySeed(info);
  },

  down() {
    requireSetup();
    supabase("stop");
  },

  status() {
    requireSetup();
    supabase("status");
  },

  dev() {
    loadLocalEnv();
    run("npx", ["vite", "dev"]);
  },

  build() {
    loadLocalEnv();
    process.env.LOCAL_NODE_BUILD = "1";
    run("npx", ["vite", "build"]);
  },

  start() {
    const env = { ...process.env, ...loadLocalEnv(), PORT: process.env.PORT ?? "8080" };
    const server = spawn(process.execPath, [path.join(root, ".output", "server", "index.mjs")], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    server.on("exit", (code) => process.exit(code ?? 0));
  },
};

const name = process.argv[2];
if (!commands[name])
  fail(`Comando desconhecido: ${name ?? "(nenhum)"}. Use: ${Object.keys(commands).join(", ")}.`);
await commands[name]();
