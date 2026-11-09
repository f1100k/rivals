import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ShieldCheck, Clock3, Award, ArrowRight, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getPointProtection, activatePointProtection } from '@/lib/point-protection.functions';

const eventNames: Record<string, string> = { daily_grant: 'Reposição diária', rank_grant: 'Evolução de patente', admin_grant: 'Entrega do administrador', match_result: 'Resultado', protection_used: 'Proteção ativada', protection_revoked: 'Proteção anulada por trollagem', trolling_penalty: 'Trollagem confirmada' };
export function PointProtection() {
  const fetchState = useServerFn(getPointProtection);
  const activate = useServerFn(activatePointProtection);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['point-protection'], queryFn: () => fetchState(), refetchInterval: 15000, refetchIntervalInBackground: false });
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState<'daily' | 'rank' | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function save() {
    if (!choice || !data?.result || pending) return;
    setPending(true);
    try {
      await activate({ data: { matchId: data.result.matchId, category: choice } });
      await Promise.all(['point-protection', 'inhouse-gk', 'ranking', 'my-profile', 'inicio'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setChoice(null); toast.success('Proteção ativada. Pontos da derrota devolvidos.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível ativar.'); }
    finally { setPending(false); }
  }
  if (error) return <p className="mt-8 text-sm text-destructive">Não foi possível carregar sua proteção de pontos.</p>;
  if (!data) return <section aria-label="Carregando proteção de pontos" className="mt-8 border-t border-border py-6"><div className="h-6 w-52 animate-pulse rounded bg-muted" /><div className="mt-4 h-32 animate-pulse rounded bg-muted" /></section>;
  const seconds = Math.max(0, Math.ceil((Date.parse(data.dailyNextAt) - now) / 1000));
  const countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  const result = data.result;
  const eligible = !!result && result.baseDelta < 0 && !result.blockedReason;
  const recoverable = eligible ? -result.baseDelta : 0;
  const protectedResult = !!result?.protectionKind;
  const total = (data.dailyAvailable ? 1 : 0) + data.rankStock;
  return <section className="mt-8 border-t border-border py-6 text-left">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="text-primary" size={22} /> Proteção de pontos</h2>
      <span className="text-sm font-semibold text-muted-foreground">{total} {total === 1 ? 'protetor disponível' : 'protetores disponíveis'}</span>
    </div>
    <div className={`mt-4 flex items-start gap-3 border-l-4 px-4 py-3 ${eligible || protectedResult ? 'border-success bg-success/10' : 'border-border bg-muted/40'}`} role="status">
      {protectedResult ? <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={20} /> : eligible ? <ShieldCheck className="mt-0.5 shrink-0 text-success" size={20} /> : <Info className="mt-0.5 shrink-0 text-muted-foreground" size={20} />}
      <div className="min-w-0">
        <p className="font-semibold">{protectedResult ? 'Pontos recuperados' : eligible ? `Você pode recuperar ${recoverable} MMR` : 'Nenhuma derrota para proteger agora'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{eligible ? 'Ative agora, antes de entrar numa nova fila: depois que outra partida começa, esta derrota não pode mais ser protegida.' : result?.blockedReason ?? 'Os protetores ficam guardados para uma derrota que desconte pontos.'}</p>
      </div>
    </div>
    {result && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">Última partida · #{result.matchId.slice(0, 8)}</span>
      <span className="flex items-center gap-2 font-semibold">{result.before} <ArrowRight size={14} className="text-muted-foreground" /> {result.after} MMR <span className={result.delta < 0 ? 'text-destructive' : 'text-success'}>({result.delta > 0 ? '+' : ''}{result.delta})</span></span>
    </div>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <article className="flex flex-col rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2"><Clock3 size={18} className="text-primary" /><h3 className="text-sm font-semibold">Proteção diária</h3></div>
        <p className="mt-3 text-2xl font-bold">{data.dailyAvailable ? '1 disponível' : '0 disponíveis'}</p>
        <p className="mt-1 text-sm text-muted-foreground">Repõe a cada 24h. Não acumula.</p>
        <p className="mt-2 text-xs text-muted-foreground">Próxima reposição · <span className="tabular-nums">{countdown}</span></p>
        {eligible && <Button className="mt-4 w-full" disabled={!data.dailyAvailable || pending} onClick={() => setChoice('daily')}><ShieldCheck size={16} /> Usar proteção · diária</Button>}
      </article>
      <article className="flex flex-col rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2"><Award size={18} className="text-primary" /><h3 className="text-sm font-semibold">Proteção por patente</h3></div>
        <p className="mt-3 text-2xl font-bold">{data.rankStock} disponíveis</p>
        <p className="mt-1 text-sm text-muted-foreground">Ganha ao subir de patente pela primeira vez.</p>
        <p className="mt-2 text-xs text-muted-foreground">Acumula e não expira.</p>
        {eligible && <Button className="mt-auto w-full translate-y-0" variant="outline" disabled={data.rankStock < 1 || pending} onClick={() => setChoice('rank')}><ShieldCheck size={16} /> Usar proteção · patente</Button>}
      </article>
    </div>
    {eligible && total === 0 && <p className="mt-3 text-sm text-muted-foreground">Você está sem protetores. Aguarde a reposição diária para proteger esta derrota, sem iniciar outra partida.</p>}
    <details className="mt-6 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Histórico de proteção e pontos</summary>{result && <p className="mt-3 text-xs text-muted-foreground">Média A: {Number(result.averageA).toLocaleString('pt-BR')} · Média B: {Number(result.averageB).toLocaleString('pt-BR')}</p>}<ul className="mt-3 divide-y divide-border">{data.history.map((e, i) => <li key={`${e.createdAt}-${i}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{eventNames[e.event] ?? e.event}<small className="ml-2 text-muted-foreground">{new Date(e.createdAt).toLocaleString('pt-BR')}</small></span><span>{e.points !== 0 ? `${e.points > 0 ? '+' : ''}${e.points} MMR` : `${e.stockChange > 0 ? '+' : ''}${e.stockChange} protetores`}</span></li>)}</ul></details>
    <Dialog open={choice !== null} onOpenChange={open => { if (!open && !pending) setChoice(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Recuperar {result ? -result.baseDelta : 0} MMR?</DialogTitle><DialogDescription>Será usado 1 protetor {choice === 'daily' ? 'diário' : 'por patente'} nesta derrota. Trollagem confirmada posteriormente anula a proteção e devolve o protetor.</DialogDescription></DialogHeader><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setChoice(null)} disabled={pending}>Voltar</Button><Button onClick={save} disabled={pending}>{pending ? <><Loader2 className="animate-spin" size={16} /> Recuperando…</> : <><ShieldCheck size={16} /> Confirmar proteção</>}</Button></div></DialogContent></Dialog>
  </section>;
}