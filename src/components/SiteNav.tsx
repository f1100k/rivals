import { Link, useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_PROBLEM_URL } from "@/lib/links";
import { Avatar } from "@/components/Avatar";
import { getInhouseStateGk } from "@/lib/inhouse.functions";
import { blocksMatchNavigation, mustStayInMatch } from "@/lib/active-match";
import { toast } from "sonner";
import { PositionReminder } from "./PositionReminder";
import { DiscordReminder } from "./DiscordReminder";
import { StaffTag } from "./StaffTag";
import { EquippedEmblem } from "./Emblems";
import { PlayerName } from "./NameFonts";
import { CoinBalance } from "./CoinBalance";
import { NotificationBell } from "./NotificationBell";
import logoRMark from "@/assets/logo-r-mark.png.asset.json";

export function SiteNav() {
  const [nick, setNick] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [staff, setStaff] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [rolesCheckedFor, setRolesCheckedFor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStaff(false);
    setRolesCheckedFor(null);
    if (!userId) return;
    supabase.from("user_roles").select("role").eq("user_id", userId).then(({ data }) => {
      if (cancelled) return;
      setStaff(!!data?.some((r) => r.role === "admin"));
      setRolesCheckedFor(userId);
    });
    return () => { cancelled = true; };
  }, [userId]);
  // The Loja is open to every signed-in player.
  const showShop = true;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const stateFn = useServerFn(getInhouseStateGk);
  const { data: matchState } = useQuery({
    queryKey: ["inhouse-gk"],
    queryFn: () => stateFn(),
    enabled: !!nick,
    // In a match: fast; waiting in queue: medium; idle browsing: slow, to keep the database light at peak.
    refetchInterval: (q) => mustStayInMatch(q.state.data?.match?.status) ? 4000 : q.state.data?.queue ? 8000 : 30000,
    refetchIntervalInBackground: false,
  });
  const matchStatus = nick ? matchState?.match?.status : null;
  const rolesReady = userId != null && rolesCheckedFor === userId;
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const blocked = rolesReady && current.pathname === "/queue" && blocksMatchNavigation(matchStatus, next.pathname, staff);
      if (blocked) toast.error("Finalize a partida com seis votos antes de sair desta página.");
      return blocked;
    },
    enableBeforeUnload: false,
  });
  useEffect(() => {
    if (rolesReady && blocksMatchNavigation(matchStatus, pathname, staff)) {
      void navigate({ to: "/queue", replace: true });
    }
  }, [matchStatus, pathname, navigate, rolesReady, staff]);
  const link = "flex shrink-0 items-center whitespace-nowrap px-1.5 py-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors xl:px-2.5 xl:text-sm xl:tracking-wider";

  // Phones: every tab visible at once (wraps to two rows) instead of a hidden sideways scroll.
  const mobileLink = "flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors";

  function loadAvatar(userId: string | null) {
    if (!userId) return setAvatar(null);
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .single()
      .then(({ data }) => setAvatar((data?.avatar_url as string | null) ?? null));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setNick(data.session ? ((data.session.user.user_metadata?.["name"] as string) ?? "Jogador") : null);
      loadAvatar(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      setUserId(session?.user.id ?? null);
      setNick(session ? ((session.user.user_metadata?.["name"] as string) ?? "Jogador") : null);
      loadAvatar(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <><header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-1.5 px-3 sm:gap-2 sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-1.5 font-display text-base font-bold tracking-tight sm:text-lg xl:text-xl">
          <img src={logoRMark.url} alt="Rematch Nexus" className="h-5 w-auto" />
          IN<span className="text-primary">HOUSE</span> 🎃
        </Link>
        <nav className="no-scrollbar hidden min-w-0 flex-1 overflow-x-auto overscroll-x-contain sm:flex">
          <div className="flex w-max min-w-full items-center [justify-content:safe_center] gap-0.5 px-1 xl:gap-1">
          <Link to="/inicio" className={link} activeProps={{ className: "text-primary" }}>Início</Link>
          <Link to="/queue" className={link} activeProps={{ className: "text-primary" }}>Fila</Link>
          <Link to="/ranking" className={link} activeProps={{ className: "text-primary" }}>Ranking</Link>
          <Link to="/patentes" className={link} activeProps={{ className: "text-primary" }}>Patentes</Link>
          <Link to="/partidas" className={link} activeProps={{ className: "text-primary" }}>Partidas</Link>
          <Link to="/perfil" className={link} activeProps={{ className: "text-primary" }}>Perfil</Link>
          <Link to="/doacao" className={link} activeProps={{ className: "text-primary" }}>Doação</Link>
          <a href={REPORT_PROBLEM_URL} target="_blank" rel="noopener noreferrer" className={link}>
            Reportar
            <ArrowUpRight className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          </a>
          {showShop && <Link to="/loja" className={link} activeProps={{ className: "text-primary" }}>Loja</Link>}
          {staff && <Link to="/admin" className={link} activeProps={{ className: "text-primary" }}>Admin</Link>}
          </div>
        </nav>
        {nick ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 text-right text-sm">
            {userId && <NotificationBell userId={userId} />}
            {userId && <CoinBalance userId={userId} />}
            <Link to="/perfil" className="flex min-w-0 items-center gap-1.5 text-right text-sm hover:opacity-90">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-bold">
                <Avatar path={avatar} name={nick} userId={userId} />
              </span>
              <span className="hidden xl:inline-flex"><EquippedEmblem userId={userId} className="h-5 w-5" /></span>
              <div className="hidden min-w-0 max-w-28 overflow-x-clip whitespace-nowrap font-semibold xl:block xl:max-w-40"><PlayerName userId={userId} name={nick} className="truncate" /></div>
              <span className="hidden max-w-24 overflow-hidden xl:inline-flex"><StaffTag userId={userId} /></span>
            </Link>
            <Button variant="outline" size="sm" className="shrink-0 px-2.5" onClick={signOut}>Sair</Button>
          </div>
        ) : (
          <Button size="sm" className="ml-auto shrink-0 font-display uppercase" asChild>
            <Link to="/auth">Entrar</Link>
          </Button>
        )}
      </div>
      <nav className="w-full sm:hidden" aria-label="Menu">
        <div className="flex flex-wrap items-center justify-center gap-x-0.5 gap-y-0.5 px-2 pb-2">
          <Link to="/inicio" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Início</Link>
          <Link to="/queue" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Fila</Link>
          <Link to="/ranking" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Ranking</Link>
          <Link to="/patentes" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Patentes</Link>
          <Link to="/partidas" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Partidas</Link>
          <Link to="/perfil" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Perfil</Link>
          <Link to="/doacao" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Doação</Link>
          <a href={REPORT_PROBLEM_URL} target="_blank" rel="noopener noreferrer" className={mobileLink}>
            Reportar
            <ArrowUpRight className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          </a>
          {showShop && <Link to="/loja" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Loja</Link>}
          {staff && <Link to="/admin" className={mobileLink} activeProps={{ className: "bg-primary/10 text-primary" }}>Admin</Link>}
        </div>
      </nav>
    </header>
    {userId && pathname !== "/auth" && <PositionReminder key={userId} userId={userId} />}
    {userId && pathname !== "/auth" && <DiscordReminder key={userId} />}
    </>
  );
}
