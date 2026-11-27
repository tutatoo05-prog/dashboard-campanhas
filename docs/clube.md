# Clube de membros e Discord

Tela **Clube** (só admin, menu Operação) e página pública **`/discord`** (resgate do membro). Código em `server/clube/`, banco em `db/clube.sql`.

## O que já está pronto no código

| Parte | Onde | Estado |
|---|---|---|
| Tabelas `clube_membros`, `clube_snapshots`, `clube_estado` (RLS ligado) | `db/clube.sql` | Pronto e aplicado na produção (26/11/2026). |
| Membros da Essentials (vem da tabela `acessos`, cursos "Essentials" e "Mentoria Essentials": ativo e vigente, um por e-mail) | `server/clube/repo.js` | Pronto, funciona sem nenhuma credencial nova |
| Lista de membros do canal (`members.list`, todas as páginas) | `server/clube/youtube.js` | Pronto, testado com Google simulado. Falta a autorização |
| Sincronização a cada 6 h (+ botão "Sincronizar agora"), com **trava**: fonte vazia nunca cancela ninguém | `server/clube/sync.js` | Pronto, ligada no `production.js` |
| Resgate: Essentials por e-mail com link de confirmação; YouTube por login Google; depois login Discord, entrada no servidor e cargo | `server/clube/resgate.js`, `discord.js` | Pronto, testado com Google/Discord/Brevo simulados |
| Remoção do cargo quando o membro sai | `server/clube/sync.js` | Pronto |
| Painel (o que falta configurar, números, evolução, lista com busca) e página `/discord` | `src/pages/ClubePage.tsx`, `DiscordPage.tsx` | Pronto, conferido no navegador |

Nada disso liga sozinho: sem as variáveis abaixo, o painel mostra exatamente quais faltam, o resgate responde "indisponível" e a sincronização pula a parte sem credencial.

## O que falta para ligar

O passo a passo **detalhado** (com onde clicar em cada painel, o que copiar e os erros comuns) está em **[docs/clube-tutorial.md](clube-tutorial.md)**. Resumo:

1. **Banco:** `db/clube.sql` (já aplicado na produção em 26/11/2026).
2. **Google, canal:** refresh token com `youtube.channel-memberships.creator` + `yt-analytics-monetary.readonly` em `YOUTUBE_REFRESH_TOKEN` e `YOUTUBE_MEMBROS_REFRESH_TOKEN` (liga também a receita das Finanças), mais `YOUTUBE_CLIENT_ID/SECRET`. App do Google **Em produção**.
3. **Google, login público do membro:** projeto separado só com `youtube.readonly` → `CLUBE_GOOGLE_CLIENT_ID/SECRET`. Enquanto não for verificado pelo Google: aviso "app não verificado" e limite de 100 usuários. Pedir a verificação no mesmo dia (checklist na Parte 2.5 do tutorial).
4. **Discord:** app + bot, redirect cadastrado, cargo do bot **acima** dos cargos de membro, 2 cargos criados → 6 variáveis `DISCORD_*`.
5. **E-mail do resgate:** já usa a Brevo (`BREVO_*`) e o `TELWAY_V2_TOKEN` como segredo dos links; `CLUBE_SEGREDO` é opcional.
6. **Teste de ponta a ponta** (Parte 4 do tutorial).

## Decisões de segurança (não mudar sem pensar)

- **A API do YouTube não devolve e-mail de membro** (só o ID do canal). Por isso o membro do YouTube prova quem é entrando com o Google, e não digitando e-mail.
- **E-mail digitado nunca basta**: só o link enviado ao próprio e-mail libera o passo seguinte. A resposta de "pedir link" é sempre a mesma, exista ou não o e-mail (não revela quem é membro).
- Os links e o "state" dos logins são tokens assinados (HMAC), de validade curta (20 e 10 minutos), com propósito próprio, e carregam **só o id do membro** (nada pessoal na URL; a página `/discord` ainda apaga o `?t=` do endereço).
- Limites: 30 acessos por IP a cada 15 min; 5 pedidos de link por IP a cada 15 min; 3 por e-mail por hora.
- Um membro = um Discord: refazer o resgate com outra conta tira o cargo da anterior.
- **Trava de sincronização**: se uma fonte devolver lista vazia mas houver membros ativos, ninguém é cancelado nem perde cargo (um erro de API não pode derrubar todo mundo).
- Tokens, segredos e e-mails não vão para o log. Os tokens do Discord e do Google do membro são usados uma vez e **não são guardados**.

## Ainda não existe (decisões para depois)

- **Receita do clube.** A receita do YouTube já entra em Finanças (precisa só das 3 variáveis no servidor). Receita *só de membros* não é separada pela API; daria para estimar por nível × membros se você me passar os preços.
- **Cargos por nível do YouTube** (hoje há um cargo só para todos os membros do canal). O nível já é guardado em `clube_membros.nivel`; falta decidir o mapa nível → cargo.
- Aviso por Telegram/WhatsApp quando a sincronização falhar por vários dias.
- Rotina que remove do servidor quem não é mais membro (hoje só o cargo é removido).
