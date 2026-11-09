import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { Shield, Undo2, UserPlus, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoomCode } from "@/components/RoomCode";
import { Avatar } from "@/components/Avatar";
import { RankBadge } from "@/components/RankBadge";
import { PlayerReports } from "@/components/PlayerReports";
import { PlayerLikes, MatchLikes } from "@/components/PlayerLikes";
import { PointProtection } from "@/components/PointProtection";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { ScreenshotScore } from "@/components/ScreenshotScore";
import { MatchKickContext, KickPlayerButton, ActiveKickVote } from "@/components/MatchKick";
import { QueueChat } from "@/components/QueueChat";
import { MixBanner } from "@/components/MixMode";
import { supabase } from "@/integrations/supabase/client";
import { useQueueAlerts } from "@/hooks/use-queue-alerts";
import { syncMatchVoice } from "@/lib/discord-voice.functions";
import { matchOdds, teamRole, tierProgress, type TeamRole } from "@/lib/inhouse";
import {
  voteCancelMatchGk,
  withdrawMatchVoteGk,
  draftPick,
  gamePositions,
  getInhouseStateGk,
  joinQueueGk,
  leaveQueueGk,
  renameProfile,
  setRoomCode,
  voteMatchGk,
  type GamePosition,
  type GkMatch,
  type GkMatchPlayer,
  type GkQueuePlayer,
  type GkState,
} from "@/lib/inhouse.functions";

export const Route = createFileRoute("/_authenticated/queue")({
  head: () => ({
    meta: [
      { title: "Fila In-house · Inhouse Rematch" },
      { name: "description", content: "Entre na fila declarando sua posição, os dois maiores MMR capitam os times e a votação decide o vencedor." },
      { property: "og:title", content: "Fila In-house · Inhouse Rematch" },
      { property: "og:description", content: "Entre na fila declarando sua posição, os dois maiores MMR capitam os times e a votação decide o vencedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const queryClient = useQueryClient();
  const stateFn = useServerFn(getInhouseStateGk);
  const { data: s, error, refetch } = useQuery({
    queryKey: ["inhouse-gk"],
    queryFn: () => stateFn(),
    refetchInterval: (q) => (q.state.data?.match?.status === "draft" ? 2000 : q.state.data?.match || q.state.data?.queue ? 4000 : 15000),
    refetchIntervalInBackground: false,
  });

  const joinFn = useServerFn(joinQueueGk);
  const leaveFn = useServerFn(leaveQueueGk);
  const pickFn = useServerFn(draftPick);
  const codeFn = useServerFn(setRoomCode);
  const voteFn = useServerFn(voteMatchGk);
  const cancelFn = useServerFn(voteCancelMatchGk);
  const withdrawFn = useServerFn(withdrawMatchVoteGk);
  const renameFn = useServerFn(renameProfile);
  const { soundEnabled, toggleSound } = useQueueAlerts(s);
  const voiceFn = useServerFn(syncMatchVoice);
  const matchKey = `${s?.match?.id ?? "none"}:${s?.match?.status ?? ""}`;
  useEffect(() => {
    if (!s) return;
    voiceFn().catch((e) => console.error("Discord calls", e));
  }, [matchKey, voiceFn]); // eslint-disable-line react-hooks/exhaustive-deps

  const [canTest, setCanTest] = useState(false);
  useEffect(() => {
    supabase.from("user_roles").select("role").then(({ data }) => setCanTest(!!data?.some((r) => r.role === "admin")));
  }, []);
  const [position, setPosition] = useState<GamePosition>("Pivô");
  const [autoQueue, setAutoQueue] = useState(false);
  useEffect(() => {
    setAutoQueue(localStorage.getItem("autoQueue") === "1");
    const saved = localStorage.getItem("autoQueuePos") as GamePosition | null;
    if (saved) setPosition(saved);
  }, []);
  function toggleAutoQueue() {
    const next = !autoQueue;
    setAutoQueue(next);
    localStorage.setItem("autoQueue", next ? "1" : "0");
    toast.success(next ? "Fila automática ligada: quando a partida acabar, você volta pra fila." : "Fila automática desligada.");
  }
  // Remember the position used to enter the queue so auto-requeue reuses it.
  useEffect(() => {
    if (s?.queue?.position) localStorage.setItem("autoQueuePos", s.queue.position);
  }, [s?.queue?.position]);
  // When a match ends (match disappears and we're not queued), rejoin automatically.
  const [hadMatch, setHadMatch] = useState(false);
  const [removalSeen, setRemovalSeen] = useState<string | null>(null);
  useEffect(() => {
    if (s?.match) setRemovalSeen(s.lastRemoval?.id ?? null);
    else if (hadMatch && s?.lastRemoval?.id && s.lastRemoval.id !== removalSeen) {
      setAutoQueue(false); localStorage.setItem("autoQueue", "0"); setHadMatch(false);
      setRemovalSeen(s.lastRemoval.id); toast.info("Você foi removido da partida por votação.");
    }
  }, [s?.match?.id, s?.lastRemoval?.id, hadMatch, removalSeen]);
  useEffect(() => {
    if (!s) return;
    if (s.match) { setHadMatch(true); return; }
    if (hadMatch && !s.queue && autoQueue && (!s.lastRemoval?.id || s.lastRemoval.id === removalSeen)) {
      setHadMatch(false);
      const pos = (localStorage.getItem("autoQueuePos") as GamePosition | null) ?? position;
      act(() => joinFn({ data: { position: pos } }), `Voltou pra fila automaticamente como ${pos}.`);
    } else if (hadMatch) setHadMatch(false);
  }, [s?.match?.id, !!s?.queue, autoQueue]); // eslint-disable-line react-hooks/exhaustive-deps
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  async function act(run: () => Promise<unknown>, success?: string) {
    try {
      await run();
      await queryClient.invalidateQueries({ queryKey: ["inhouse-gk"] });
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo deu errado.");
      return false;
    }
  }

  if (error && !s) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-sm text-destructive">Não foi possível carregar a fila.</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>Tentar novamente</Button>
      </main>
    );
  }

  if (!s) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <p className="animate-pulse text-sm text-muted-foreground">Carregando a fila…</p>
      </main>
    );
  }

  const me = s.me;

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-44 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">In-house · 5v5 · goleiros escolhem</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Fila in-house</h1>
          <Button variant="ghost" size="icon" className="mt-2" onClick={toggleSound} aria-label={soundEnabled ? "Silenciar notificações" : "Ativar som das notificações"} title={soundEnabled ? "Silenciar notificações" : "Ativar som das notificações"}>
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>
          <Button variant={autoQueue ? "default" : "outline"} size="sm" className="mt-2 ml-2" onClick={toggleAutoQueue} aria-pressed={autoQueue}>
            Fila automática: {autoQueue ? "ligada" : "desligada"}
          </Button>
        </div>
        {me && (
          <div className="w-full text-left text-sm sm:w-auto sm:text-right">
            <p className="flex flex-wrap items-center gap-2 font-semibold sm:justify-end"><EquippedEmblem userId={me.id} className="h-5 w-5" /><PlayerName userId={me.id} name={me.name} /><StaffTag userId={me.id} /></p>
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground sm:justify-end">
              <RankBadge rating={me.rating} /> {me.rating} · {me.wins}V / {me.losses}D
              
              {" "}
              <Button variant="link" size="sm"
                className="ml-2 underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  setNewName(me.name);
                  setRenaming(true);
                }}
              >
                Trocar nick
              </Button>
            </p>
          </div>
        )}
      </div>

      <MixBanner />

      {renaming && me && (
        <div className="mt-4 flex items-center gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={20} className="w-48" />
          <Button
            size="sm"
            onClick={() =>
              act(() => renameFn({ data: { name: newName } }), "Nick atualizado!").then(() => setRenaming(false))
            }
          >
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancelar</Button>
        </div>
      )}

      <div className="mt-2 min-w-0">
      {s.testMode && (
        <p className="mt-4 rounded-md border border-dashed border-primary/60 bg-primary/10 px-4 py-2 text-center text-sm font-semibold text-primary">
          Fila de teste · só admins · não vale MMR, ranking nem moedas e não vai para o Discord
        </p>
      )}
      {s.match ? (
        <MatchStage
          draft={s.draft}
          m={s.match}
          onPick={(target) => act(() => pickFn({ data: { target } }))}
          onSaveCode={(code) => act(() => codeFn({ data: { code } }), "Código salvo.")}
          onVote={(side) => act(() => voteFn({ data: { side } }), "Voto registrado.")}
          onCancel={() => act(() => cancelFn(), "Voto para cancelar registrado.")}
          onWithdraw={() => act(() => withdrawFn(), "Voto retirado.")}
        />
      ) : s.queue ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SearchingStage
            queue={s.queue}
            counts={s.counts}
            players={s.me?.isStaff ? (s.queuePlayers ?? []) : []}
            onLeave={() => act(() => leaveFn(), "Você saiu da fila.")}
          />
          <QueueChat matchId={null} title="Chat da fila" subtitle="Quem está esperando a partida começar" isStaff={!!s.me?.isStaff} />
        </div>
      ) : (
        <JoinStage
          me={me}
          counts={s.counts}
          position={position}
          onPosition={setPosition}
          onJoin={() => act(() => joinFn({ data: { position } }))}
          onJoinTest={canTest ? () => act(() => joinFn({ data: { position, test: true } }), "Você entrou na fila de teste.") : undefined}
        />
      )}
      {!s.match && <PointProtection />}
      </div>
      {s.match && (
        <QueueChat
          key={s.match.id}
          matchId={s.match.id}
          title="Chat da partida"
          subtitle="Só quem está nesta partida vê"
          isStaff={!!s.me?.isStaff}
          className="mt-8"
        />
      )}
      {s.match && <PlayerReports />}
    </main>
  );
}

function PlayerRow({ p, full = false }: { p: GkMatchPlayer; full?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2 sm:gap-3 sm:px-3 ${p.isMe ? "bg-primary/10 ring-1 ring-primary/40" : "bg-muted"}`}>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-sm font-bold text-primary">
        <Avatar path={p.avatarUrl} name={p.name} userId={p.userId} />
        {p.position === "Goleiro" && (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[8px] text-primary-foreground">
            <Shield size={10} />
          </span>
        )}
      </span>
      <span className={`min-w-0 flex-1 font-semibold ${full ? "break-words" : "truncate"}`}>
        <EquippedEmblem userId={p.userId} className="mr-1 h-4 w-4" /><PlayerName userId={p.userId} name={p.name} />
        <StaffTag userId={p.userId} className="ml-1" />
        {p.isCaptain && (
          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/40">
            Capitão
          </span>
        )}
        {p.isMe && <span className="ml-2 text-xs text-primary">você</span>}
      </span>
      <span className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
        <span>{p.position === "Goleiro" ? null : <Users size={14} className="inline" />} {p.position}</span>
        {(p.primaryPosition || p.secondaryPosition) && (
          <span className="text-[10px] text-primary/80">
            {p.primaryPosition ?? "—"}{p.secondaryPosition ? ` · ${p.secondaryPosition}` : ""}
          </span>
        )}
      </span>
      <KickPlayerButton userId={p.userId} isMe={p.isMe} />
    </li>
  );
}

export function PickGroup({
  title,
  icon,
  players,
  active,
  canPick,
  onPick,
}: {
  title: string;
  icon: ReactNode;
  players: GkMatchPlayer[];
  active: boolean;
  canPick: boolean;
  onPick: (target: string) => void;
}) {
  return (
    <section>
      <h2 className={`mb-3 flex flex-wrap items-center gap-2 text-lg font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>
        {icon}
        {title}
        <span className="text-xs font-normal text-muted-foreground">({players.length})</span>
        {active && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/40">
            Escolha agora
          </span>
        )}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {players.map((p) => (
          <div key={p.userId} className={`rounded-md border bg-card p-4 ${active ? "border-border" : "border-border/60 opacity-60"}`}>
            <PlayerRow p={p} full />
            <Button className="mt-3 w-full" size="sm" disabled={!canPick || !active} onClick={() => onPick(p.userId)}>
              Escolher {p.name}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TeamColumn({ side, players, total, role, margin, prob }: { side: "a" | "b"; players: GkMatchPlayer[]; total: number; role: TeamRole | null; margin: number; prob: number | null }) {
  return (
    <div className={`min-w-0 rounded-xl border bg-card p-4 sm:p-5 ${role === "favorito" ? "border-primary/50" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={`text-xl font-bold ${side === "a" ? "text-team-a" : "text-team-b"}`}>
          Time {side.toUpperCase()} <span className="text-sm text-muted-foreground">{players.length}/5</span>
        </h2>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl leading-none">
            {total}
            <span className="ml-1 text-xs font-normal text-muted-foreground">MMR</span>
          </p>
          {role && (
            <span
              className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                role === "favorito" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground ring-1 ring-border"
              }`}
            >
              {role === "favorito" ? "Favorito" : "Desafiador"}
            </span>
          )}
          {role === "favorito" && margin > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">+{margin} MMR de vantagem</p>
          )}
          {prob !== null && (
            <p className="mt-1 font-display text-sm text-primary">{Math.round(prob * 100)}% de vitória</p>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {players.map((p) => <PlayerRow key={p.userId} p={p} />)}
        {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => (
          <li key={i} className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Vaga aberta
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchStage({
  draft,
  m,
  onPick,
  onSaveCode,
  onVote,
  onCancel,
  onWithdraw,
}: {
  draft: { deadline: string | null; turn: "a" | "b"; picksLeft: number; phase?: "gk" | "line" } | null;
  m: GkMatch;
  onPick: (target: string) => void;
  onSaveCode: (code: string) => Promise<boolean>;
  onVote: (side: "a" | "b") => Promise<boolean>;
  onCancel: () => Promise<boolean>;
  onWithdraw: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"teams" | "result">("teams");

  const me = m.players.find((p) => p.isMe);
  const teams = {
    a: m.players.filter((p) => p.team === "a"),
    b: m.players.filter((p) => p.team === "b"),
  };
  const available = m.players.filter((p) => p.team === null);
  const keepers = available.filter((p) => p.position === "Goleiro");
  const outfield = available.filter((p) => p.position !== "Goleiro");
  const odds = matchOdds(teams.a.map((p) => p.rating), teams.b.map((p) => p.rating));
  const turn = draft?.turn ?? "a";
  const pickingKeepers = (draft?.phase ?? "line") === "gk";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = draft?.deadline ? Math.max(0, Math.ceil((new Date(draft.deadline).getTime() - now) / 1000)) : null;
  const turnCaptain = m.players.find((p) => p.isCaptain && p.team === turn);
  const paused = !!m.kick || (m.vacancies ?? 0) > 0;
  const canPick = !!me && me.isCaptain && me.team === turn && !paused;

  return (
    <MatchKickContext.Provider value={m.id}><section className="mt-8">
      {m.kick && <ActiveKickVote key={m.kick.id} vote={m.kick} myId={me?.userId} />}
      {(m.vacancies ?? 0) > 0 && <p role="status" className="mt-4 border-y border-primary/40 bg-primary/10 p-4 text-sm font-semibold">{m.vacancies} vaga(s) aberta(s) · aguardando o próximo jogador da fila.</p>}
      <div className="flex flex-wrap gap-2">
        {([
          ["teams", "Times"],
          ["result", "Resultado"],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "ghost"}
            disabled={value === "result" && m.status === "draft"}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "teams" && m.status === "draft" && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="text-lg font-semibold">
            Vez de <span className={turn === "a" ? "text-team-a" : "text-team-b"}>{turnCaptain?.name ?? "—"}</span> · Time{" "}
            {turn.toUpperCase()}
            {secondsLeft !== null && <span className="ml-3 font-display text-primary">{paused ? "Pausado" : `${secondsLeft}s`}</span>}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canPick
              ? pickingKeepers
                ? "Escolha um goleiro para o seu time. Se o tempo acabar, o sorteio escolhe por você."
                : "Escolha um jogador de linha para o seu time. Se o tempo acabar, o sorteio escolhe por você."
              : me?.isCaptain ? "Aguardando a sua vez…" : "Os capitães escolhem as linhas primeiro; os goleiros ficam por último."}
          </p>
        </div>
      )}

      {tab === "teams" && (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_20rem]">
            <TeamColumn side="a" players={teams.a} total={odds.totalA} role={teamRole("a", odds.favorite)} margin={odds.margin} prob={odds.probA} />
            <TeamColumn side="b" players={teams.b} total={odds.totalB} role={teamRole("b", odds.favorite)} margin={odds.margin} prob={odds.probB} />
            <RoomCode roomCode={m.roomCode} onSave={onSaveCode} />
          </div>

          {available.length > 0 && (
            <div className="mt-6 space-y-6">
              {outfield.length > 0 && (
                <PickGroup
                  title="Linhas"
                  icon={<Users size={16} />}
                  players={outfield}
                  active={!pickingKeepers}
                  canPick={canPick}
                  onPick={onPick}
                />
              )}
              {keepers.length > 0 && (
                <PickGroup
                  title="Goleiros"
                  icon={<Shield size={16} />}
                  players={keepers}
                  active={pickingKeepers}
                  canPick={canPick}
                  onPick={onPick}
                />
              )}
            </div>
          )}
        </>
      )}

      {tab === "result" && m.status !== "draft" && (
        <div className="space-y-6">
          <ul className="mt-5 grid gap-2 lg:grid-cols-2">{m.players.map(p => <PlayerRow key={p.userId} p={p} />)}</ul>
          <ScreenshotScore matchId={m.id} />
          <ResultPanel m={m} onVote={onVote} onCancel={onCancel} onWithdraw={onWithdraw} />
          {me?.team && <MatchLikes matchId={m.id} teammates={m.players.filter(p => p.team === me.team && !p.isMe).map(p => ({ userId: p.userId, name: p.name }))} />}
        </div>
      )}
    </section></MatchKickContext.Provider>
  );
}

function SearchingStage({
  queue,
  counts,
  players,
  onLeave,
}: {
  queue: { position: GamePosition };
  counts: { goalkeepers: number; outfield: number };
  players: GkQueuePlayer[];
  onLeave: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-center sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Procurando jogadores · 5v5</p>
      <h2 className="mt-2 text-2xl font-bold">
        Você entrou como <span className="text-primary">{queue.position}</span>
      </h2>
      <div className="relative mx-auto mt-8 grid h-28 w-28 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary animate-[pulse-ring_1.6s_ease-out_infinite]" />
        <span className="absolute inset-0 rounded-full border-2 border-primary animate-[pulse-ring_1.6s_ease-out_0.8s_infinite]" />
        <span className="font-display text-2xl font-bold text-primary">
          {Math.min(2, counts.goalkeepers) + Math.min(8, counts.outfield)}/10
        </span>
      </div>
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <SlotRow label="Goleiros" filled={counts.goalkeepers} total={2} icon={<Shield size={14} />} />
        <SlotRow label="Linha" filled={counts.outfield} total={8} icon={<Users size={14} />} />
      </div>
      <p className="mt-4 text-muted-foreground">
        {counts.goalkeepers >= 2 && counts.outfield >= 8
          ? "Fechando a partida…"
          : "Esperando mais gente entrar na fila. Chame seus amigos!"}
      </p>
      <Button variant="outline" className="mt-6" onClick={onLeave}>Sair da fila</Button>
      <QueueRoster players={players} />
    </section>
  );
}

/** Who is waiting in the queue right now, newest at the bottom, with GK/linha. */
export function QueueRoster({ players }: { players: GkQueuePlayer[] }) {
  if (players.length === 0) return null;
  return (
    <div className="mx-auto mt-8 max-w-md border-t border-border pt-5 text-left">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Na fila agora · {players.length}
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => {
          const gk = p.position === "Goleiro";
          return (
            <li key={p.userId} className={`flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 ${p.isMe ? "bg-primary/10 ring-1 ring-primary/40" : "bg-muted"}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-card text-xs font-bold text-primary">
                <Avatar path={p.avatarUrl} name={p.name} userId={p.userId} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {p.name}
                {p.isMe && <span className="ml-1.5 text-xs font-normal text-primary">você</span>}
              </span>
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${gk ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-card text-muted-foreground ring-1 ring-border"}`}>
                {gk ? <Shield size={11} /> : <Users size={11} />}
                {gk ? "GK" : "Linha"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompletedMatchResult({ result }: { result: GkState["lastResult"] }) {
  const [tab, setTab] = useState<"teams" | "result">("teams");
  if (!result) return null;
  const winner = (result.scoreA ?? 0) > (result.scoreB ?? 0) ? "a" : "b";
  return <section className="mt-8 border-b border-border pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <Button variant={tab === "teams" ? "default" : "ghost"} onClick={() => setTab("teams")}>Times</Button>
        <Button variant={tab === "result" ? "default" : "ghost"} onClick={() => setTab("result")}>Resultado</Button>
      </div>
      <h2 className="font-bold">Última partida · <span className="text-success">Time {winner.toUpperCase()} venceu</span></h2>
    </div>
    <div className="mt-5 grid gap-6 sm:grid-cols-2">
      {(["a", "b"] as const).map(side => <section key={side}>
        <h3 className={`font-bold ${side === "a" ? "text-team-a" : "text-team-b"}`}>Time {side.toUpperCase()}</h3>
        <ul className="mt-2 divide-y divide-border">
          {result.players.filter(p => p.team.toLowerCase() === side).map((p, i) => <li key={i} className="flex min-w-0 justify-between gap-3 py-2 text-sm">
            <span className="truncate">{p.name}</span>
            {tab === "result" && <strong className={(p.delta ?? 0) > 0 ? "text-success" : (p.delta ?? 0) < 0 ? "text-destructive" : "text-muted-foreground"}>{(p.delta ?? 0) > 0 ? "+" : ""}{p.delta ?? 0} MMR</strong>}
          </li>)}
        </ul>
      </section>)}
    </div>
    {tab === "result" && <PlayerLikes />}
  </section>;
}

function JoinStage({
  me,
  counts,
  position,
  onPosition,
  onJoin,
  onJoinTest,
}: {
  me: GkState["me"];
  counts: { goalkeepers: number; outfield: number };
  position: GamePosition;
  onPosition: (p: GamePosition) => void;
  onJoin: () => void;
  onJoinTest?: (() => void) | undefined;
}) {
  const isGk = position === "Goleiro";
  const role = (gk: boolean) =>
    `relative flex w-36 flex-col items-center gap-2 rounded-xl border p-5 transition ${
      gk === isGk ? "border-primary bg-primary/10 text-primary glow" : "border-border bg-card text-muted-foreground hover:border-primary/50"
    }`;
  return (
    <>
      <section className="flex flex-col items-center pb-6 pt-6 text-center sm:pb-32 sm:pt-10">
        <div className="grid h-32 w-32 place-items-center rounded-full border-4 border-primary bg-card font-display text-5xl font-bold text-primary glow">
          <Avatar path={me?.avatar_url} name={me?.name ?? "?"} />
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xl font-bold"><EquippedEmblem userId={me?.id} className="h-6 w-6" /><PlayerName userId={me?.id} name={me?.name} /><StaffTag userId={me?.id ?? null} /></p>
        {me && (
          <>
            <RankBadge rating={me.rating} className="mt-2" />
            <span className="mt-1 text-xs text-muted-foreground">{me.rating} MMR · {me.wins}V - {me.losses}D</span>
            {(() => {
              const t = tierProgress(me.rating);
              return (
                <div className="mt-3 w-64">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary glow transition-all" style={{ width: `${t.pct * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.next ? `${t.left} pts para ${t.next}` : "Topo do ranking"}
                  </p>
                </div>
              );
            })()}
          </>
        )}
        <div className="mt-6 flex gap-3 sm:gap-4">
          <button type="button" className={role(true)} onClick={() => onPosition("Goleiro")}>
            <Shield size={28} />
            <span className="font-display font-bold uppercase">Goleiro</span>
            <span className="text-xs"><strong className="text-primary">{counts.goalkeepers}</strong> na fila</span>
          </button>
          <button type="button" className={role(false)} onClick={() => !isGk || onPosition("Pivô")}>
            <Users size={28} />
            <span className="font-display font-bold uppercase">Linha</span>
            <span className="text-xs"><strong className="text-primary">{counts.outfield}</strong> na fila</span>
          </button>
        </div>
        {!isGk && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {gamePositions.filter((p) => p !== "Goleiro").map((p) => (
              <Button key={p} size="sm" variant={p === position ? "default" : "outline"} onClick={() => onPosition(p)}>
                {p}
              </Button>
            ))}
          </div>
        )}
      </section>
      <div className="rounded-xl border border-border bg-background/95 px-4 py-4 text-center backdrop-blur sm:fixed sm:inset-x-0 sm:bottom-0 sm:rounded-none sm:border-x-0 sm:border-b-0 sm:px-0">
        <p className="mb-2 text-xs text-muted-foreground">5v5 · Capitães escolhem os times</p>
        <Button size="lg" className="h-14 w-full max-w-sm font-display text-base uppercase tracking-widest glow" onClick={onJoin}>
          <UserPlus size={18} /> Procurar partida
        </Button>
        {onJoinTest && (
          <div>
            <Button variant="outline" size="sm" className="mt-2" onClick={onJoinTest}>
              Entrar na fila de teste (admin)
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function SlotRow({ label, filled, total, icon }: { label: string; filled: number; total: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`grid h-8 flex-1 place-items-center rounded-md border transition ${
              i < filled ? "border-primary bg-primary/15 text-primary glow" : "border-dashed border-border text-muted-foreground/40"
            }`}
          >
            {icon}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ m, onVote, onCancel, onWithdraw }: { m: GkMatch; onVote: (side: "a" | "b") => Promise<boolean>; onCancel: () => Promise<boolean>; onWithdraw: () => Promise<boolean> }) {
  const [pending, setPending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.from("user_roles").select("role").then(({ data }) => setIsAdmin(!!data?.some((r) => r.role === "admin")));
  }, []);
  const me = m.players.find((p) => p.isMe);
  const counts = { a: m.players.filter((p) => p.vote === "a").length, b: m.players.filter((p) => p.vote === "b").length };
  const tied = counts.a === 5 && counts.b === 5;
  const votedWinner = counts.a >= 6 ? "a" : counts.b >= 6 ? "b" : null;
  const cancelCount = m.players.filter((p) => p.cancelVote).length;
  const hasVote = Boolean(me?.vote || me?.cancelVote);

  async function withdraw() {
    if (pending || !me || !hasVote) return;
    setPending(true);
    try { await onWithdraw(); } finally { setPending(false); }
  }

  async function cancel() {
    if (pending || !me || hasVote) return;
    setPending(true);
    try { await onCancel(); } finally { setPending(false); }
  }

  async function vote(side: "a" | "b") {
    if (pending || hasVote || !me) return;
    setPending(true);
    try { await onVote(side); } finally { setPending(false); }
  }

  return (
    <section className="mt-6 border-y border-border py-6">
      <h2 className="text-2xl font-bold">Quem venceu?</h2>
      <p className="mt-2 text-sm text-muted-foreground">Seis votos no mesmo time decidem o vencedor · a fila só fecha depois do print das estatísticas</p>
      {m.status === "reporting" && votedWinner && (
        <p className="mt-3 rounded-lg border-2 border-primary/60 bg-primary/10 p-3 text-sm font-semibold">
          Votação fechada: Time {votedWinner.toUpperCase()} venceu. A fila continua aberta até alguém salvar o print das estatísticas acima.
        </p>
      )}
      {m.status === "disputed" ? (
        <p className="mt-3 text-destructive">Resultado em análise pela equipe.</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <div key={side} className="rounded-lg border border-border bg-card p-4 sm:p-5">
                <h3 className={side === "a" ? "text-xl font-bold text-team-a" : "text-xl font-bold text-team-b"}>Time {side.toUpperCase()}</h3>
                <p className="mt-2 text-3xl font-bold">{counts[side]}<span className="text-sm text-muted-foreground"> / 6 votos</span></p>
                <ul className="mt-3 min-h-6 text-sm text-muted-foreground">
                  {m.players.filter((p) => p.vote === side).map((p) => <li key={p.userId}><EquippedEmblem userId={p.userId} className="mr-1 h-4 w-4" /><PlayerName userId={p.userId} name={p.name} /> <StaffTag userId={p.userId} /></li>)}
                </ul>
                {me?.vote === side ? (
                  <Button className="mt-4 w-full" variant="secondary" disabled={pending} onClick={withdraw}>
                    <Undo2 size={16} />{pending ? "Aguarde…" : "Tirar meu voto"}
                  </Button>
                ) : (
                  <Button className="mt-4 w-full" variant="outline" disabled={pending || !me || hasVote} onClick={() => vote(side)}>
                    {pending ? "Registrando…" : `Time ${side.toUpperCase()} venceu`}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {tied && <p className="mt-4 text-destructive">Empate de votos: 5 × 5. A partida aguarda a equipe e o MMR não muda.</p>}
          {me?.vote && !tied && <p className="mt-4 text-muted-foreground">Voto registrado. Aguardando os demais jogadores.</p>}
        </>
      )}
      <div className="mt-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-destructive">Cancelar partida</p>
            <p className="mt-1 text-3xl font-bold">{cancelCount}<span className="text-base text-muted-foreground"> / 6 votos</span></p>
            <p className="mt-1 text-sm text-muted-foreground">Com seis votos, a partida é anulada e ninguém ganha nem perde MMR.</p>
            {isAdmin && <p className="mt-1 text-sm font-semibold text-destructive">Você é admin: seu voto cancela a partida na hora.</p>}
          </div>
          {me?.cancelVote ? (
            <Button size="lg" variant="secondary" className="w-full text-base font-bold sm:w-auto sm:min-w-52" disabled={pending} onClick={withdraw}>
              <Undo2 size={18} />{pending ? "Aguarde…" : "Tirar voto de cancelar"}
            </Button>
          ) : (
            <Button size="lg" variant="destructive" className="w-full text-base font-bold sm:w-auto sm:min-w-52" disabled={pending || !me || hasVote} onClick={cancel}>
              {pending ? "Registrando…" : "Votar para cancelar"}
            </Button>
          )}
        </div>
        {cancelCount > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {m.players.filter((p) => p.cancelVote).map((p) => <li key={p.userId}><EquippedEmblem userId={p.userId} className="mr-1 h-4 w-4" /><PlayerName userId={p.userId} name={p.name} /> <StaffTag userId={p.userId} /></li>)}
          </ul>
        )}
      </div>
      {hasVote && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-primary/60 bg-primary/10 p-4">
        <div>
          <p className="text-lg font-bold">Seu voto: {me?.cancelVote ? "cancelar partida" : `Time ${me?.vote?.toUpperCase()} venceu`}</p>
          <p className="text-sm text-muted-foreground">Mudou de ideia? Tire o voto e escolha de novo.</p>
        </div>
        <Button size="lg" className="w-full text-base font-bold sm:w-auto" disabled={pending} onClick={withdraw}><Undo2 size={18} />{pending ? "Aguarde…" : "Tirar meu voto"}</Button>
      </div>}
    </section>
  );
}
