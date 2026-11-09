import { createFileRoute } from "@tanstack/react-router";
import { AdminPrizes } from "@/components/AdminPrizes";
import { AdminAnnouncement } from "@/components/AdminAnnouncement";
import { AdminCountdown } from "@/components/AdminCountdown";
import { AdminMix } from "@/components/AdminMix";
import { AdminSeasons } from "@/components/AdminSeasons";
import { AdminLeague } from "@/components/AdminLeague";
import { AdminPromos } from "@/components/AdminPromos";
import { AdminInventory } from "@/components/AdminInventory";
import { AdminShopEditor } from "@/components/AdminShopEditor";
import { AdminValues } from "@/components/AdminValues";
import { AdminVideos } from "@/components/AdminVideos";
import { AdminProfileTags } from "@/components/AdminProfileTags";
import { AdminEmblems } from "@/components/AdminEmblems";
import { AdminNameFonts } from "@/components/AdminNameFonts";
import { AdminNameColors } from "@/components/AdminNameColors";
import { AdminPermissions } from "@/components/AdminPermissions";
import { EquippedProfileTag } from "@/components/ProfileTags";
import { AdminRatingEditor } from "@/components/AdminRatingEditor";
import { AdminPointsBatch } from "@/components/AdminPointsBatch";
import { AdminKickApprovals } from "@/components/AdminKickApprovals";
import { AdminRefreshInhouse } from "@/components/AdminRefreshInhouse";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPlayerReports } from "@/components/AdminPlayerReports";
import { AdminQueueBots } from "@/components/AdminQueueBots";
import { AdminWinStreak } from "@/components/AdminWinStreak";
import { closeMatchVote } from "@/lib/admin-controls.functions";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RefreshCw, Trophy, Plus, Minus } from "lucide-react";
import { adminAction, getAdminOverview, type AdminOverview } from "@/lib/inhouse.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Painel admin · Inhouse Rematch" },
      { name: "description", content: "Resolva contestações, modere jogadores e acompanhe a fila da in-house." },
      { property: "og:title", content: "Painel admin · Inhouse Rematch" },
      { property: "og:description", content: "Resolva contestações, modere jogadores e acompanhe a fila da in-house." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const statusLabel: Record<string, string> = {
  draft: "Em draft", room: "Em andamento", voting: "Em andamento",
  reporting: "Aguardando confirmação", disputed: "Contestada", completed: "Finalizada", cancelled: "Cancelada",
};

function AdminPage() {
  const fn = useServerFn(getAdminOverview);
  const actFn = useServerFn(adminAction);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["admin"], queryFn: () => fn(), refetchInterval: 15000, retry: false });
  const [tab, setTab] = useState<"matches" | "users" | "queue" | "log" | "reports" | "rules" | "prizes" | "notice" | "inventory" | "shop" | "values" | "videos" | "tags" | "emblems" | "fonts" | "colors" | "countdown" | "promos" | "permissions" | "points" | "mix" | "seasons" | "league">("matches");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [ratingPlayer, setRatingPlayer] = useState<AdminOverview["users"][number] | null>(null);

  async function act(input: Parameters<typeof actFn>[0]["data"], ok: string) {
    if (pending) return;
    setPending(true);
    try {
      await actFn({ data: input });
      await qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setPending(false); }
  }

  if (error) return <main className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">{error.message}</main>;
  if (!data) return <main className="mx-auto max-w-6xl px-4 py-16 animate-pulse text-sm text-muted-foreground">Carregando…</main>;

  const s = data.stats;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{data.isAdmin ? "Administrador" : "Moderador"}</p>
      <div className="flex items-center justify-between gap-3"><h1 className="mt-1 text-4xl font-bold">Painel Admin</h1><div className="flex items-center gap-2">{data.isAdmin && <AdminRefreshInhouse />}<Button variant="outline" size="icon" aria-label="Atualizar painel" onClick={() => qc.invalidateQueries({ queryKey: ["admin"] })}><RefreshCw className="size-4" /></Button></div></div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Jogadores", s.users], ["Na fila", s.queue], ["Em jogo", s.live], ["Aguardando", s.reporting], ["Contestadas", s.disputed]] as const).map(([l, v]) => (
          <div key={l} className={`rounded-xl border bg-card p-4 ${l === "Contestadas" && v > 0 ? "border-destructive" : "border-border"}`}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{l}</p>
            <p className="font-display text-3xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      {data.isAdmin && <AdminKickApprovals />}
      <div className="mt-8 flex flex-wrap gap-2">
        {([["matches", "Partidas"], ["users", "Jogadores"], ["queue", "Fila"], ["log", "Registro"], ["fonts", "Fontes"], ["colors", "Cores"], ...(data.isAdmin ? [["seasons", "Seasons"], ["league", "Rivals League"], ["mix", "Modo Mix"], ["points", "Pontos"], ["reports", "Denúncias"], ["rules", "Regras do MMR"], ["prizes", "Prêmios"], ["notice", "Aviso geral"], ["countdown", "Contador"], ["promos", "Divulgação"], ["inventory", "Itens e molduras"], ["values", "Valores"], ["shop", "Personalizar loja"], ["videos", "Vídeos"], ["tags", "Tags e títulos"], ["emblems", "Emblemas"], ["permissions", "Permissões"]] as const : [])] as const).map(([v, l]) => (
          <Button key={v} variant={tab === v ? "default" : "ghost"} onClick={() => setTab(v)}>{l}</Button>
        ))}
      </div>
      {tab === "seasons" && data.isAdmin && <AdminSeasons />}
      {tab === "league" && data.isAdmin && <AdminLeague />}
      {tab === "mix" && data.isAdmin && <AdminMix />}
      {tab === "points" && data.isAdmin && <AdminPointsBatch users={data.users} />}
      {tab === "rules" && data.isAdmin && <AdminWinStreak />}
      {tab === "inventory" && data.isAdmin && <AdminInventory users={data.users} />}
      {tab === "shop" && data.isAdmin && <AdminShopEditor />}
      {tab === "values" && data.isAdmin && <AdminValues />}
      {tab === "videos" && data.isAdmin && <AdminVideos users={data.users} />}
      {tab === "tags" && data.isAdmin && <AdminProfileTags users={data.users} />}
      {tab === "emblems" && data.isAdmin && <AdminEmblems users={data.users} />}
      {tab === "fonts" && <AdminNameFonts users={data.users} />}
      {tab === "colors" && <AdminNameColors users={data.users} />}
      {tab === "permissions" && data.isAdmin && <AdminPermissions users={data.users} />}
      {tab === "prizes" && data.isAdmin && <AdminPrizes />}
      {tab === "notice" && data.isAdmin && <AdminAnnouncement />}
      {tab === "countdown" && data.isAdmin && <AdminCountdown />}
      {tab === "promos" && data.isAdmin && <AdminPromos />}
      {tab === "reports" && data.isAdmin && <AdminPlayerReports />}
      {tab === "matches" && <Matches data={data} act={act} pending={pending} />}
      {tab === "users" && (
        <section className="mt-4">
          <Input placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {data.users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())).map((u) => {
              const banned = u.bannedUntil && new Date(u.bannedUntil) > new Date();
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1 font-semibold">
                    {u.name} <EquippedProfileTag userId={u.id} /> <span className="text-muted-foreground">· {u.rating}</span>
                    {u.roles.map((r) => <span key={r} className="ml-2 rounded bg-primary/15 px-1.5 text-xs text-primary">{r}</span>)}
                    {banned && u.bannedUntil && <span className="ml-2 rounded bg-destructive/20 px-1.5 text-xs text-destructive">suspenso até {new Date(u.bannedUntil).toLocaleString("pt-BR")}</span>}
                  </span>
                  {banned ? (
                    <Button size="sm" variant="outline" onClick={() => act({ kind: "ban", user: u.id, hours: 0, reason: "" }, "Punição removida.")}>Remover punição</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { const r = prompt("Motivo da suspensão (24h):"); if (r) act({ kind: "ban", user: u.id, hours: 24, reason: r }, "Suspenso por 24h."); }}>Suspender 24h</Button>
                      <Button size="sm" variant="destructive" onClick={() => { const r = prompt("Motivo do banimento:"); if (r) act({ kind: "ban", user: u.id, hours: 24 * 365 * 10, reason: r }, "Jogador banido."); }}>Banir</Button>
                    </>
                  )}
                  {data.isAdmin && !u.isGhost && (
                    <Button size="sm" variant="outline" onClick={() => setRatingPlayer(u)}><Plus size={14} /><Minus size={14} />Ajustar pontos</Button>
                  )}
                  {data.isAdmin && !u.isGhost && (
                    <Button size="sm" variant="ghost" onClick={() => act({ kind: "role", user: u.id, role: "moderator", on: !u.roles.includes("moderator") }, "Cargo atualizado.")}>
                      {u.roles.includes("moderator") ? "Tirar moderador" : "Tornar moderador"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {ratingPlayer && data.isAdmin && <AdminRatingEditor key={ratingPlayer.id} player={ratingPlayer} onClose={() => setRatingPlayer(null)} />}
      {tab === "queue" && !data.isAdmin && <p className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Só administradores podem ver quem está na fila.</p>}
      {tab === "queue" && data.isAdmin && <AdminQueueBots />}
      {tab === "queue" && data.isAdmin && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {([["Goleiros", data.queue.filter((q) => q.position === "Goleiro")], ["Linha", data.queue.filter((q) => q.position !== "Goleiro")]] as const).map(([title, list]) => (
            <section key={title} className="rounded-xl border border-border bg-card">
              <h3 className="flex items-center justify-between border-b border-border p-3 font-display text-lg font-bold">
                {title} <span className="text-sm text-primary">{list.length}</span>
              </h3>
              <ul className="divide-y divide-border">
                {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Ninguém na fila.</li>}
                {list.map((q, i) => (
                  <li key={q.userId} className="flex items-center gap-3 p-3 text-sm">
                    <span className="w-6 text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 font-semibold">{q.name} <EquippedProfileTag userId={q.userId} /> <span className="text-muted-foreground">· {q.position}</span></span>
                    <span className="text-xs text-muted-foreground">{new Date(q.joinedAt).toLocaleTimeString("pt-BR")}</span>
                    <Button size="sm" variant="outline" onClick={() => act({ kind: "kick", user: q.userId, reason: "Removido pelo painel" }, "Removido da fila.")}>Remover</Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {tab === "log" && (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card text-sm">
          {data.actions.length === 0 && <li className="p-6 text-center text-muted-foreground">Nenhuma ação ainda.</li>}
          {data.actions.map((a, i) => (
            <li key={i} className="p-3">
              <span className="font-semibold">{a.actor}</span> · {a.action.replaceAll("_", " ")}
              {a.target && <> · <span className="font-semibold">{a.target}</span></>}
              {a.reason && <span className="text-muted-foreground"> — {a.reason}</span>}
              <span className="float-right text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("pt-BR")}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Matches({ data, act, pending }: { data: AdminOverview; pending: boolean; act: (i: Parameters<ReturnType<typeof useServerFn<typeof adminAction>>>[0]["data"], ok: string) => void }) {
  const [history, setHistory] = useState(false);
  const [closing, setClosing] = useState<{ match: string; side: "a" | "b" } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const close = useServerFn(closeMatchVote);
  const qc = useQueryClient();
  const matches = data.matches.filter(m => history === ["completed", "cancelled"].includes(m.status));
  async function confirm() {
    if (!closing || saving) return;
    setSaving(true);
    try {
      await close({ data: { ...closing, reason } });
      setClosing(null); setReason("");
      toast.success("Votação encerrada e vencedor definido.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin"] }), qc.invalidateQueries({ queryKey: ["queue"] }), qc.invalidateQueries({ queryKey: ["ranking"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível encerrar."); }
    finally { setSaving(false); }
  }
  return (
    <><div className="mt-4 flex flex-wrap gap-2"><Button variant={!history ? "secondary" : "ghost"} onClick={() => setHistory(false)}>Ativas</Button><Button variant={history ? "secondary" : "ghost"} onClick={() => setHistory(true)}>Histórico</Button></div>
    {matches.length === 0 && <p className="mt-6 text-sm text-muted-foreground">Nenhuma partida {history ? "no histórico" : "em aberto"}.</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {matches.map((m) => (
        <div key={m.id} className={`rounded-xl border bg-card p-4 ${m.status === "disputed" ? "border-destructive" : "border-border"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${m.status === "disputed" ? "text-destructive" : "text-primary"}`}>{statusLabel[m.status] ?? m.status}</span>
            <span className="text-xs text-muted-foreground">#{m.id.slice(0, 8)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("pt-BR")}{m.roomCode && <> · Sala: <span className="text-foreground">{m.roomCode}</span></>}</p>
          {!history && <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><span className="text-team-a">Time A {m.players.filter(p => p.vote === "a").length}/6</span><span className="text-team-b">Time B {m.players.filter(p => p.vote === "b").length}/6</span><span className="text-destructive">Cancelar {m.players.filter(p => p.cancelVote).length}/6</span></div>}
          {m.reportA != null && (
            <p className="mt-2 font-display text-2xl font-bold">
              <span className="text-team-a">A {m.reportA}</span> × <span className="text-team-b">{m.reportB} B</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">por {m.reportedBy}</span>
            </p>
          )}
          <ul className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
            {m.players.map((p, i) => (
              <li key={i} className={p.team === "a" ? "text-team-a" : p.team === "b" ? "text-team-b" : "text-muted-foreground"}>
                {p.name} <EquippedProfileTag userId={p.userId} /> {p.isGhost && <span className="text-muted-foreground">(bot)</span>}<span className="block text-muted-foreground">{p.position}{p.vote && ` · Voto ${p.vote.toUpperCase()}`}{p.cancelVote && " · Cancelar"}</span>
              </li>
            ))}
          </ul>
          {!history && <div className="mt-3 flex flex-wrap gap-2">
            {data.isAdmin && ["room", "voting", "reporting", "disputed"].includes(m.status) && (["a", "b"] as const).map(side => <Button key={side} size="sm" variant="outline" disabled={saving || pending} onClick={() => { setClosing({ match: m.id, side }); setReason(""); }}><Trophy className="size-4" />Encerrar: Time {side.toUpperCase()} ganhou</Button>)}
            {m.reportA != null && m.reportB != null && (
              <Button size="sm" onClick={() => { if (m.reportA == null || m.reportB == null) return; act({ kind: "resolve", match: m.id, a: m.reportA, b: m.reportB, reason: "Placar aprovado" }, "Resultado aprovado."); }}>Aprovar placar</Button>
            )}
            {["room", "voting", "reporting", "disputed"].includes(m.status) && (
              <Button size="sm" variant="outline" onClick={() => {
                const v = prompt("Placar correto (ex: 3x1):");
                const mm = v?.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
                if (mm) act({ kind: "resolve", match: m.id, a: Number(mm[1]), b: Number(mm[2]), reason: "Placar definido pelo admin" }, "Resultado definido.");
              }}>Definir placar</Button>
            )}
            {data.isAdmin && <Button size="sm" variant="destructive" disabled={pending || saving} onClick={() => { const r = prompt("Motivo do cancelamento:"); if (r) act({ kind: "cancel", match: m.id, reason: r }, "Partida cancelada."); }}>Cancelar imediatamente</Button>}
          </div>}
          {history && data.isAdmin && m.status === "completed" && <div className="mt-3"><Button size="sm" variant="destructive" disabled={pending || saving} onClick={() => { const r = prompt("Motivo para desclassificar (os pontos e estatísticas desta partida serão desfeitos):"); if (r) act({ kind: "void", match: m.id, reason: r }, "Partida desclassificada."); }}>Resetar partida</Button></div>}
        </div>
      ))}
    </div><Dialog open={closing !== null} onOpenChange={open => { if (!open && !saving) setClosing(null); }}><DialogContent><DialogTitle>Encerrar votação — Time {closing?.side.toUpperCase()}</DialogTitle><DialogDescription>Você define o vencedor imediatamente, sem precisar de seis votos. O MMR será aplicado e o resultado enviado ao Discord.</DialogDescription><label className="grid gap-2 text-sm">Motivo<Input aria-label="Motivo para encerrar votação" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={saving} /></label><Button disabled={saving || !reason.trim()} onClick={confirm}>{saving ? "Encerrando…" : "Confirmar vencedor"}</Button></DialogContent></Dialog></>
  );
}
