-- Lança no dash as 6 vendas da Hotmart (15 e 16/10/2026) que o webhook/n8n não entregou.
-- Só grava na tabela de compras (purchases): NÃO toca em hotmart_eventos, não libera acesso e não manda e-mail.
-- Valores = valor base do produto (sem juros do parcelamento), como as demais linhas. Telefone não vem da API da Hotmart.
-- Pode rodar mais de uma vez: pula o que já existe (mesma transação, ou mesmo e-mail + curso + dia).
-- Rodar conectado como dash_app (search_path = dash) ou prefixar com "dash.".

begin;

insert into purchases (fonte_id, nome, email, curso, campanha, data, valor, status, pagamento_tipo, transacao, src, recorrencia, created_at)
select v.fonte_id, v.nome, lower(v.email), v.curso, v.campanha, v.data, v.valor, 'ativo', v.pagamento_tipo, v.transacao, v.src, 1, v.created_at::timestamptz
from (values
  ('hotmart:HP3744203616', 'Edilson Andrade dos Santos', 'crazysantos1@outlook.com', 'Essentials', 'essentials_hero-v1_a', '15/10/2026', 2999.99, 'BILLET', 'HP3744203616', 'essentials_hero-v1_a', '2026-10-15T23:58:27.000Z'),
  ('hotmart:HP2846584432', 'Anderson Luis Espacasassi', 'andersonluis4311@gmail.com', 'Mentoria Essentials', '', '15/10/2026', 136.01, 'BILLET', 'HP2846584432', null, '2026-10-16T00:58:46.000Z'),
  ('hotmart:HP2833502969', 'Gustavo Fernandes', 'gst.foliveira@gmail.com', 'Essentials', 'live', '15/10/2026', 1497, 'CREDIT_CARD', 'HP2833502969', 'live', '2026-10-16T00:48:01.000Z'),
  ('hotmart:HP2733483579', 'Francisco John Lenno Sousa Rodrigues', 'johnlenno24681357@gmail.com', 'Mentoria Essentials', '', '15/10/2026', 136.01, 'BILLET', 'HP2733483579', null, '2026-10-16T01:06:27.000Z'),
  ('hotmart:HP0818588303', 'Weslei Aparecido Moreira', 'wesleitattoopiercing27@gmail.com', 'Mentoria Essentials', '', '15/10/2026', 136.01, 'BILLET', 'HP0818588303', null, '2026-10-16T02:22:49.000Z'),
  ('hotmart:HP0314288120', 'Pedro Henrique da Silva Araújo', '97pedroaraujo97@gmail.com', 'Essentials', 'live', '16/10/2026', 1497, 'CREDIT_CARD', 'HP0314288120', 'live', '2026-10-16T12:58:11.000Z')
) as v(fonte_id, nome, email, curso, campanha, data, valor, pagamento_tipo, transacao, src, created_at)
where not exists (
  select 1 from purchases p
   where p.fonte_id = v.fonte_id
      or p.transacao = v.transacao
      or (lower(p.email) = lower(v.email) and p.curso = v.curso and p.data = v.data)
);

-- conferência: deve listar as 6 vendas
select nome, curso, data, valor, transacao from purchases where fonte_id like 'hotmart:%' order by created_at;

commit;
