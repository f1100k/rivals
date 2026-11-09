import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade · Inhouse Rematch" },
      { name: "description", content: "Quais dados o Inhouse Rematch coleta, como usa e como você pode excluir sua conta (LGPD)." },
      { property: "og:title", content: "Política de Privacidade · Inhouse Rematch" },
      { property: "og:description", content: "Quais dados coletamos, como usamos e como excluir sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Política de Privacidade</h1>
      <p className="mt-1 text-muted-foreground">Atualizada em novembro de 2026 · Lei Geral de Proteção de Dados (Lei 13.709/2018)</p>
      <h2 className="mt-6 text-lg font-bold">1. Dados que coletamos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Cadastro: nome de jogador, e-mail e senha (guardada de forma criptografada).</li>
        <li>Perfil: foto, posições preferidas e moldura escolhida.</li>
        <li>Jogo: filas, partidas, votos, prints de resultado, MMR, estatísticas e denúncias.</li>
        <li>Discord (opcional): ID e nome de usuário, se você conectar sua conta.</li>
      </ul>
      <h2 className="mt-6 text-lg font-bold">2. Para que usamos</h2>
      <p className="mt-2">Para montar as filas e times, calcular ranking e MMR, moderar a comunidade (denúncias e punições) e avisar resultados no Discord. Não vendemos nem compartilhamos seus dados para publicidade.</p>
      <h2 className="mt-6 text-lg font-bold">3. O que é público</h2>
      <p className="mt-2">Nome de jogador, foto, MMR, patente, estatísticas e histórico de partidas aparecem no ranking e no perfil público. Seu e-mail nunca é mostrado. Quem fez uma denúncia é visto só pela administração.</p>
      <h2 className="mt-6 text-lg font-bold">4. Segurança</h2>
      <p className="mt-2">O site usa conexão segura (HTTPS). Os dados ficam criptografados e cada informação tem regras de acesso para que ninguém altere os dados de outra pessoa.</p>
      <h2 className="mt-6 text-lg font-bold">5. Seus direitos</h2>
      <p className="mt-2">Você pode ver e corrigir seus dados no <Link to="/perfil" className="text-primary underline">Perfil</Link> e excluir sua conta a qualquer momento pelo botão “Excluir minha conta”. Ao excluir, seu nome, e-mail, foto, posições e vínculo com o Discord são apagados; os resultados das partidas ficam anônimos para não alterar o ranking dos outros jogadores.</p>
      <h2 className="mt-6 text-lg font-bold">6. Contato</h2>
      <p className="mt-2">Dúvidas sobre seus dados: fale com a administração no nosso servidor do Discord.</p>
    </main>
  );
}
