import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchPrintNames, type PrintName } from "@/lib/print-players";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { printName: { type: "string" }, siteName: { type: "string" } },
        required: ["printName", "siteName"],
      },
    },
  },
  required: ["players"],
};

const PROMPT = `Esta é uma captura de tela com nomes de jogadores (pode ser a tabela do jogo Rematch, uma lista do site, Discord etc.).
Liste cada nome de jogador que aparece, na ordem em que aparecem, sem repetir. printName = o nome exatamente como está escrito na imagem.
Ignore números, pontos, placares, títulos de colunas, botões e textos que não sejam nomes de jogador.
siteName: escolha da lista de jogadores do site abaixo o nome que corresponde a esse jogador (pode ter prefixo de clã, letras pequenas sobrescritas, maiúsculas ou pequenas diferenças). Copie o nome do site exatamente como está na lista. Se nenhum corresponder com segurança, siteName = "".`;

/** Admin-only: reads player names from a screenshot and links them to site accounts. */
export const readPrintPlayerNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { image: string }) => {
    if (typeof input.image !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(input.image)) throw new Error("Envie uma imagem PNG, JPG ou WEBP.");
    if (input.image.length > 8_000_000) throw new Error("Imagem muito grande (máx. ~6MB).");
    return { image: input.image };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !isAdmin) throw new Error("Apenas administradores podem usar essa função.");
    const { data: profiles, error } = await context.supabase.from("profiles").select("id, name").eq("is_ghost", false);
    if (error) throw new Error("Não consegui carregar a lista de jogadores.");
    const people = (profiles ?? []).map((p) => ({ id: p.id, name: p.name ?? "" })).filter((p) => p.name);

    const { aiMockEnabled, mockPrintNamesResponse } = await import("@/lib/ai-mock.server");
    const mock = aiMockEnabled() ? mockPrintNamesResponse(people) : null;
    const key = process.env["LOVABLE_API_KEY"];
    if (!key && !mock) throw new Error("Leitura de print indisponível no momento.");
    const res = mock ?? await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key!, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "nomes", strict: true, schema: SCHEMA } },
        input: [{ role: "user", content: [{ type: "input_text", text: `${PROMPT}\nJogadores do site: ${people.map((p) => JSON.stringify(p.name)).join(", ")}` }, { type: "input_image", image_url: data.image }] }],
      }),
    });
    if (!res.ok || !res.body) {
      console.error("print names", res.status, await res.text().catch(() => ""));
      throw new Error(res.status === 402 || res.status === 403 ? "Sem créditos de IA para ler o print agora." : res.status === 429 ? "Muitas leituras agora, tente de novo em instantes." : "Não consegui ler o print.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let done = "";
    let failed = false;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          if (ev.type === "response.output_text.done") done = ev.text ?? "";
          if (ev.type === "error" || ev.type === "response.failed") failed = true;
        } catch {
          /* partial or non-JSON line */
        }
      }
    }
    if (failed) throw new Error("Não consegui ler o print.");
    let rows: PrintName[];
    try {
      rows = (JSON.parse(done || text) as { players: PrintName[] }).players ?? [];
    } catch {
      throw new Error("Não consegui ler o print.");
    }
    if (!rows.length) throw new Error("Não achei nomes de jogadores nesse print.");
    return { players: matchPrintNames(rows, people) };
  });
