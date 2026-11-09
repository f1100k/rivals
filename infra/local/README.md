# Ambiente local (offline)

Roda o app inteiro na sua máquina: Supabase em Docker (banco, auth, storage, realtime, e-mail) e o app com `vite dev`.

## Uso

Precisa de Node e do Docker Desktop aberto.

```sh
npm run local:setup   # só uma vez, com internet: dependências, imagens, assets e fontes
npm run local:dev     # sobe tudo em http://localhost:8080; Ctrl+C encerra o app e o backend
```

| Comando | O que faz |
|---|---|
| `npm run local:dev` | Sobe o backend e o app; ao encerrar o app, para o backend mantendo os dados |
| `npm run local:up` | Só sobe o backend e aplica migrations novas, mantendo os dados |
| `npm run local:reset` | **Apaga os dados locais** e recria banco e seed |
| `npm run local:down` | Para o backend, mantendo os dados |
| `npm run local:status` | Mostra URLs e chaves locais |
| `npm run local:test:security` | Executa ataques reais contra o backend local, com contas descartáveis (precisa do `local:up`) |
| `npm run local:build` / `local:start` | Build de produção em Node e execução |

- Studio (banco): http://127.0.0.1:54323
- E-mails (redefinição de senha): http://127.0.0.1:54324

## Contas de teste

Senha de todas: `local123456`

| E-mail | Papel |
|---|---|
| `admin@local.test` | Admin |
| `mod@local.test` | Moderador |
| `jogador01@local.test` … `jogador12@local.test` | Jogadores; 01 e 07 são goleiros |

Uma partida precisa de 10 jogadores na fila, sendo 2 goleiros. Para testar sozinho, use a fila de teste em Admin.

## O que muda em relação à produção

| Item | Local |
|---|---|
| Leitura de print por IA | Mock (`LOCAL_AI_MOCK=1`, `src/lib/ai-mock.server.ts`): placar 3 x 1 coerente com a votação, sem olhar a imagem |
| Discord | Desligado: sem chaves, as chamadas falham antes de sair da máquina e só geram log. Vincular conta não funciona |
| Jobs agendados | Não rodam; os dois atuais só atualizam o Discord |
| Dados | Banco vazio com seed |

## Convivência com a Lovable

- Tudo é ativado pelo `.env.local`, gerado pelo `local:up` e ignorado pelo git. **Não edite o `.env` versionado.**
- As migrations continuam nascendo em `drizzle/`. O `local:up` gera a cópia ajustada em `infra/local/supabase/migrations/`, na ordem do journal; edite apenas `drizzle/`.
- **Nunca rode `supabase link` ou `db push` na raiz do projeto:** `.env` e `supabase/config.toml` apontam para produção.
- Se uma migration nova depender de dados de produção e falhar, adicione o ajuste em `PATCHES` no `cli.mjs`.
