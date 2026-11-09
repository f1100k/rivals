import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso · Inhouse Rematch" },
      { name: "description", content: "Regras de uso do Inhouse Rematch: conta, conduta, filas, denúncias e punições." },
      { property: "og:title", content: "Termos de Uso · Inhouse Rematch" },
      { property: "og:description", content: "Regras de uso: conta, conduta, filas, denúncias e punições." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Termos,
});

function Termos() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Termos de Uso</h1>
      <p className="mt-1 text-muted-foreground">Atualizados em novembro de 2026</p>
      <h2 className="mt-6 text-lg font-bold">1. O serviço</h2>
      <p className="mt-2">O Inhouse Rematch é um site gratuito da comunidade para organizar partidas 5v5, com fila, draft, votação de resultado, MMR e ranking. Não é ligado oficialmente aos criadores do jogo.</p>
      <h2 className="mt-6 text-lg font-bold">2. Sua conta</h2>
      <p className="mt-2">Cada pessoa usa uma única conta e é responsável por ela. Não use nomes ou fotos ofensivos nem se passe por outra pessoa.</p>
      <h2 className="mt-6 text-lg font-bold">3. Conduta</h2>
      <p className="mt-2">É proibido trollar, abandonar partidas, votar resultado falso, enviar print adulterado, ofender ou discriminar jogadores. Os jogadores da partida podem denunciar; a administração analisa e pode aplicar suspensão temporária ou banimento permanente, além de ajustes de MMR conforme as <Link to="/patentes" className="text-primary underline">regras competitivas</Link>.</p>
      <h2 className="mt-6 text-lg font-bold">4. Resultados e MMR</h2>
      <p className="mt-2">Resultados são definidos pela votação dos jogadores e pelo print da partida. A administração pode corrigir ou cancelar partidas em caso de erro ou fraude.</p>
      <h2 className="mt-6 text-lg font-bold">5. Privacidade</h2>
      <p className="mt-2">O uso dos seus dados está descrito na <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>. Você pode excluir sua conta quando quiser.</p>
      <h2 className="mt-6 text-lg font-bold">6. Mudanças</h2>
      <p className="mt-2">Estes termos podem mudar; avisaremos no Discord. Continuar usando o site significa aceitar a versão atual.</p>
    </main>
  );
}
