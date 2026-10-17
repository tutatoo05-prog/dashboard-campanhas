import { useEffect, useMemo, useRef, useState } from 'react'
import type { RegistroTab } from '@/types'
import { formatNumber } from '@/lib/format.ts'

const CORES = ['var(--o)', 'var(--t)', 'var(--y)', 'var(--r)', '#7b5ea7', '#4f8a3c']

type Ordem = 'maior' | 'original'

interface Props {
  sheets: [string, RegistroTab[]][]
  selectedTab: string
  tabKey: (tab: { planilha: string; aba: string }) => string
  onSelect: (key: string) => void
  totalRecords: number
}

/** Número que "sobe" até o valor final (some quando a pessoa prefere menos movimento). */
function useContagem(alvo: number): number {
  const [valor, setValor] = useState(alvo)
  const anterior = useRef(0)
  useEffect(() => {
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduzido) {
      setValor(alvo)
      return undefined
    }
    const inicio = anterior.current
    const t0 = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - t0) / 700)
      const suave = 1 - Math.pow(1 - p, 3)
      setValor(Math.round(inicio + (alvo - inicio) * suave))
      if (p < 1) quadro = requestAnimationFrame(passo)
      else anterior.current = alvo
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo])
  return valor
}

function porcento(parte: number, total: number): string {
  if (!total) return '0%'
  const valor = (parte / total) * 100
  return `${valor >= 10 ? Math.round(valor) : valor.toFixed(1).replace('.', ',')}%`
}

export function RegistrosMapa({ sheets, selectedTab, tabKey, onSelect, totalRecords }: Props) {
  const [ordem, setOrdem] = useState<Ordem>('maior')
  const [foco, setFoco] = useState('')
  const contagem = useContagem(totalRecords)

  const planilhas = useMemo(() => {
    const lista = sheets.map(([nome, abas], indice) => {
      const total = abas.reduce((soma, aba) => soma + (aba.count ?? 0), 0)
      const ordenadas = ordem === 'maior' ? [...abas].sort((a, b) => (b.count ?? -1) - (a.count ?? -1)) : abas
      return { nome, abas: ordenadas, total, cor: CORES[indice % CORES.length] }
    })
    return ordem === 'maior' ? [...lista].sort((a, b) => b.total - a.total) : lista
  }, [sheets, ordem])

  const somaPlanilhas = planilhas.reduce((soma, planilha) => soma + planilha.total, 0)
  const visiveis = foco ? planilhas.filter((planilha) => planilha.nome === foco) : planilhas
  const abaSelecionada = planilhas.flatMap((planilha) => planilha.abas.map((aba) => ({ aba, planilha }))).find(({ aba }) => tabKey(aba) === selectedTab)

  return (
    <div className="mapa">
      <div className="mapa-topo">
        <div>
          <p className="section-label">Por planilha e aba</p>
          <h3 className="section-title mt-1 mb-1">Quantos registros em cada lugar</h3>
          <p className="mapa-dica">
            <i className="fa-solid fa-hand-pointer" /> Toque numa aba para filtrar tudo abaixo. Toque de novo para desfazer.
          </p>
        </div>
        <div className="mapa-total" aria-label={`${formatNumber(totalRecords)} registros no total`}>
          <span className="mapa-total-num">{formatNumber(contagem)}</span>
          <span className="mapa-total-txt">registros no total</span>
        </div>
      </div>

      <div className="mapa-faixa-wrap">
        <div className="mapa-faixa" role="group" aria-label="Proporção de registros por planilha">
          {planilhas.map((planilha, indice) => (
            <button
              key={planilha.nome}
              type="button"
              onClick={() => setFoco((atual) => (atual === planilha.nome ? '' : planilha.nome))}
              title={`${planilha.nome}: ${formatNumber(planilha.total)} (${porcento(planilha.total, somaPlanilhas)})`}
              className={`mapa-seg ${foco && foco !== planilha.nome ? 'mapa-seg-apagado' : ''} ${foco === planilha.nome ? 'mapa-seg-ativo' : ''}`}
              style={{ flexGrow: Math.max(planilha.total, 1), background: planilha.cor, animationDelay: `${indice * 70}ms` }}
            >
              <span className="mapa-seg-txt">{porcento(planilha.total, somaPlanilhas)}</span>
            </button>
          ))}
        </div>
        <div className="mapa-legenda">
          {planilhas.map((planilha) => (
            <button
              key={planilha.nome}
              type="button"
              onClick={() => setFoco((atual) => (atual === planilha.nome ? '' : planilha.nome))}
              className={`mapa-chip ${foco === planilha.nome ? 'mapa-chip-ativo' : ''}`}
            >
              <i className="mapa-bolinha" style={{ background: planilha.cor }} />
              {planilha.nome}
            </button>
          ))}
          {foco && (
            <button type="button" onClick={() => setFoco('')} className="mapa-chip mapa-chip-limpar">
              <i className="fa-solid fa-xmark" /> ver todas
            </button>
          )}
          <span className="mapa-ordem" role="group" aria-label="Ordenar">
            <button type="button" onClick={() => setOrdem('maior')} className={ordem === 'maior' ? 'mapa-ordem-ativa' : ''}>
              <i className="fa-solid fa-arrow-down-wide-short" /> Maiores primeiro
            </button>
            <button type="button" onClick={() => setOrdem('original')} className={ordem === 'original' ? 'mapa-ordem-ativa' : ''}>
              <i className="fa-solid fa-list" /> Ordem das planilhas
            </button>
          </span>
        </div>
      </div>

      <div className="mapa-grade">
        {visiveis.map((planilha, indicePlanilha) => {
          const maior = Math.max(...planilha.abas.map((aba) => aba.count ?? 0), 1)
          return (
            <section key={planilha.nome} className="mapa-planilha" style={{ ['--cor' as string]: planilha.cor, animationDelay: `${indicePlanilha * 80}ms` }}>
              <header className="mapa-planilha-topo">
                <p className="mapa-planilha-nome" title={planilha.nome}>
                  {planilha.nome}
                </p>
                <p className="mapa-planilha-num">
                  <b>{formatNumber(planilha.total)}</b>
                  <span>{porcento(planilha.total, somaPlanilhas)} do total</span>
                </p>
              </header>
              <div className="mapa-abas">
                {planilha.abas.map((aba, indiceAba) => {
                  const chave = tabKey(aba)
                  const ativa = selectedTab === chave
                  const quantidade = aba.count ?? 0
                  return (
                    <div key={chave} className="mapa-linha">
                      <button
                        type="button"
                        onClick={() => onSelect(chave)}
                        aria-pressed={ativa}
                        className={`mapa-aba ${ativa ? 'mapa-aba-ativa' : ''} ${selectedTab && !ativa ? 'mapa-aba-apagada' : ''}`}
                      >
                        <span
                          className="mapa-aba-barra"
                          style={{ ['--larg' as string]: `${(quantidade / maior) * 100}%`, animationDelay: `${indicePlanilha * 80 + indiceAba * 45}ms` }}
                        />
                        <span className="mapa-aba-conteudo">
                          <span className="mapa-aba-esq">
                            <span className="mapa-aba-check" aria-hidden="true">
                              <i className="fa-solid fa-check" />
                            </span>
                            <span className="mapa-aba-nome">{aba.aba}</span>
                            {aba.tipo === 'evento' && <span className="mapa-tag mapa-tag-hotmart">hotmart</span>}
                            {aba.tipo === 'comprador' && <span className="mapa-tag mapa-tag-compra">compradores</span>}
                          </span>
                          <span className="mapa-aba-dir">
                            <span className="mapa-aba-pct">{aba.count === null ? '' : porcento(quantidade, planilha.total)}</span>
                            <b>{aba.count === null ? 'erro' : formatNumber(quantidade)}</b>
                          </span>
                        </span>
                      </button>
                      <a href={aba.url} target="_blank" rel="noreferrer" title="Abrir a aba no Google Sheets" className="mapa-externo">
                        <i className="fa-solid fa-arrow-up-right-from-square" />
                      </a>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {abaSelecionada && (
        <p className="mapa-rodape">
          <i className="fa-solid fa-circle-check" /> Filtro ativo: <b>{abaSelecionada.planilha.nome} · {abaSelecionada.aba.aba}</b>
        </p>
      )}
    </div>
  )
}
