import { confirmar } from '@/components/ui/ConfirmDialog.tsx'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPlayerConfig,
  savePlayerConfig,
  type AnimacaoBotao,
  type FormaBotao,
  type PlayerConfig,
  type PlayerConfigState,
  type PosicaoBotao,
  type TamanhoBotao,
  type VerticalBotao,
} from '@/services/videoService.ts'

/** Onde o player fica publicado (dist-player/ do projeto produtos). É o que as páginas de venda embutem. */
const PLAYER_URL =
  (import.meta.env.DEV && new URLSearchParams(location.search).get('player')) || 'https://tuzinho.academy/produtos/player/'
const PLAYER_ORIGIN = new URL(PLAYER_URL, location.href).origin
const DURACAO_PADRAO = 900

/** Cores prontas: escolher uma muda a barra de progresso e o botão de uma vez (dá para ajustar cada uma depois). */
const PALETA = [
  { nome: 'Laranja', cor: '#ff8a1f' },
  { nome: 'Verde', cor: '#22c55e' },
  { nome: 'Azul', cor: '#2563eb' },
  { nome: 'Vermelho', cor: '#ef4444' },
  { nome: 'Roxo', cor: '#8b5cf6' },
  { nome: 'Branco', cor: '#ffffff' },
]

type Painel = 'video' | 'cta' | 'fim' | 'estilo' | 'ritmo' | 'comportamento' | 'avancado'

/** Cada item vira um botão ao lado do vídeo; clicar abre as opções dele num painel (o vídeo continua à vista). */
const ITENS: { id: Painel; icone: string; nome: string; titulo: string }[] = [
  { id: 'video', icone: 'fa-film', nome: 'Vídeo', titulo: 'Qual VSL toca aqui' },
  { id: 'cta', icone: 'fa-cart-shopping', nome: 'Compra', titulo: 'Botão de compra' },
  { id: 'fim', icone: 'fa-flag-checkered', nome: 'Fim', titulo: 'Tela final' },
  { id: 'estilo', icone: 'fa-palette', nome: 'Cores', titulo: 'Cores e estilo' },
  { id: 'ritmo', icone: 'fa-gauge-high', nome: 'Barra', titulo: 'Ritmo da barra de progresso' },
  { id: 'comportamento', icone: 'fa-sliders', nome: 'Regras', titulo: 'Comportamento' },
  { id: 'avancado', icone: 'fa-code', nome: 'Avançado', titulo: 'Arquivos do vídeo e código para colar' },
]

/** VSLs prontas (arquivos na pasta de vídeos do servidor). Escolher uma troca HD e leve juntos. */
const VSLS_PRONTAS = [
  { id: 'v1', nome: 'VSL antiga · horizontal 16:9', hd: 'vsl-v1-720.mp4', leve: 'vsl-v1-480.mp4', ratio: '16 / 9' },
  { id: 'v2', nome: 'VSL nova · vertical 9:16 (23 min)', hd: 'vsl-v2-720.mp4', leve: 'vsl-v2-480.mp4', ratio: '9 / 16' },
]

function iframeCode(video: string, vertical = false): string {
  // padding-top em % conta sobre a largura do PAI: no vertical usamos aspect-ratio (com max-width no mesmo elemento)
  const caixa = vertical ? 'position:relative;max-width:340px;margin:0 auto;aspect-ratio:9/16;background:#000' : 'position:relative;padding-top:56.25%;background:#000'
  return [
    `<div style="${caixa}">`,
    `  <iframe src="${PLAYER_URL}?v=${video}"`,
    '    title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen',
    '    style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>',
    '</div>',
  ].join('\n')
}

function formatClock(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Texto escuro sobre cor clara, claro sobre cor escura. */
function textoSobre(cor: string): string {
  const n = parseInt(cor.slice(1), 16)
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luz > 0.6 ? '#15110d' : '#ffffff'
}

function Interruptor({ ligado, onChange, titulo, dica }: { ligado: boolean; onChange: (valor: boolean) => void; titulo: string; dica?: string }) {
  return (
    <div className="pc-row">
      <div className="min-w-0">
        <b className="block text-sm text-zinc-100">{titulo}</b>
        {dica && <span className="block text-xs text-zinc-500">{dica}</span>}
      </div>
      <button type="button" role="switch" aria-checked={ligado} aria-label={titulo} className="ac-sw" onClick={() => onChange(!ligado)} />
    </div>
  )
}

function Opcoes<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: { v: T; label: string }[]; onChange: (valor: T) => void; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo}>
      <span className="pc-label">{rotulo}</span>
      <div className="seg">
        {opcoes.map((opcao) => (
          <button key={opcao.v} type="button" className={`seg-btn ${valor === opcao.v ? 'seg-btn-active' : ''}`} aria-pressed={valor === opcao.v} onClick={() => onChange(opcao.v)}>
            {opcao.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Cor({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (cor: string) => void }) {
  return (
    <label className="pc-cor">
      <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} aria-label={rotulo} />
      <span>
        <b className="block text-sm text-zinc-100">{rotulo}</b>
        <span className="block text-xs uppercase text-zinc-500">{valor}</span>
      </span>
    </label>
  )
}

function Ajuste({ rotulo, unidade, min, max, passo, valor, onChange, dica }: { rotulo: string; unidade: string; min: number; max: number; passo: number; valor: number; onChange: (valor: number) => void; dica?: string }) {
  return (
    <label className="block">
      <span className="pc-label">
        {rotulo} <b className="text-zinc-100">{String(valor).replace('.', ',')}{unidade}</b>
      </span>
      <input type="range" className="pc-range" min={min} max={max} step={passo} value={Math.min(max, Math.max(min, valor))} aria-label={rotulo} onChange={(e) => onChange(Number(e.target.value))} />
      {dica && <span className="block text-xs text-zinc-500">{dica}</span>}
    </label>
  )
}

function Cartao({ id, titulo, destaque, visivel, children }: { id: string; titulo: string; destaque: boolean; visivel: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`pc-card ${destaque ? 'pc-card-destaque' : ''}`} aria-label={titulo} hidden={!visivel}>
      {children}
    </section>
  )
}

export function PlayerControl({ video, ratio = '16 / 9' }: { video: string; ratio?: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['player-config', video], queryFn: () => fetchPlayerConfig(video), retry: false })
  const estado = query.data
  const [form, setForm] = useState<PlayerConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
  const [pronto, setPronto] = useState(false)
  const [playerAntigo, setPlayerAntigo] = useState(false)
  const [duracao, setDuracao] = useState(DURACAO_PADRAO)
  const [destaque, setDestaque] = useState<'cta' | 'fim' | null>(null)
  const [aberto, setAberto] = useState<Painel | null>(null)
  const [copied, setCopied] = useState(false)
  const [previaKey, setPreviaKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // o formulário nasce do que está salvo; depois disso só o próprio usuário mexe nele
  useEffect(() => {
    if (estado) setForm(structuredClone(estado.config))
  }, [estado])

  const enviar = useCallback((mensagem: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(mensagem, PLAYER_ORIGIN)
  }, [])

  // a prévia mostra o formulário ao vivo (sem salvar): cada mudança vai para o player dentro do quadro
  useEffect(() => {
    if (pronto && form) enviar({ type: 'previa-config', config: form })
  }, [form, pronto, enviar])

  // o que o player conta de dentro da prévia: está pronto, o tamanho do vídeo e cliques no botão (abre aquele cartão)
  useEffect(() => {
    function aoReceber(evento: MessageEvent) {
      if (evento.origin !== PLAYER_ORIGIN || evento.source !== iframeRef.current?.contentWindow) return
      const msg = evento.data as { source?: string; event?: string; data?: { segundos?: number; alvo?: string; versao?: number } } | null
      if (!msg || msg.source !== 'tuzinho-player') return
      if (msg.event === 'ready') {
        // player publicado sem a prévia ao vivo: ele não entende as mensagens do painel
        const novo = (msg.data?.versao ?? 1) >= 2
        setPronto(novo)
        setPlayerAntigo(!novo)
      }
      if (msg.event === 'duracao' && msg.data?.segundos) setDuracao(msg.data.segundos)
      if (msg.event === 'editar' && (msg.data?.alvo === 'cta' || msg.data?.alvo === 'fim')) {
        const alvo = msg.data.alvo
        setAberto(alvo)
        setDestaque(alvo)
        window.setTimeout(() => setDestaque(null), 1600)
      }
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [])

  if (query.isLoading) return <section className="surface-card p-4"><div className="skeleton h-24 w-full" /></section>
  if (query.error) {
    return (
      <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
        {(query.error as Error).message}
      </section>
    )
  }
  if (!estado || !form) return null

  // a proporção segue o vídeo que está escolhido (não o lugar), para a prévia nunca ficar com barras pretas
  const vslEscolhida = VSLS_PRONTAS.find((v) => v.hd === form.arquivos.hd && v.leve === form.arquivos.leve)
  // o player só carrega o arquivo do que está SALVO (a prévia ao vivo não troca o vídeo), então o quadro segue o salvo
  const vslSalva = VSLS_PRONTAS.find((v) => v.hd === estado.config.arquivos.hd && v.leve === estado.config.arquivos.leve)
  const vertical = (vslSalva?.ratio ?? ratio) === '9 / 16'
  const videoMudou = form.arquivos.hd !== estado.config.arquivos.hd || form.arquivos.leve !== estado.config.arquivos.leve
  const alterado = JSON.stringify(form) !== JSON.stringify(estado.config)
  const maxSegundo = Math.max(60, duracao)

  function mudar(parcial: (atual: PlayerConfig) => PlayerConfig) {
    setForm((atual) => (atual ? parcial(structuredClone(atual)) : atual))
    setMessage(null)
  }

  function escolherPaleta(cor: string) {
    mudar((c) => ({ ...c, aparencia: { ...c.aparencia, corDestaque: cor, corBotao: cor, corTextoBotao: textoSobre(cor) } }))
  }

  function mudarRitmo(parcial: Partial<PlayerConfig['barraFalsa']>) {
    mudar((c) => ({ ...c, barraFalsa: { ...c.barraFalsa, ...parcial } }))
  }

  function mudarCor(campo: 'corDestaque' | 'corBotao' | 'corTextoBotao', cor: string) {
    mudar((c) => ({ ...c, aparencia: { ...c.aparencia, [campo]: cor } }))
  }

  async function salvar() {
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const novo: PlayerConfigState = await savePlayerConfig(video, form)
      queryClient.setQueryData(['player-config', video], novo)
      setForm(structuredClone(novo.config))
      setPreviaKey((k) => k + 1) // recarrega a prévia: só assim ela passa a tocar o arquivo salvo
      setMessage({ kind: 'ok', text: 'Salvo. Vale para quem abrir a página a partir de agora; quem já está assistindo termina com a versão antiga.' })
    } catch (erro) {
      setMessage({ kind: 'erro', text: (erro as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(iframeCode(video, vertical))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ kind: 'erro', text: 'Não consegui copiar. Selecione o código e copie com Ctrl+C.' })
    }
  }

  return (
    <section className="surface-card p-4" data-tour="Controle do player" data-tour-text="Monte o player: cores, botão de compra num minuto, o que acontece no fim. A prévia mostra tudo ao vivo; salvou, as páginas já usam.">
      <p className="section-label">Controle do player</p>
      <h3 className="section-title mt-1 mb-1">Como o vídeo se comporta nas páginas</h3>
      <p className="mb-4 text-xs text-zinc-500">
        {estado.salvo
          ? `Salvo${estado.atualizadoPor ? ` por ${estado.atualizadoPor}` : ''}${estado.atualizadoEm ? ` em ${new Date(estado.atualizadoEm).toLocaleString('pt-BR')}` : ''}.`
          : 'Nada salvo ainda: as páginas usam o padrão do player.'}
      </p>

      {estado.precisaMigracao && (
        <div className="migration-note mb-4" role="status">
          <i className="fa-solid fa-database" />
          <div>
            <b>Falta criar a tabela no banco.</b> Rode o bloco "Central de vídeos" de <code>db/schema.sql</code> no SQL Editor do
            Supabase. Até lá o player usa o padrão e este painel não consegue salvar.
          </div>
        </div>
      )}

      <div className={`pc-palco ${aberto ? 'pc-palco-aberto' : ''}`}>
        {/* ───── prévia ao vivo no centro: sempre à vista ───── */}
        <div className="pc-previa">
          <div
            className="relative overflow-hidden rounded-xl bg-black"
            style={vertical ? { aspectRatio: '9 / 16', maxWidth: 340, marginInline: 'auto' } : { paddingTop: '56.25%' }}
          >
            <iframe
              key={previaKey}
              ref={iframeRef}
              src={`${PLAYER_URL}?v=${video}&manual=1`}
              title="Prévia do player"
              allow="autoplay; fullscreen; picture-in-picture"
              className="absolute inset-0 h-full w-full border-0"
              onLoad={() => {
                setPronto(false)
                setPlayerAntigo(false)
              }}
            />
          </div>
          {playerAntigo && (
            <div className="migration-note mt-3" role="status">
              <i className="fa-solid fa-triangle-exclamation" />
              <div>
                <b>O player publicado ainda é a versão antiga.</b> A prévia ao vivo e os testes só funcionam depois de subir o conteúdo
                de <code>dist-player/</code> em <code>/produtos/player/</code> no Plesk. Pode salvar as opções agora: elas passam a valer
                quando o player novo for publicado.
              </div>
            </div>
          )}
          <div className="pc-testes">
            <button type="button" className="chip-btn" disabled={!pronto || !form.cta.ativo} onClick={() => enviar({ type: 'previa-cmd', cmd: 'testar-cta' })}>
              <i className="fa-solid fa-play" aria-hidden="true" /> Testar o botão de compra
            </button>
            <button type="button" className="chip-btn" disabled={!pronto || !form.fim.ativo} onClick={() => enviar({ type: 'previa-cmd', cmd: 'ver-fim' })}>
              <i className="fa-solid fa-flag-checkered" aria-hidden="true" /> Ver tela final
            </button>
            <button type="button" className="chip-btn" disabled={!pronto} onClick={() => enviar({ type: 'previa-cmd', cmd: 'reiniciar' })}>
              <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Recomeçar
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            A prévia muda ao vivo, sem salvar. Clique no botão de compra dentro dela para abrir as opções dele.
          </p>
        </div>

        {/* ───── botões ao lado do vídeo: cada um abre as opções de um assunto ───── */}
        <nav className="pc-rail" aria-label="Opções do player">
          {ITENS.map((item) => {
            const ligado = item.id === 'cta' ? form.cta.ativo : item.id === 'fim' ? form.fim.ativo : item.id === 'ritmo' ? form.barraFalsa.ativo : false
            return (
              <button
                key={item.id}
                type="button"
                className={`pc-rail-btn ${aberto === item.id ? 'pc-rail-btn-on' : ''}`}
                aria-pressed={aberto === item.id}
                title={item.titulo}
                onClick={() => setAberto((atual) => (atual === item.id ? null : item.id))}
              >
                <i className={`fa-solid ${item.icone}`} aria-hidden="true" />
                <span>{item.nome}</span>
                {ligado && <em className="pc-rail-ponto" aria-label="ligado" />}
              </button>
            )
          })}
        </nav>

        {/* ───── painel com as opções do botão escolhido ───── */}
        <aside className="pc-painel" hidden={!aberto} aria-label="Opções">
          <div className="pc-painel-cab">
            <b>{ITENS.find((item) => item.id === aberto)?.titulo}</b>
            <button type="button" className="pc-painel-x" aria-label="Fechar" onClick={() => setAberto(null)}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
          <div className="pc-cartoes">
          <Cartao id="pc-video" titulo="Qual VSL toca aqui" destaque={false} visivel={aberto === 'video'}>
            <b className="block text-sm text-zinc-100">Qual VSL toca neste lugar</b>
            <p className="mb-2 text-xs text-zinc-500">
              Vale para todas as páginas que usam o player “{video}”. Troca o arquivo HD e o leve juntos; o vídeo só muda na prévia e nas páginas depois de salvar.
            </p>
            <div className="pc-campos">
              {VSLS_PRONTAS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`chip-btn ${vslEscolhida?.id === v.id ? 'seg-btn-active' : ''}`}
                  aria-pressed={vslEscolhida?.id === v.id}
                  onClick={() => mudar((c) => ({ ...c, arquivos: { hd: v.hd, leve: v.leve } }))}
                >
                  {v.nome}
                </button>
              ))}
              {videoMudou && (
                <p className="text-xs text-amber-300">
                  Vídeo trocado, mas ainda não salvo: a prévia continua com o vídeo anterior. Clique em <b>Salvar</b> e ela recarrega com o novo.
                </p>
              )}
              {!vslEscolhida &&<p className="text-xs text-amber-300">Arquivos personalizados ({form.arquivos.hd}). Edite em “Avançado”.</p>}
            </div>
          </Cartao>

          <Cartao id="pc-cta" titulo="Botão de compra" destaque={destaque === 'cta'} visivel={aberto === 'cta'}>
            <Interruptor
              ligado={form.cta.ativo}
              onChange={(v) => {
                mudar((c) => ({ ...c, cta: { ...c.cta, ativo: v } }))
                if (v && pronto) window.setTimeout(() => enviar({ type: 'previa-cmd', cmd: 'ver-cta' }), 60)
              }}
              titulo="Botão de compra no vídeo"
              dica="Abre o mesmo fluxo de compra da página."
            />
            {form.cta.ativo && (
              <div className="pc-campos">
                <label className="block">
                  <span className="pc-label">Texto do botão</span>
                  <input className="filter-select w-full" maxLength={60} value={form.cta.texto} onChange={(e) => mudar((c) => ({ ...c, cta: { ...c.cta, texto: e.target.value } }))} />
                </label>
                <label className="block">
                  <span className="pc-label">
                    Aparece em <b className="text-zinc-100">{formatClock(form.cta.segundo)}</b>
                  </span>
                  <input
                    type="range"
                    className="pc-range"
                    min={0}
                    max={maxSegundo}
                    step={1}
                    value={Math.min(form.cta.segundo, maxSegundo)}
                    aria-label="Segundo em que o botão aparece"
                    onChange={(e) => mudar((c) => ({ ...c, cta: { ...c.cta, segundo: Number(e.target.value) } }))}
                  />
                </label>
                <Ajuste
                  rotulo="Fica na tela por"
                  unidade="s"
                  min={0}
                  max={300}
                  passo={5}
                  valor={form.cta.duracao}
                  onChange={(n) => mudar((c) => ({ ...c, cta: { ...c.cta, duracao: n } }))}
                  dica="0 = fica até o fim do vídeo. Acima de 0, o botão some depois desse tempo."
                />
                <Ajuste
                  rotulo="Volta a cada"
                  unidade="s"
                  min={0}
                  max={1800}
                  passo={30}
                  valor={form.cta.repetir}
                  onChange={(n) => mudar((c) => ({ ...c, cta: { ...c.cta, repetir: n } }))}
                  dica={
                    form.cta.repetir > 0
                      ? `Reaparece a cada ${formatClock(form.cta.repetir)} (começando em ${formatClock(form.cta.segundo)}).`
                      : '0 = não repete: aparece uma vez só.'
                  }
                />
                <Opcoes<PosicaoBotao>
                  rotulo="Posição"
                  valor={form.cta.posicao}
                  opcoes={[{ v: 'esquerda', label: 'Esquerda' }, { v: 'centro', label: 'Centro' }, { v: 'direita', label: 'Direita' }]}
                  onChange={(v) => mudar((c) => ({ ...c, cta: { ...c.cta, posicao: v } }))}
                />
                <Opcoes<VerticalBotao>
                  rotulo="Altura"
                  valor={form.cta.vertical}
                  opcoes={[{ v: 'topo', label: 'Em cima' }, { v: 'baixo', label: 'Embaixo' }]}
                  onChange={(v) => mudar((c) => ({ ...c, cta: { ...c.cta, vertical: v } }))}
                />
                <Opcoes<TamanhoBotao>
                  rotulo="Tamanho"
                  valor={form.cta.tamanho}
                  opcoes={[{ v: 'p', label: 'Pequeno' }, { v: 'm', label: 'Médio' }, { v: 'g', label: 'Grande' }]}
                  onChange={(v) => mudar((c) => ({ ...c, cta: { ...c.cta, tamanho: v } }))}
                />
                <Opcoes<AnimacaoBotao>
                  rotulo="Chamar atenção"
                  valor={form.cta.animacao}
                  opcoes={[{ v: 'nenhuma', label: 'Parado' }, { v: 'pulsar', label: 'Pulsar' }, { v: 'brilho', label: 'Brilho' }]}
                  onChange={(v) => mudar((c) => ({ ...c, cta: { ...c.cta, animacao: v } }))}
                />
              </div>
            )}
          </Cartao>

          <Cartao id="pc-fim" titulo="Tela final" destaque={destaque === 'fim'} visivel={aberto === 'fim'}>
            <Interruptor
              ligado={form.fim.ativo}
              onChange={(v) => {
                mudar((c) => ({ ...c, fim: { ...c.fim, ativo: v } }))
                if (v && pronto) window.setTimeout(() => enviar({ type: 'previa-cmd', cmd: 'ver-fim' }), 60)
              }}
              titulo="Tela quando o vídeo terminar"
              dica="Mensagem e botão de compra sobre o vídeo parado."
            />
            {form.fim.ativo && (
              <div className="pc-campos">
                <label className="block">
                  <span className="pc-label">Mensagem (opcional)</span>
                  <input className="filter-select w-full" maxLength={120} value={form.fim.titulo} onChange={(e) => mudar((c) => ({ ...c, fim: { ...c.fim, titulo: e.target.value } }))} />
                </label>
                <label className="block">
                  <span className="pc-label">Texto do botão</span>
                  <input className="filter-select w-full" maxLength={60} value={form.fim.texto} onChange={(e) => mudar((c) => ({ ...c, fim: { ...c.fim, texto: e.target.value } }))} />
                </label>
              </div>
            )}
          </Cartao>

          <Cartao id="pc-estilo" titulo="Cores e estilo" destaque={false} visivel={aberto === 'estilo'}>
            <b className="block text-sm text-zinc-100">Cores e estilo</b>
            <div className="pc-paleta" role="group" aria-label="Cores prontas">
              {PALETA.map((item) => (
                <button
                  key={item.cor}
                  type="button"
                  className={`pc-amostra ${form.aparencia.corDestaque === item.cor && form.aparencia.corBotao === item.cor ? 'pc-amostra-on' : ''}`}
                  style={{ background: item.cor }}
                  title={item.nome}
                  aria-label={`Usar ${item.nome}`}
                  onClick={() => escolherPaleta(item.cor)}
                />
              ))}
            </div>
            <div className="pc-cores">
              <Cor rotulo="Barra de progresso" valor={form.aparencia.corDestaque} onChange={(c) => mudarCor('corDestaque', c)} />
              <Cor rotulo="Botão de compra" valor={form.aparencia.corBotao} onChange={(c) => mudarCor('corBotao', c)} />
              <Cor rotulo="Texto do botão" valor={form.aparencia.corTextoBotao} onChange={(c) => mudarCor('corTextoBotao', c)} />
            </div>
            <div className="pc-campos">
              <Opcoes<FormaBotao>
                rotulo="Forma do botão"
                valor={form.aparencia.formaBotao}
                opcoes={[{ v: 'reto', label: 'Reto' }, { v: 'suave', label: 'Arredondado' }, { v: 'pilula', label: 'Pílula' }]}
                onChange={(v) => mudar((c) => ({ ...c, aparencia: { ...c.aparencia, formaBotao: v } }))}
              />
              <Interruptor ligado={form.controles.tempo} onChange={(v) => mudar((c) => ({ ...c, controles: { ...c.controles, tempo: v } }))} titulo="Mostrar o tempo na barra" />
              <Interruptor ligado={form.controles.volume} onChange={(v) => mudar((c) => ({ ...c, controles: { ...c.controles, volume: v } }))} titulo="Mostrar o botão de som" />
            </div>
          </Cartao>

          <Cartao id="pc-ritmo" titulo="Ritmo da barra de progresso" destaque={false} visivel={aberto === 'ritmo'}>
            <Interruptor
              ligado={form.barraFalsa.ativo}
              onChange={(v) => mudar((c) => ({ ...c, barraFalsa: { ...c.barraFalsa, ativo: v } }))}
              titulo="Barra de progresso com ritmo"
              dica="A barra anda mais rápido ou mais devagar que o vídeo, para ele parecer mais curto. Só muda o desenho da barra; o vídeo e as métricas continuam reais. O relógio some enquanto estiver ligada."
            />
            {form.barraFalsa.ativo && (
              <div className="pc-campos">
                <Ajuste rotulo="Arrancada: primeiros" unidade="s" min={0} max={60} passo={1} valor={form.barraFalsa.inicioSegundos} onChange={(n) => mudarRitmo({ inicioSegundos: n })} />
                <Ajuste rotulo="Velocidade da arrancada" unidade="x" min={1} max={30} passo={1} valor={form.barraFalsa.inicioVelocidade} onChange={(n) => mudarRitmo({ inicioVelocidade: n })} />
                <Ajuste rotulo="Cada trecho dura" unidade="s" min={0} max={120} passo={5} valor={form.barraFalsa.trechoSegundos} onChange={(n) => mudarRitmo({ trechoSegundos: n })} dica="0 = sem alternar (depois da arrancada anda normal)." />
                <Ajuste rotulo="Trechos lentos" unidade="x" min={0.2} max={3} passo={0.1} valor={form.barraFalsa.lento} onChange={(n) => mudarRitmo({ lento: n })} />
                <Ajuste rotulo="Trechos rápidos" unidade="x" min={1} max={10} passo={0.5} valor={form.barraFalsa.rapido} onChange={(n) => mudarRitmo({ rapido: n })} />
                <p className="text-xs text-zinc-500">
                  Depois da arrancada a barra alterna entre lento e rápido. Não importa o ritmo: ela sempre chega a 100% junto com o fim do
                  vídeo. Teste na prévia ao lado.
                </p>
              </div>
            )}
          </Cartao>

          <Cartao id="pc-comportamento" titulo="Comportamento" destaque={false} visivel={aberto === 'comportamento'}>
            <Interruptor
              ligado={form.permitirAvancar}
              onChange={(v) => mudar((c) => ({ ...c, permitirAvancar: v }))}
              titulo="Permitir pular para a frente"
              dica="Desligado, a pessoa só volta ou continua de onde já assistiu."
            />
            <Interruptor
              ligado={form.lembrarPosicao}
              onChange={(v) => mudar((c) => ({ ...c, lembrarPosicao: v }))}
              titulo="Continuar de onde a pessoa parou"
              dica="Quem sai da página e volta retoma no mesmo ponto (guardado só no navegador dela). Se o vídeo terminou, recomeça do zero."
            />
            <Interruptor
              ligado={form.protegerVideo}
              onChange={(v) => mudar((c) => ({ ...c, protegerVideo: v }))}
              titulo="Esconder “Salvar vídeo” no botão direito"
              dica="Tira do menu do navegador salvar vídeo/frame e copiar o endereço. Impede o baixar casual, mas não é à prova de quem usa extensão de download."
            />
            <label className="mt-3 block">
              <span className="pc-label">Texto de “toque para assistir”</span>
              <input className="filter-select w-full" maxLength={40} value={form.textoToque} onChange={(e) => mudar((c) => ({ ...c, textoToque: e.target.value }))} />
            </label>
          </Cartao>

          <details className="pc-card pc-avancado" hidden={aberto !== 'avancado'}>
            <summary>Avançado: arquivos do vídeo e código para colar</summary>
            <div className="pc-campos mt-3">
              <label className="block">
                <span className="pc-label">Arquivo HD (computador)</span>
                <input className="filter-select w-full" value={form.arquivos.hd} onChange={(e) => mudar((c) => ({ ...c, arquivos: { ...c.arquivos, hd: e.target.value } }))} />
              </label>
              <label className="block">
                <span className="pc-label">Arquivo leve (celular e conexão fraca)</span>
                <input className="filter-select w-full" value={form.arquivos.leve} onChange={(e) => mudar((c) => ({ ...c, arquivos: { ...c.arquivos, leve: e.target.value } }))} />
              </label>
              <p className="text-xs text-zinc-500">Nome do .mp4 na pasta de vídeos do servidor.</p>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="pc-label">Código para colar em uma página</span>
                  <button type="button" className="chip-btn" onClick={() => void copiar()}>
                    {copied ? 'Copiado!' : 'Copiar código'}
                  </button>
                </div>
                <textarea readOnly rows={5} className="filter-select w-full font-mono text-xs" value={iframeCode(video, vertical)} onFocus={(e) => e.currentTarget.select()} />
                <p className="mt-1 text-xs text-zinc-500">
                  Essentials, Membros e Live já usam o player. Em uma página nova, esse código mostra o vídeo com as opções acima; para
                  também medir o vídeo e abrir o checkout, a página precisa da ponte <code>vsl-embed.js</code> do projeto produtos.
                </p>
              </div>
            </div>
          </details>
          </div>
        </aside>
      </div>

      {/* ───── barra de salvar sempre à vista ───── */}
      <div className="pc-salvar">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-gold disabled:opacity-60" disabled={saving || !alterado || estado.precisaMigracao} onClick={() => void salvar()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            className="chip-btn"
            disabled={saving}
            onClick={async () => {
              const ok = await confirmar({
                titulo: 'Voltar todas as opções do player ao padrão?',
                texto: 'Só vale depois de salvar.',
                confirmar: 'Restaurar padrão',
              })
              if (ok) mudar(() => structuredClone(estado.padrao))
            }}
          >
            Restaurar padrão
          </button>
          {alterado && !message && <span className="text-xs text-amber-300">Mudanças ainda não salvas.</span>}
        </div>
        {message && (
          <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role={message.kind === 'erro' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
