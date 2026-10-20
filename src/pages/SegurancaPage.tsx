import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { formatNumber } from '@/lib/format.ts'
import {
  encerrarOutrasSessoes,
  fazerBackupAgora,
  fetchSaude,
  fetchSeguranca,
  importarVendaHotmart,
  testarAlerta,
} from '@/services/segurancaService.ts'

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const soData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const quando = (iso: string) => {
  const horas = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (horas < 1) return 'agora há pouco'
  if (horas < 48) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} dias`
}

/** Chaves que já apareceram em conversa ou print: o que marcar aqui só fica neste navegador (lembrete seu). */
const CHAVES_PARA_TROCAR = [
  { id: 'telegram', rotulo: 'Token do bot do Telegram', como: '@BotFather → /revoke → copie o novo → TELEGRAM_BOT_TOKEN no Plesk' },
  { id: 'banco-dash', rotulo: 'Senha do banco do dash (usuário dash_app)', como: 'Supabase → SQL Editor: alter role dash_app password \'nova\'; depois DATABASE_URL no Plesk' },
  { id: 'banco-antigo', rotulo: 'Senha do banco antigo (Canadá) — ou apagar o projeto', como: 'Supabase → projeto antigo → Project Settings → Database' },
  { id: 'banco-essentials', rotulo: 'Senha do banco do Essentials (conferir onde é usada)', como: 'Supabase → Dados Essentials → Project Settings → Database; atualize o site e o ESSENTIALS_DATABASE_URL' },
  { id: 'hotmart', rotulo: 'Client secret e hottok da Hotmart', como: 'Hotmart → Ferramentas → Credenciais; depois HOTMART_* no Plesk' },
  { id: 'tekway', rotulo: 'Token da plataforma de cursos (Tekway)', como: 'Peça um novo ao parceiro e troque TEKWAY_TOKEN no Plesk' },
  { id: 'brevo', rotulo: 'Chave do Brevo', como: 'Brevo → SMTP & API → API Keys; depois BREVO_API_KEY no Plesk' },
  { id: 'evolution', rotulo: 'Chaves da Evolution (aluno e equipe)', como: 'Painel da Evolution; depois EVOLUTION_*_APIKEY no Plesk' },
  { id: 'meta', rotulo: 'Token de acesso da Meta', como: 'Meta Business → usuários do sistema; depois META_ACCESS_TOKEN no Plesk' },
]

function useLembretes() {
  const guardado = (() => {
    try {
      return JSON.parse(localStorage.getItem('seguranca-chaves-trocadas') ?? '[]') as string[]
    } catch {
      return []
    }
  })()
  const [feitos, setFeitos] = useState<string[]>(guardado)
  useEffect(() => {
    try {
      localStorage.setItem('seguranca-chaves-trocadas', JSON.stringify(feitos))
    } catch {
      // sem armazenamento no navegador: a lista só não fica salva
    }
  }, [feitos])
  const alternar = (id: string) => setFeitos((atuais) => (atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]))
  return { feitos, alternar }
}

function Cartao({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica?: string; tom?: 'ok' | 'alerta' }) {
  const cor = tom === 'alerta' ? 'text-red-300' : tom === 'ok' ? 'text-emerald-300' : 'text-zinc-50'
  return (
    <div className="kpi-card">
      <p className="section-label">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold ${cor}`}>{valor}</p>
      {dica && <p className="mt-0.5 text-[11px] text-zinc-500">{dica}</p>}
    </div>
  )
}

export default function SegurancaPage() {
  const queryClient = useQueryClient()
  const resumo = useQuery({ queryKey: ['seguranca'], queryFn: fetchSeguranca, retry: false, refetchInterval: 60_000 })
  const saude = useQuery({ queryKey: ['saude'], queryFn: fetchSaude, retry: false, refetchInterval: 30_000 })
  const backup = useMutation({ mutationFn: fazerBackupAgora, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['seguranca'] }) })
  const alerta = useMutation({ mutationFn: testarAlerta })
  const [jsonVenda, setJsonVenda] = useState('')
  const importar = useMutation({
    mutationFn: () => importarVendaHotmart(jsonVenda),
    onSuccess: () => {
      setJsonVenda('')
      void queryClient.invalidateQueries({ queryKey: ['seguranca'] })
      void queryClient.invalidateQueries({ queryKey: ['acessos'] })
    },
  })
  const sessoes = useMutation({ mutationFn: encerrarOutrasSessoes, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['seguranca'] }) })
  const { feitos, alternar } = useLembretes()
  const [confirmando, setConfirmando] = useState(false)
  const [verTrocadas, setVerTrocadas] = useState(false)

  const dados = resumo.data
  const erro = resumo.error as Error | null
  const ultimoBackup = dados?.backup.arquivos[0]
  const pendentes = CHAVES_PARA_TROCAR.length - feitos.filter((id) => CHAVES_PARA_TROCAR.some((chave) => chave.id === id)).length
  const configuracaoRuim = dados?.configuracao.filter((item) => !item.ok).length ?? 0
  const s = saude.data

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Admin</p>
        <Typewriter as="h2" className="section-title mt-1" text="Segurança" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Backup do banco, avisos de problema, quem está logado, o que foi mexido nas campanhas e as chaves que ainda precisam ser trocadas.
        </p>
      </PageHero>

      {erro && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300">
          {erro.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : erro.message}
        </section>
      )}

      {dados && (
        <>
          <section className="kpi-scroll">
            <Cartao
              rotulo="Último backup"
              valor={ultimoBackup ? soData(ultimoBackup.em) : 'nenhum ainda'}
              dica={ultimoBackup ? quando(ultimoBackup.em) : dados.backup.ligado ? 'roda de madrugada' : 'falta BACKUP_PASSPHRASE'}
              tom={dados.backup.ligado ? (ultimoBackup ? 'ok' : undefined) : 'alerta'}
            />
            <Cartao
              rotulo="Avisos de problema"
              valor={dados.avisos.canal === 'telegram' ? 'Telegram' : dados.avisos.canal === 'whatsapp' ? 'WhatsApp' : 'desligados'}
              dica={dados.avisos.canal === 'telegram' ? 'canal principal' : 'configure o Telegram'}
              tom={dados.avisos.canal === 'nenhum' ? 'alerta' : undefined}
            />
            <Cartao rotulo="Logins ativos" valor={formatNumber(dados.sessoes.length)} dica="sessões de 30 dias" />
            <Cartao rotulo="Ajustes pendentes" valor={formatNumber(configuracaoRuim)} dica="veja a lista abaixo" tom={configuracaoRuim ? 'alerta' : 'ok'} />
            <Cartao rotulo="Chaves a trocar" valor={formatNumber(pendentes)} dica="sua lista de lembretes" tom={pendentes ? 'alerta' : 'ok'} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface-card p-4 text-sm">
              <p className="section-label">Cópia de segurança</p>
              <h3 className="section-title mt-1">Backup do banco</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Todo dia depois das {dados.backup.hora} h (horário de São Paulo) o servidor tira uma cópia criptografada do banco e guarda {dados.backup.dias} dias no servidor
                {dados.backup.noTelegram ? ' e no seu Telegram' : ''}{dados.backup.noDrive ? ' e no Google Drive' : ''}. O Supabase grátis não faz backup sozinho.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={backup.isPending} onClick={() => backup.mutate()} className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50">
                  <i className="fa-solid fa-database mr-1.5" />
                  {backup.isPending ? 'Fazendo o backup...' : 'Fazer backup agora'}
                </button>
              </div>
              {backup.data && (
                <p className="mt-3 text-emerald-300">
                  Backup feito: {formatNumber(backup.data.linhas)} linhas de {backup.data.tabelas} tabelas, guardado em {backup.data.destinos.join(' e ')} ({Math.round(backup.data.bytes / 1024)} KB).
                </p>
              )}
              {backup.isError && <p className="mt-3 text-red-300">{(backup.error as Error).message}</p>}
              {dados.backup.arquivos.length > 0 ? (
                <ul className="mt-3 max-h-56 divide-y divide-zinc-800/60 overflow-auto text-xs">
                  {dados.backup.arquivos.map((arquivo) => (
                    <li key={arquivo.nome} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-zinc-200">
                        <i className="fa-solid fa-file-shield mr-2 text-zinc-500" />
                        {arquivo.nome}
                      </span>
                      <span className="text-zinc-500">
                        {Math.round(arquivo.bytes / 1024)} KB · {dataHora(arquivo.em)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">Nenhum arquivo guardado no servidor ainda.</p>
              )}
            </section>

            <section className="surface-card p-4 text-sm">
              <p className="section-label">Quando algo falha</p>
              <h3 className="section-title mt-1">Avisos de problema</h3>
              <p className="mt-1 text-xs text-zinc-500">
                O vigia confere a liberação de acesso a cada 10 minutos e avisa no {dados.avisos.canal === 'telegram' ? 'Telegram' : 'WhatsApp da equipe'} quando:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                <li><i className="fa-solid fa-circle-check mr-2 text-emerald-500" />um evento da Hotmart fica parado por mais de 15 minutos;</li>
                <li><i className="fa-solid fa-circle-check mr-2 text-emerald-500" />um aluno pago pode estar sem acesso (liberação falhou ou precisa de atenção);</li>
                <li><i className="fa-solid fa-circle-check mr-2 text-emerald-500" />o webhook da Hotmart nunca recebeu nada, ou parou de chegar há mais de 36 h;</li>
                <li><i className="fa-solid fa-circle-check mr-2 text-emerald-500" />o backup diário falha.</li>
              </ul>
              <div className="mt-3">
                <button type="button" disabled={alerta.isPending} onClick={() => alerta.mutate()} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50">
                  <i className="fa-solid fa-bell mr-1.5" />
                  {alerta.isPending ? 'Enviando...' : 'Testar aviso de problema'}
                </button>
              </div>
              {alerta.data && <p className="mt-3 text-emerald-300">Aviso de teste enviado pelo {alerta.data.canal}. Confira se chegou.</p>}
              {alerta.isError && <p className="mt-3 text-red-300">{(alerta.error as Error).message}</p>}
            </section>
          </div>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Saúde do sistema</p>
            <h3 className="section-title mt-1">Agora mesmo</h3>
            {s ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-zinc-800/60 p-3">
                  <p className="text-xs text-zinc-500">Banco de dados</p>
                  <p className={`text-base font-semibold ${s.banco.ok ? 'text-emerald-300' : 'text-red-300'}`}>{s.banco.ok ? `${s.banco.ms} ms` : 'sem resposta'}</p>
                </div>
                <div className="rounded-lg border border-zinc-800/60 p-3">
                  <p className="text-xs text-zinc-500">Conexões do banco</p>
                  <p className="text-base font-semibold text-zinc-100">{s.filaDoBanco ? `${s.filaDoBanco.total} de ${s.filaDoBanco.maximo}` : '—'}</p>
                </div>
                <div className="rounded-lg border border-zinc-800/60 p-3">
                  <p className="text-xs text-zinc-500">Servidor ligado há</p>
                  <p className="text-base font-semibold text-zinc-100">{s.servidor.ligadoHaMinutos >= 120 ? `${Math.round(s.servidor.ligadoHaMinutos / 60)} h` : `${s.servidor.ligadoHaMinutos} min`}</p>
                </div>
                <div className="rounded-lg border border-zinc-800/60 p-3">
                  <p className="text-xs text-zinc-500">Memória</p>
                  <p className="text-base font-semibold text-zinc-100">{s.servidor.memoriaMB} MB</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">{saude.isError ? 'Não consegui medir agora.' : 'Medindo...'}</p>
            )}
          </section>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Vendas da Hotmart</p>
            <h3 className="section-title mt-1">O webhook está chegando?</h3>
            <p
              className={`mt-1 text-xs ${
                dados.hotmart.recusadas > 0 && !dados.hotmart.aceitas ? 'text-red-300' : dados.hotmart.total > 0 || dados.hotmart.aceitas > 0 ? 'text-emerald-300' : 'text-amber-200'
              }`}
            >
              {dados.hotmart.recusadas > 0 && !dados.hotmart.aceitas
                ? 'A Hotmart está batendo no dash, mas o código de segurança (hottok) não confere: as vendas estão sendo recusadas.'
                : dados.hotmart.total > 0
                  ? 'A Hotmart está entregando eventos ao dash.'
                  : 'Nenhum evento chegou ainda. Pode não ter havido compra desde que o webhook foi ligado, ou a Hotmart não está entregando.'}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-800/60 p-3">
                <p className="text-xs text-zinc-500">Eventos guardados</p>
                <p className="text-base font-semibold text-zinc-100">{formatNumber(dados.hotmart.total)}</p>
                <p className="text-[11px] text-zinc-500">{dados.hotmart.ultimoEm ? `o último: ${dataHora(dados.hotmart.ultimoEm)}` : 'nenhum ainda'}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/60 p-3">
                <p className="text-xs text-zinc-500">Aceitos (desde o último reinício)</p>
                <p className="text-base font-semibold text-zinc-100">{formatNumber(dados.hotmart.aceitas)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/60 p-3">
                <p className="text-xs text-zinc-500">Recusados por hottok errado</p>
                <p className={`text-base font-semibold ${dados.hotmart.recusadas ? 'text-red-300' : 'text-zinc-100'}`}>{formatNumber(dados.hotmart.recusadas)}</p>
                <p className="text-[11px] text-zinc-500">{dados.hotmart.ultimaRecusaEm ? `o último: ${dataHora(dados.hotmart.ultimaRecusaEm)}` : 'nenhum'}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/60 p-3">
                <p className="text-xs text-zinc-500">Hottok configurado no Plesk</p>
                <p className={`text-base font-semibold ${dados.hotmart.hottokConfigurado ? 'text-emerald-300' : 'text-red-300'}`}>{dados.hotmart.hottokConfigurado ? 'sim' : 'não'}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Os contadores de "aceitos" e "recusados" zeram a cada reinício do app. Para ver o histórico completo: Hotmart → Ferramentas → Webhook → Histórico.
            </p>
          </section>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Quando o webhook falhou</p>
            <h3 className="section-title mt-1">Importar venda da Hotmart</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Se uma venda não chegou ao dash (webhook com erro), cole aqui o JSON dela: na Hotmart, vá em <b>Ferramentas → Webhook → Histórico</b>, clique na lupa da entrega
              daquela venda e copie o <b>Corpo de postagem</b> inteiro. O dash grava como se a Hotmart tivesse mandado e faz a liberação normal (curso, e-mail, WhatsApp e aviso à equipe).
              O código de segurança (hottok) que vier no texto não é guardado.
            </p>
            <textarea
              value={jsonVenda}
              onChange={(evento) => setJsonVenda(evento.target.value)}
              rows={5}
              placeholder='{ "event": "PURCHASE_APPROVED", "data": { ... } }'
              className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={importar.isPending || !jsonVenda.trim()}
                onClick={() => importar.mutate()}
                className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-zinc-50 hover:bg-amber-400/10 disabled:opacity-50"
              >
                <i className="fa-solid fa-file-import mr-1.5" />
                {importar.isPending ? 'Importando...' : 'Importar e liberar'}
              </button>
              {importar.data && (
                <span className={importar.data.repetido ? 'text-amber-200' : 'text-emerald-300'}>
                  {importar.data.repetido
                    ? 'Esta venda já estava registrada (nada foi repetido).'
                    : importar.data.processa
                      ? `Registrada: ${importar.data.produto ?? 'venda'} de ${importar.data.email ?? 'sem e-mail'}. A liberação já começou, acompanhe em Acessos → Eventos.`
                      : 'Registrada, mas esse tipo de evento só fica guardado (não libera nada).'}
                </span>
              )}
              {importar.isError && <span className="text-red-300">{(importar.error as Error).message}</span>}
            </div>
          </section>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Publicação</p>
            <h3 className="section-title mt-1">Último deploy</h3>
            {dados.deploy ? (
              <>
                <p className={`mt-1 text-xs ${dados.deploy.estado === 'ok' ? 'text-emerald-300' : dados.deploy.estado === 'erro' ? 'text-red-300' : 'text-amber-200'}`}>
                  {dados.deploy.estado === 'ok' ? 'Concluído' : dados.deploy.estado === 'erro' ? 'Falhou' : 'Em andamento (ou parou no meio)'} · registro de {dataHora(dados.deploy.em)}
                </p>
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-zinc-800/60 p-3 text-[11px] leading-relaxed text-zinc-300">{dados.deploy.linhas.join('\n')}</pre>
              </>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Ainda não há registro: o deploy automático grava o deploy.log quando rodar.</p>
            )}
          </section>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Quem está logado</p>
            <h3 className="section-title mt-1">Sessões ativas</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="data-table data-table-brief">
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Pessoa</th>
                    <th className="font-medium">Cargo</th>
                    <th className="font-medium">Entrou em</th>
                    <th className="font-medium">Vale até</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.sessoes.map((sessao, indice) => (
                    <tr key={`${sessao.email}-${indice}`} className="border-b border-zinc-900/80">
                      <td className="cell-name text-zinc-200" data-label="Pessoa">
                        {sessao.nome}
                        {sessao.atual && <span className="ml-2 rounded-full border border-emerald-500/40 px-2 text-[10px] text-emerald-300">você, agora</span>}
                        <span className="block text-xs text-zinc-500">{sessao.email}</span>
                      </td>
                      <td className="cell-key cell-nolabel text-zinc-400" data-label="Cargo">{sessao.cargo}</td>
                      <td className="cell-more text-zinc-400" data-label="Entrou em">{dataHora(sessao.entrouEm)}</td>
                      <td className="cell-brief text-zinc-400" data-label="Vale até">{soData(sessao.expiraEm)}</td>
                    </tr>
                  ))}
                  {!dados.sessoes.length && (
                    <tr>
                      <td colSpan={4} className="cell-empty text-center text-zinc-600">Nenhuma sessão ativa.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!confirmando ? (
                <button type="button" onClick={() => setConfirmando(true)} className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
                  <i className="fa-solid fa-right-from-bracket mr-1.5" />
                  Encerrar os outros logins
                </button>
              ) : (
                <>
                  <span className="text-xs text-zinc-400">Todo mundo, menos você, vai precisar entrar de novo. Confirma?</span>
                  <button
                    type="button"
                    disabled={sessoes.isPending}
                    onClick={() => {
                      sessoes.mutate()
                      setConfirmando(false)
                    }}
                    className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Sim, encerrar
                  </button>
                  <button type="button" onClick={() => setConfirmando(false)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">
                    Cancelar
                  </button>
                </>
              )}
              {sessoes.data && <span className="text-emerald-300">{sessoes.data.encerradas} login(s) encerrado(s).</span>}
              {sessoes.isError && <span className="text-red-300">{(sessoes.error as Error).message}</span>}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface-card p-4 text-sm">
              <p className="section-label">Configuração</p>
              <h3 className="section-title mt-1">O que está ligado</h3>
              <ul className="mt-3 space-y-2">
                {dados.configuracao.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <i className={`fa-solid mt-0.5 ${item.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-red-500'}`} />
                    <span className="text-zinc-200">
                      {item.rotulo}
                      {!item.ok && <span className="block text-xs text-zinc-500">{item.dica}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="surface-card p-4 text-sm">
              <p className="section-label">Lembrete seu</p>
              <h3 className="section-title mt-1">Chaves para trocar</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Chaves que já apareceram em conversa ou em print devem ser trocadas, uma de cada vez (troque no serviço, atualize no Plesk e reinicie o app). Ao marcar, a chave some da lista; o lembrete fica salvo neste navegador.
              </p>
              <ul className="mt-3 space-y-2">
                {CHAVES_PARA_TROCAR.filter((chave) => verTrocadas || !feitos.includes(chave.id)).map((chave) => {
                  const feito = feitos.includes(chave.id)
                  return (
                    <li key={chave.id}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={feito} onChange={() => alternar(chave.id)} className="mt-1" />
                        <span className={feito ? 'text-zinc-500' : 'text-zinc-200'}>
                          {chave.rotulo}
                          <span className="block text-xs text-zinc-500">{chave.como}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {pendentes === 0 && (
                <p className="mt-3 text-emerald-300">
                  <i className="fa-solid fa-circle-check mr-1.5" />
                  Tudo trocado. Boa!
                </p>
              )}
              {feitos.some((id) => CHAVES_PARA_TROCAR.some((chave) => chave.id === id)) && (
                <button type="button" onClick={() => setVerTrocadas((atual) => !atual)} className="mt-3 text-xs text-zinc-500 underline hover:text-zinc-300">
                  {verTrocadas ? 'Esconder as já trocadas' : `Ver as ${CHAVES_PARA_TROCAR.length - pendentes} já trocadas (para desfazer)`}
                </button>
              )}
            </section>
          </div>

          <section className="surface-card p-4 text-sm">
            <p className="section-label">Histórico</p>
            <h3 className="section-title mt-1">O que foi mexido nas campanhas</h3>
            <p className="mt-1 text-xs text-zinc-500">Tudo que o painel alterou na Meta (pausar, reativar, mudar orçamento): quem fez e quando.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="data-table data-table-brief">
                <thead>
                  <tr className="border-y border-zinc-800/60 text-xs text-zinc-500">
                    <th className="font-medium">Quando</th>
                    <th className="font-medium">Quem</th>
                    <th className="font-medium">Campanha</th>
                    <th className="font-medium">Ação</th>
                    <th className="font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.acoes.map((acao, indice) => (
                    <tr key={`${acao.em}-${indice}`} className="border-b border-zinc-900/80">
                      <td className="cell-name whitespace-nowrap text-zinc-400" data-label="Quando">{dataHora(acao.em)}</td>
                      <td className="cell-brief text-zinc-300" data-label="Quem">{acao.usuario || '—'}</td>
                      <td className="cell-brief text-zinc-300" title={acao.campanha ?? ''} data-label="Campanha">{acao.campanha || '—'}</td>
                      <td className="cell-brief text-zinc-300" data-label="Ação">{acao.acao}</td>
                      <td className={`cell-key cell-nolabel ${acao.ok ? 'text-emerald-300' : 'text-red-300'}`} data-label="Resultado">{acao.ok ? 'feito' : 'falhou'}</td>
                    </tr>
                  ))}
                  {!dados.acoes.length && (
                    <tr>
                      <td colSpan={5} className="cell-empty text-center text-zinc-600">Nenhuma alteração feita pelo painel ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
