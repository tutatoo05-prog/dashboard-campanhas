import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchRetencao, fetchRetencaoDiff, saveVersaoNotas, type RetencaoVersao } from '@/services/videoService.ts'
import { formatNumber } from '@/lib/format.ts'

const CORES = ['#ff8a1f', '#5ab0ff', '#7ddc8a', '#d98bff']
const GRID = 'var(--chart-grid)'
const AXIS = 'var(--muted)'
const TOOLTIP_STYLE = { background: 'var(--card)', border: '3px solid var(--line)', borderRadius: 10, boxShadow: '3px 3px 0 var(--shade)', color: 'var(--ink)', fontSize: 12 }
const VERSAO_VALIDA = /^[A-Za-z0-9][\w.-]{0,19}$/

/** Nome de cada VSL para a tela (o id é o `?v=` do player). Só estas duas estão em uso; a vertical fica fora da lista de cadastro. */
const NOMES_VIDEO: Record<string, string> = { vsl: 'Essentials', 'vsl-mentoria': 'Live e Membros', 'vsl-vertical': 'Vertical' }
const VIDEOS_CADASTRAVEIS = ['vsl', 'vsl-mentoria']
const nomeDoVideo = (id: string) => NOMES_VIDEO[id] ?? id

const chaveDe = (v: { video: string; versao: string }) => `${v.video}:${v.versao}`
const rotuloDe = (v: { video: string; versao: string }) => `${nomeDoVideo(v.video)} · ${v.versao}`

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

/**
 * Curva de retenção segundo a segundo. Cada versão (Essentials v1, Live e Membros v3, v1.1...) vira uma linha no MESMO
 * gráfico, para comparar onde a queda melhorou ou piorou, mesmo entre vídeos diferentes.
 */
export function RetencaoSegundos() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['videos-retencao'], queryFn: () => fetchRetencao(), retry: false })
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null)
  const [picos, setPicos] = useState(false)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [novaVersao, setNovaVersao] = useState('')
  const [novoVideo, setNovoVideo] = useState(VIDEOS_CADASTRAVEIS[0])
  // texto da comparação quando o navegador não deixa copiar sozinho (permissão negada, página sem HTTPS)
  const [textoDiff, setTextoDiff] = useState('')

  const versoes = query.data?.versoes
  // anotação em edição (ainda não salva) ou a salva; Object.hasOwn porque uma versão chamada "constructor" não pode achar o do objeto
  const textoDe = (v: RetencaoVersao) => (Object.hasOwn(notas, chaveDe(v)) ? notas[chaveDe(v)] : v.notas)
  const comDados = useMemo(() => (versoes ?? []).filter((v) => v.curva.pontos.length > 0), [versoes])
  // Padrão: a versão mais recente de cada vídeo (assim a v1 da Essentials e a v3 da Live já aparecem juntas).
  const selecionadas = useMemo(() => {
    const padrao: string[] = []
    const vistos = new Set<string>()
    for (const v of [...comDados].reverse()) {
      if (vistos.has(v.video)) continue
      vistos.add(v.video)
      padrao.unshift(chaveDe(v))
    }
    return (escolhidas ?? padrao).filter((chave) => comDados.some((v) => chaveDe(v) === chave)).slice(0, 4)
  }, [escolhidas, comDados])

  // Cada linha tem uma chave simples (l0, l1...): as chaves reais têm ponto (v1.1) e o gráfico as leria como caminho.
  const linhas = useMemo(() => comDados.map((v, i) => ({ v, chave: chaveDe(v), dado: `l${i}`, cor: CORES[i % CORES.length] })), [comDados])
  const dados = useMemo(() => {
    const ativas = linhas.filter((l) => selecionadas.includes(l.chave))
    const maior = Math.max(0, ...ativas.map((l) => l.v.curva.duracao))
    return Array.from({ length: maior + 1 }, (_, s) => {
      const ponto: Record<string, number | null> = { s }
      for (const l of ativas) {
        const p = l.v.curva.pontos[s]
        ponto[l.dado] = p ? (picos ? p.retencao : p.unica) : null
      }
      return ponto
    })
  }, [linhas, selecionadas, picos])

  if (query.isLoading) return <section className="surface-card p-4"><div className="skeleton h-40 w-full" /></section>
  if (query.error) {
    return (
      <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
        {(query.error as Error).message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : (query.error as Error).message}
      </section>
    )
  }

  function alternar(chave: string) {
    setEscolhidas(selecionadas.includes(chave) ? selecionadas.filter((c) => c !== chave) : [...selecionadas, chave].slice(-4))
  }

  async function salvarNotas(v: RetencaoVersao) {
    setOcupado(true)
    setAviso(null)
    try {
      const novo = await saveVersaoNotas(v.video, v.versao, textoDe(v))
      queryClient.setQueryData(['videos-retencao'], novo)
      setNotas((atual) => {
        const { [chaveDe(v)]: _descartada, ...resto } = atual
        return resto
      })
      setAviso({ tipo: 'ok', texto: `Anotação da ${rotuloDe(v)} salva.` })
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  async function cadastrarVersao() {
    const nome = novaVersao.trim()
    if (!VERSAO_VALIDA.test(nome)) {
      setAviso({ tipo: 'erro', texto: 'Use letras, números, ponto e hífen (até 20 caracteres), começando por letra ou número. Ex.: v1.1' })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      const novo = await saveVersaoNotas(novoVideo, nome, '')
      queryClient.setQueryData(['videos-retencao'], novo)
      setNovaVersao('')
      setAviso({ tipo: 'ok', texto: `Versão ${nome} cadastrada em ${nomeDoVideo(novoVideo)}. O player já pode enviar dados com esse rótulo.` })
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  async function copiarDiff() {
    if (selecionadas.length !== 2) return
    const [a, b] = selecionadas.map((chave) => comDados.find((v) => chaveDe(v) === chave))
    if (!a || !b) return
    setOcupado(true)
    setAviso(null)
    setTextoDiff('')
    let markdown = ''
    try {
      markdown = await fetchRetencaoDiff(a, b)
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message || 'Não consegui montar a comparação.' })
      setOcupado(false)
      return
    }
    try {
      await navigator.clipboard.writeText(markdown)
      setAviso({ tipo: 'ok', texto: 'Comparação copiada. É só colar na IA.' })
    } catch {
      // o navegador negou o clipboard: mostra o texto para copiar à mão
      setTextoDiff(markdown)
      setAviso({ tipo: 'erro', texto: 'O navegador não deixou copiar sozinho. O texto está logo abaixo: selecione tudo e copie.' })
    } finally {
      setOcupado(false)
    }
  }

  const rotuloSelecionadas = selecionadas
    .map((chave) => comDados.find((v) => chaveDe(v) === chave))
    .filter((v): v is RetencaoVersao => Boolean(v))
    .map(rotuloDe)

  return (
    <section className="surface-card p-4" data-tour="Retenção por segundo" data-tour-text="A linha mostra, segundo a segundo, quantos % das pessoas ainda estão assistindo. Todas as versões e vídeos ficam no mesmo gráfico para comparar.">
      <p className="section-label">Retenção por segundo</p>
      <h3 className="section-title mt-1 mb-3">Onde exatamente as pessoas saem</h3>

      {query.data?.precisaMigracao && (
        <p className="text-sm text-amber-300">Falta criar as tabelas video_retencao e video_versoes no banco (bloco no fim de db/schema.sql, rode no SQL Editor do Supabase).</p>
      )}

      {!query.data?.precisaMigracao && comDados.length === 0 && (
        <p className="text-sm text-zinc-400">
          Ainda sem dados por segundo. O player só grava em versões cadastradas aqui (a v1 já vale): cadastre a versão abaixo e, quando o player enviar os segundos assistidos, a curva aparece.
        </p>
      )}

      {comDados.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {linhas.map((l) => {
              const ativa = selecionadas.includes(l.chave)
              return (
                <button key={l.chave} type="button" className={`chip-btn ${ativa ? 'seg-btn-active' : ''}`} aria-pressed={ativa} onClick={() => alternar(l.chave)}>
                  <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.cor }} aria-hidden="true" /> {rotuloDe(l.v)} · {formatNumber(l.v.curva.base)} {l.v.curva.base === 1 ? 'pessoa' : 'pessoas'}
                </button>
              )
            })}
            <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={picos} onChange={(e) => setPicos(e.target.checked)} /> Mostrar picos de replay
            </label>
          </div>

          <div className="mt-3" style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={dados} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="s" tickFormatter={(s: number) => mmss(s)} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} minTickGap={32} />
                <YAxis unit="%" stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} width={44} domain={[0, (max: number) => Math.max(100, Math.ceil(max))]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(s) => `Segundo ${mmss(Number(s))}`} formatter={(valor, nome) => [`${Number(valor).toFixed(1).replace('.', ',')}%`, String(nome)]} />
                {linhas.map((l) => selecionadas.includes(l.chave) && (
                  <Line key={l.chave} name={rotuloDe(l.v)} type="monotone" dataKey={l.dado} stroke={l.cor} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            100% = quem passou dos primeiros segundos. {picos ? 'Com os picos ligados, a linha passa de onde as pessoas voltaram o vídeo para rever.' : 'A linha só desce: cada pessoa conta uma vez.'}
          </p>
        </>
      )}

      {!query.data?.precisaMigracao && (
        <>
          <div className="mt-4 space-y-3">
            <p className="section-label">Versões do vídeo e o que mudou em cada uma</p>
            {(versoes ?? []).map((v) => (
              <div key={chaveDe(v)} className="flex flex-wrap items-start gap-2">
                <span className="w-44 pt-2 text-sm font-semibold text-zinc-100">{rotuloDe(v)}</span>
                <textarea
                  className="filter-select min-w-0 flex-1"
                  rows={2}
                  maxLength={2000}
                  placeholder="Ex.: cortei 12 s no 1:15 e troquei o gancho"
                  value={textoDe(v)}
                  onChange={(e) => setNotas((atual) => ({ ...atual, [chaveDe(v)]: e.target.value }))}
                  aria-label={`O que mudou na ${rotuloDe(v)}`}
                />
                <button type="button" className="chip-btn" disabled={ocupado || textoDe(v) === v.notas} onClick={() => salvarNotas(v)}>Salvar</button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="filter-select" value={novoVideo} onChange={(e) => setNovoVideo(e.target.value)} aria-label="Vídeo da nova versão">
              {VIDEOS_CADASTRAVEIS.map((id) => <option key={id} value={id}>{nomeDoVideo(id)}</option>)}
            </select>
            <input
              className="filter-select w-40"
              placeholder="Nova versão (ex.: v1.1)"
              maxLength={20}
              value={novaVersao}
              onChange={(e) => setNovaVersao(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void cadastrarVersao() }}
              aria-label="Nome da nova versão"
            />
            <button type="button" className="chip-btn" disabled={ocupado || !novaVersao.trim()} onClick={cadastrarVersao}>Cadastrar versão</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="chip-btn" disabled={ocupado || selecionadas.length !== 2} onClick={copiarDiff}>
              Copiar comparação para a IA
            </button>
            <span className="text-xs text-zinc-500">{selecionadas.length === 2 ? rotuloSelecionadas.join(' → ') : 'Escolha exatamente 2 versões acima.'}</span>
            {aviso && <span className={`text-xs ${aviso.tipo === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">{aviso.texto}</span>}
          </div>
          {textoDiff && (
            <textarea
              readOnly
              rows={10}
              className="filter-select mt-3 w-full font-mono text-xs"
              value={textoDiff}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Comparação das versões, para copiar"
            />
          )}
        </>
      )}
    </section>
  )
}
