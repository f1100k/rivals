import type { Database } from "@/integrations/supabase/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import coinIcon from "@/assets/coin-r.png.asset.json";
import { Check, Eye, Frame, Package, Palette, Pencil, Save, Type } from "lucide-react";
import { useNameColorCatalog } from "@/components/NameColors";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAvatarUrl, useFrameFits, useFrameCatalog } from "@/components/Avatar";
import { frameStyle, resolveFit, type AvatarFrameDef } from "@/lib/avatar-frames";
import { visibleShopItems } from "@/lib/shop-display";
import { FontSample, PlayerName } from "@/components/NameFonts";

export const Route = createFileRoute("/_authenticated/loja")({
  head: () => ({
    meta: [
      { title: "Loja · Inhouse Rematch" },
      { name: "description", content: "Troque suas moedas por molduras, fontes e cores para o seu nome." },
      { property: "og:title", content: "Loja · Inhouse Rematch" },
      { property: "og:description", content: "Troque suas moedas por molduras, fontes e cores para o seu nome." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopPage,
});

function CoinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <img src={coinIcon.url} alt="moedas" className={`${className} inline-block object-contain`} />;
}

const ERRORS: Record<string, string> = {
  saldo_insuficiente: "Moedas insuficientes.",
  ja_comprado: "Você já tem esse item.",
  sem_permissao: "A loja está liberada só para admins por enquanto.",
  item_invalido: "Item indisponível.",
};
const errMsg = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;

type ShopTab = "frame" | "font" | "name_color" | "other";
type ShopItem = Database["public"]["Tables"]["shop_items"]["Row"];
const tabOf = (kind: string): ShopTab => (kind === "frame" || kind === "font" || kind === "name_color" ? kind : "other");

const SHOP_TABS: { id: ShopTab; label: string; icon: typeof Frame; title: string; intro: string; steps: string[]; empty: string }[] = [
  {
    id: "frame",
    label: "Molduras",
    icon: Frame,
    title: "Molduras para a sua foto",
    intro: "A moldura fica em volta da sua foto de perfil e todo mundo vê: no ranking, na fila e no seu perfil.",
    steps: [
      "Clique no olho para ver a moldura com a sua própria foto.",
      "Gostou? Clique em Comprar. As moedas saem do seu saldo.",
      "Vá em Perfil e escolha a moldura comprada para usar.",
    ],
    empty: "Nenhuma moldura à venda agora.",
  },
  {
    id: "font",
    label: "Fontes",
    icon: Type,
    title: "Fontes para o seu nome",
    intro: "A fonte muda o jeito que o seu nome aparece escrito para todo mundo no site.",
    steps: [
      "Cada cartão já mostra o seu nome escrito com aquela fonte. Clique nele para ver maior.",
      "Gostou? Clique em Comprar. As moedas saem do seu saldo.",
      "Vá em Perfil → Fonte do nome e escolha a fonte para usar.",
    ],
    empty: "Nenhuma fonte à venda agora.",
  },
  {
    id: "name_color",
    label: "Cores",
    icon: Palette,
    title: "Cores e efeitos para o seu nome",
    intro: "A cor pinta o seu nome (lisa, degradê, neon, metálico…) e combina com a fonte que você usa. Todo mundo vê.",
    steps: [
      "Cada cartão já mostra o seu nome com aquela cor e a sua fonte. Clique nele para ver maior.",
      "Gostou? Clique em Comprar. As moedas saem do seu saldo.",
      "Vá em Perfil → Cor do nome e escolha a cor para usar.",
    ],
    empty: "Nenhuma cor à venda agora.",
  },
  {
    id: "other",
    label: "Outros",
    icon: Package,
    title: "Outros itens",
    intro: "Itens especiais da loja.",
    steps: ["Veja o nome e o preço do item.", "Clique em Comprar. As moedas saem do seu saldo.", "O item fica guardado na sua conta."],
    empty: "Nenhum item aqui agora.",
  },
];

function FramePreview({ frame, avatarPath, name, size }: { frame?: AvatarFrameDef | undefined; avatarPath?: string | null | undefined; name: string; size: string }) {
  const url = useAvatarUrl(avatarPath);
  const fits = useFrameFits();
  return (
    <span className={`relative grid place-items-center ${size}`}>
      <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-muted text-2xl font-bold [clip-path:circle(50%)]">
        {url ? <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
      </span>
      {frame && <img src={frame.image} alt="" aria-hidden className="avatar-frame-img" style={frameStyle(resolveFit(frame, fits.data?.[frame.id]))} />}
    </span>
  );
}

function ShopPage() {
  const catalog = useFrameCatalog();
  const colorCatalog = useNameColorCatalog();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string; kind: string } | null>(null);
  const [tab, setTab] = useState<ShopTab>("frame");

  const { data: me } = useQuery({
    queryKey: ["shop-me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id;
      if (!id) return null;
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").eq("id", id).single(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      if (!p.data) return null;
      return { ...p.data, isAdmin: !!r.data?.some((x) => x.role === "admin") };
    },
  });
  const isAdmin = !!me?.isAdmin;
  // Admin-only inline price editing; players never see these controls.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const editMode = isAdmin && editing;

  const { data: shop } = useQuery({
    queryKey: ["shop", me?.id],
    enabled: !!me,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!me) throw new Error("Entre na sua conta.");
      const [items, wallet, bought, settings, fonts, colors] = await Promise.all([
        supabase.from("shop_items").select("*").eq("active", true).order("sort"),
        supabase.from("coin_wallets").select("balance").eq("user_id", me.id).maybeSingle(),
        supabase.from("shop_purchases").select("item_id").eq("user_id", me.id),
        supabase.from("shop_settings").select("display_limit").maybeSingle(),
        // Fonts gifted by staff count as owned, so nobody pays for a font they already have.
        supabase.from("player_fonts").select("font_id").eq("user_id", me.id),
        supabase.from("player_name_colors").select("color_id").eq("user_id", me.id),
      ]);
      if (items.error) throw new Error(items.error.message);
      if (settings.error) throw new Error(settings.error.message);
      return { items: visibleShopItems(items.data ?? [], settings.data?.display_limit ?? 100), balance: wallet.data?.balance ?? 0, owned: new Set([...(bought.data ?? []).map((b) => b.item_id), ...(fonts.data ?? []).map((f) => f.font_id), ...(colors.data ?? []).map((c) => c.color_id)]) };
    },
  });

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(errMsg(error.message)); return; }
    toast.success(ok);
    await qc.invalidateQueries({ queryKey: ["shop"] });
    await qc.invalidateQueries({ queryKey: ["avatar-frame-access"] });
    await Promise.all([qc.invalidateQueries({ queryKey: ["player-fonts"] }), qc.invalidateQueries({ queryKey: ["player-name-colors"] })]);
  }

  async function savePrice(item: ShopItem) {
    const price = Number(drafts[item.id]);
    if (!Number.isInteger(price) || price < 0 || price > 100000) { toast.error("Digite um preço de 0 a 100000 moedas."); return; }
    setBusy(`price-${item.id}`);
    const { error } = await supabase.rpc("admin_save_shop_item", { p_id: item.id, p_name: item.name, p_price: price, p_active: item.active, p_sort: item.sort });
    setBusy(null);
    if (error) { toast.error(errMsg(error.message)); return; }
    setDrafts((d) => { const next = { ...d }; delete next[item.id]; return next; });
    toast.success(`${item.name} agora custa ${price} moedas.`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["shop"] }), qc.invalidateQueries({ queryKey: ["admin-shop"] })]);
  }

  const previewFrame = preview?.kind === "frame" ? catalog.find((f) => f.id === preview.id) : undefined;
  const items = shop?.items ?? [];
  const previewColor = preview?.kind === "name_color" ? colorCatalog.data?.find((c) => c.id === preview.id) : undefined;
  const counts: Record<ShopTab, number> = { frame: 0, font: 0, name_color: 0, other: 0 };
  for (const item of items) counts[tabOf(item.kind)] += 1;
  const tabItems = items.filter((item) => tabOf(item.kind) === tab);
  const activeTab = SHOP_TABS.find((t) => t.id === tab) ?? SHOP_TABS[0]!;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Suas moedas</p>
          <h1 className="font-display text-3xl font-bold uppercase">Loja</h1>
          <p className="text-sm text-muted-foreground">Compre molduras, fontes e cores para o seu nome com moedas. Depois de comprar, aplique no <Link to="/perfil" className="text-primary underline">Perfil</Link>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant={editing ? "default" : "outline"} onClick={() => { setEditing((v) => !v); setDrafts({}); }}>
              {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editing ? "Terminar edição" : "Editar valores"}
            </Button>
          )}
          <span className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 font-display text-lg font-bold">
            <CoinIcon className="h-5 w-5" /> {shop?.balance ?? 0}
          </span>
        </div>
      </div>

      {editMode && (
        <p className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <strong>Modo de edição (só admins veem):</strong> digite o novo preço embaixo de cada item e clique em salvar. Muda na hora para todo mundo.
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ShopTab)} className="mt-8">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:w-auto">
          {SHOP_TABS.filter((t) => t.id !== "other" || counts.other > 0).map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2 px-4 py-2">
              <t.icon className="h-4 w-4" /> {t.label}
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">{counts[t.id]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-label={`Como funciona: ${activeTab.label}`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><activeTab.icon className="h-5 w-5 text-primary" /> {activeTab.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{activeTab.intro}</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {activeTab.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {shop && tabItems.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <activeTab.icon className="mx-auto h-8 w-8" />
          <p className="mt-2 font-semibold">{activeTab.empty}</p>
          <p className="text-sm">Volte depois, a staff vai lançando novidades.</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tabItems.map((item) => {
          const frame = item.kind === "frame" ? catalog.find((f) => f.id === item.id) : undefined;
          const isFont = item.kind === "font";
          const color = item.kind === "name_color" ? colorCatalog.data?.find((c) => c.id === item.id) : undefined;
          const owned = !!shop?.owned.has(item.id);
          const short = (shop?.balance ?? 0) < item.price;
          return (
            <article key={item.id} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="grid h-32 w-full place-items-center">
                {isFont ? (
                  <button type="button" className="grid h-full w-full place-items-center rounded-xl bg-muted/40 px-2 text-center" onClick={() => setPreview({ id: item.id, name: item.name, kind: item.kind })} aria-label={`Ver meu nome com a fonte ${item.name}`}>
                    <FontSample fontId={item.id} className="line-clamp-2 break-words text-3xl leading-tight">{me?.name ?? item.name}</FontSample>
                  </button>
                ) : color ? (
                  <button type="button" className="grid h-full w-full place-items-center rounded-xl bg-muted/40 px-2 text-center" onClick={() => setPreview({ id: item.id, name: item.name, kind: item.kind })} aria-label={`Ver meu nome com a cor ${item.name}`}>
                    <PlayerName userId={me?.id} name={me?.name ?? item.name} colorPreview={color} className="break-words text-3xl leading-tight" />
                  </button>
                ) : frame ? (
                  <FramePreview frame={frame} name="?" size="h-20 w-20" />
                ) : (
                  <span className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-border text-muted-foreground"><Package className="h-8 w-8" /></span>
                )}
              </div>
              <p className="text-center text-sm font-semibold">{item.name}</p>
              <p className="flex items-center gap-1 font-display font-bold"><CoinIcon /> {item.price}</p>
              {editMode ? (
                <div className="mt-auto flex w-full gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100000}
                    aria-label={`Novo preço de ${item.name}`}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    value={drafts[item.id] ?? String(item.price)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void savePrice(item); }}
                  />
                  <Button size="sm" aria-label={`Salvar preço de ${item.name}`} disabled={!!busy || drafts[item.id] === undefined || drafts[item.id] === "" || Number(drafts[item.id]) === item.price} onClick={() => savePrice(item)}>
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
              <div className="mt-auto flex w-full gap-2">
                {(frame || isFont || color) && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreview({ id: item.id, name: item.name, kind: item.kind })} aria-label={isFont ? `Ver meu nome com a fonte ${item.name}` : color ? `Ver meu nome com a cor ${item.name}` : `Ver ${item.name} na minha foto`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  className="flex-[2]"
                  disabled={owned || short || !!busy}
                  onClick={() => run(item.id, () => supabase.rpc("buy_shop_item", { p_item: item.id }), `${item.name} comprado!`)}
                >
                  {owned ? "Comprado" : short ? "Sem moedas" : "Comprar"}
                </Button>
              </div>
              )}
            </article>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>
          {preview?.kind === "font" ? (
            <>
              <div className="space-y-5 py-6 text-center">
                <FontSample fontId={preview.id} className="block break-words text-5xl leading-tight">{me?.name ?? "Seu nome"}</FontSample>
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">No ranking:</span>
                  <FontSample fontId={preview.id} className="truncate font-semibold">{me?.name ?? "Seu nome"}</FontSample>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">Assim fica o seu nome para todo mundo. Depois de comprar, escolha a fonte no Perfil.</p>
            </>
          ) : preview?.kind === "name_color" ? (
            <>
              <div className="space-y-5 py-6 text-center">
                <PlayerName userId={me?.id} name={me?.name ?? "Seu nome"} colorPreview={previewColor ?? null} className="break-words text-5xl leading-tight" />
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">No ranking:</span>
                  <PlayerName userId={me?.id} name={me?.name ?? "Seu nome"} colorPreview={previewColor ?? null} className="truncate font-semibold" />
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">Assim fica o seu nome para todo mundo, com a sua fonte. Depois de comprar, escolha a cor em Perfil → Cor do nome.</p>
            </>
          ) : (
            <>
              <div className="grid place-items-center py-10">
                <FramePreview frame={previewFrame} avatarPath={me?.avatar_url} name={me?.name ?? "?"} size="h-40 w-40" />
              </div>
              <p className="text-center text-sm text-muted-foreground">Assim fica com a sua foto de perfil.</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
