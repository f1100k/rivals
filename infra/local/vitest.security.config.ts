// Suíte de segurança: fala com o Supabase local de verdade, por isso fica fora do `npm test`.
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname, "../..");

function localEnv() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) throw new Error("Falta o .env.local. Rode `npm run local:up` primeiro.");
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_0-9]+)="(.*)"$/.exec(line);
    if (match) values[match[1]!] = match[2]!;
  }
  return values;
}

export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["infra/local/security/**/*.test.ts"],
    env: localEnv(),
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: { alias: { "@": path.join(root, "src") } },
});
