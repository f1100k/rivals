# Sistema de reputação (likes entre companheiros)

## Regras
- Depois que uma partida termina (finalizada, não cancelada/anulada), cada jogador pode dar like nos companheiros do **próprio time**.
- Cada pessoa só pode curtir outra pessoa **uma única vez para sempre** (mesmo que joguem juntos de novo).
- Sem prazo: o like fica disponível nas partidas concluídas enquanto ainda não tiver sido dado.
- Não dá para curtir a si mesmo nem tirar o like depois. Contas de bots não contam.
- Reputação = total de likes recebidos.

## O que aparece no site
- Na fila, logo acima de "Denúncias · pós-partida", uma nova seção **"Reputação · pós-partida"** listando as partidas recentes com os companheiros de time e um botão de coração/joinha "Curtir". Quem já foi curtido mostra "Curtido".
- No perfil do jogador (janela de perfil e Início), um número de **Reputação** ao lado das estatísticas.
- Prêmios por reputação ficam para depois.

## Detalhes técnicos
- Nova tabela `player_likes (giver_id, target_id, match_id, created_at)`, chave única `(giver_id, target_id)`; RLS com leitura apenas do próprio like dado; escrita só via RPC.
- RPC `like_player(p_match, p_target)` SECURITY DEFINER: valida que o chamador e o alvo estavam na partida, no mesmo time, partida `completed` e sem bots; insere com `ON CONFLICT DO NOTHING`.
- RPC `get_my_like_matches()` retorna últimas partidas concluídas com companheiros e flag `liked`.
- `get_player_profile` passa a incluir `reputation` (contagem).
- Server functions em `src/lib/player-likes.functions.ts`; componente `PlayerLikes.tsx` na página da fila; exibição no `PlayerProfile`.
- Teste SQL cobrindo: like duplicado bloqueado, adversário bloqueado, auto-like bloqueado.
