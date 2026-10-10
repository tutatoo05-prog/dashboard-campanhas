import type { ActionResult } from '@/lib/actionResults.ts'
import { formatCurrency, formatDecimal } from '@/lib/format.ts'

/** "O que aconteceu depois": o CPL de agora contra o da hora em que a ação foi marcada como feita. */
export function ResultsSection({ results }: { results: ActionResult[] }) {
  if (!results.length) return null

  return (
    <section className="space-y-3" aria-label="Resultado das ações feitas">
      <div>
        <p className="section-label">Resolvidas</p>
        <h3 className="section-title mt-1">O que mudou depois de você agir</h3>
        <p className="small-note mt-1">Compara o custo por lead de hoje (últimos 7 dias) com o de quando você marcou como feito.</p>
      </div>

      {results.map((result) => (
        <article key={result.key} className={`result-card result-${result.tone}`}>
          <div className="result-icon">
            <i className={`fa-solid ${result.tone === 'good' ? 'fa-arrow-trend-down' : result.tone === 'bad' ? 'fa-arrow-trend-up' : 'fa-minus'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="action-title">{result.title}</h4>
            <p className="result-line">
              {result.tone === 'good' && (
                <>
                  O custo por lead <b>caiu {formatDecimal(Math.abs(result.changePct), 0)}%</b>
                </>
              )}
              {result.tone === 'bad' && (
                <>
                  O custo por lead <b>subiu {formatDecimal(result.changePct, 0)}%</b>, vale revisar
                </>
              )}
              {result.tone === 'flat' && <>O custo por lead ficou <b>estável</b></>}{' '}
              ({formatCurrency(result.beforeCpl)} → {formatCurrency(result.nowCpl)}) há {result.daysAgo} dias.
              {result.savings != null && (
                <>
                  {' '}
                  Economia estimada: <b>~{formatCurrency(result.savings).replace(',00', '')}/semana</b>.
                </>
              )}
            </p>
          </div>
        </article>
      ))}
    </section>
  )
}
