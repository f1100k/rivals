import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inhouse Rematch · Fila 5v5 com goleiros" },
      { name: "description", content: "Entre na fila declarando sua posição, os goleiros montam os times, joguem com o código da sala e a votação decide o vencedor. Ranking geral de MMR." },
      { property: "og:title", content: "Inhouse Rematch · Fila 5v5 com goleiros" },
      { property: "og:description", content: "Fila in-house de Rematch: posições, escolha dos goleiros, código da sala e votação de 6 votos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/inicio", replace: true }); },
});
