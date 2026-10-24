import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRegistros } from '@/services/registrosService.ts'
import { fetchPurchases } from '@/services/purchaseService.ts'
import { acharPessoa, pessoaSemHistorico, pessoasDeRegistros } from '@/lib/mergeRegistros.ts'
import { RegistroModal } from '@/components/registros/RegistroModal.tsx'

interface PessoaModalProps {
  nome?: string | null
  email?: string | null
  telefone?: string | null
  onClose: () => void
  closeLabel?: string
}

/**
 * Linha do tempo de uma pessoa, aberta de qualquer tela (Leads, Compras, Acessos...).
 * Procura por e-mail ou telefone em todas as planilhas e eventos da Hotmart (a mesma ligação do Registros).
 */
export function PessoaModal({ nome, email, telefone, onClose, closeLabel }: PessoaModalProps) {
  const registrosQuery = useQuery({ queryKey: ['registros'], queryFn: () => fetchRegistros(), retry: false })
  const purchasesQuery = useQuery({ queryKey: ['purchases'], queryFn: fetchPurchases, retry: false })

  const pessoa = useMemo(() => {
    const records = registrosQuery.data?.records
    if (!records) return null
    return acharPessoa(pessoasDeRegistros(records), { email, telefone }) ?? pessoaSemHistorico({ nome, email, telefone })
  }, [registrosQuery.data, email, telefone, nome])

  useEffect(() => {
    if (pessoa) return undefined
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [pessoa, onClose])

  if (!pessoa) {
    const falhou = registrosQuery.isError
    return (
      <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="dialog sale-dialog" role="dialog" aria-modal="true">
          <p className="sale-note">{falhou ? 'Não consegui ler os registros agora. Tente de novo em instantes.' : 'Procurando esta pessoa nos registros...'}</p>
          <div className="dialog-actions">
            <button type="button" className="btn-gold" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <RegistroModal record={pessoa} purchases={purchasesQuery.isError ? [] : purchasesQuery.data} onClose={onClose} closeLabel={closeLabel} />
}
