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

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

/** Curva de retenção segundo a segundo. Cada versão do vídeo (v1, v1.1...) vira uma linha para comparar onde a queda melhorou. */
export function RetencaoSegundos({ video }: { video: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['videos-retencao', video], queryFn: () => fetchRetencao(video), retry: false })
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null)
  const [picos, setPicos] = useState(false)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [novaVersao, setNovaVersao] = useState('')
  // texto da comparação quando o navegador não deixa copiar sozinho (permissão negada, página sem HTTPS)
  const [textoDiff, setTextoDiff] = useState('')

  const versoes = query.data?.versoes
  // anotação em edição (ainda não salva) ou a salva; Object.hasOwn porque uma versão chamada "constructor" não pode achar o do objeto
  const textoDe = (v: RetencaoVersao) => (Object.hasOwn(notas, v.versao) ? notas[v.versao] : v.notas)
  const comDados = useMemo(() => (versoes ?? []).filter((v) => v.curva.pontos.length > 0), [versoes])
  const selecionadas = useMemo(
    () => (escolhidas ?? comDados.slice(-2).map((v) => v.versao)).filter((nome) => comDados.some((v) => v.versao === nome)),
    [escolhidas, comDados],
  )

  const dados = useMemo(() => {
    const ativas = comDados.filter((v) => selecionadas.includes(v.versao))
    const maior = Math.max(0, ...ativas.map((v) => v.curva.duracao))
    return Array.from({ length: maior + 1 }, (_, s) => {
      const linha: Record<string, number | null> = { s }
      for (const v of ativas) {
        const ponto = v.curva.pontos[s]
        linha[v.versao] = ponto ? (picos ? ponto.retencao : ponto.unica) : null
      }
      return linha
    })
  }, [comDados, selecionadas, picos])

  if (query.isLoading) return <section className="surface-card p-4"><div className="skeleton h-40 w-full" /></section>
  if (query.error) {
    return (
      <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
        {(query.error as Error).message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : (query.error as Error).message}
      </section>
    )
  }

  function alternar(nome: string) {
    setEscolhidas(selecionadas.includes(nome) ? selecionadas.filter((n) => n !== nome) : [...selecionadas, nome].slice(-4))
  }

  async function salvarNotas(v: RetencaoVersao) {
    setOcupado(true)
    setAviso(null)
    try {
      const novo = await saveVersaoNotas(video, v.versao, textoDe(v))
      queryClient.setQueryData(['videos-retencao', video], novo)
      setNotas((atual) => {
        const { [v.versao]: _descartada, ...resto } = atual
        return resto
      })
      setAviso({ tipo: 'ok', texto: `Anotação da ${v.versao} salva.` })
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
      const novo = await saveVersaoNotas(video, nome, '')
      queryClient.setQueryData(['videos-retencao', video], novo)
      setNovaVersao('')
      setAviso({ tipo: 'ok', texto: `Versão ${nome} cadastrada. O player já pode enviar dados com esse rótulo.` })
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  async function copiarDiff() {
    if (selecionadas.length !== 2) return
    setOcupado(true)
    setAviso(null)
    setTextoDiff('')
    let markdown = ''
    try {
      markdown = await fetchRetencaoDiff(video, selecionadas[0], selecionadas[1])
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

  return (
    <section className="surface-card p-4" data-tour="Retenção por segundo" data-tour-text="A linha mostra, segundo a segundo, quantos % das pessoas ainda estão assistindo. Compare versões do vídeo para ver se um corte melhorou a retenção.">
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
            {comDados.map((v, i) => {
              const ativa = selecionadas.includes(v.versao)
              return (
                <button key={v.versao} type="button" className={`chip-btn ${ativa ? 'seg-btn-active' : ''}`} aria-pressed={ativa} onClick={() => alternar(v.versao)}>
                  <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES[i % CORES.length] }} aria-hidden="true" /> {v.versao} · {formatNumber(v.curva.base)} pessoas
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
                {comDados.map((v, i) => selecionadas.includes(v.versao) && (
                  <Line key={v.versao} type="monotone" dataKey={v.versao} stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
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
              <div key={v.versao} className="flex flex-wrap items-start gap-2">
                <span className="w-16 pt-2 text-sm font-semibold text-zinc-100">{v.versao}</span>
                <textarea
                  className="filter-select min-w-0 flex-1"
                  rows={2}
                  maxLength={2000}
                  placeholder="Ex.: cortei 12 s no 1:15 e troquei o gancho"
                  value={textoDe(v)}
                  onChange={(e) => setNotas((atual) => ({ ...atual, [v.versao]: e.target.value }))}
                  aria-label={`O que mudou na ${v.versao}`}
                />
                <button type="button" className="chip-btn" disabled={ocupado || textoDe(v) === v.notas} onClick={() => salvarNotas(v)}>Salvar</button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <span className="text-xs text-zinc-500">{selecionadas.length === 2 ? `${selecionadas[0]} → ${selecionadas[1]}` : 'Escolha exatamente 2 versões acima.'}</span>
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
