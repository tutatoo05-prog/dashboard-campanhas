import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Sticker } from '@/components/flash/Sticker.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { CONFIG_SECTIONS, type ConfigSection } from '@/lib/navItems.ts'
import { fetchSaude } from '@/services/segurancaService.ts'

const SegurancaPage = lazy(() => import('@/pages/SegurancaPage.tsx'))
const UsersPage = lazy(() => import('@/pages/UsersPage.tsx'))

const INTEGRACOES = [
  { nome: 'Hotmart', detalhe: 'Vendas e liberação de acesso (webhook)', icone: 'fa-fire' },
  { nome: 'Meta Ads', detalhe: 'Gastos e resultados das campanhas', icone: 'fa-bullhorn' },
  { nome: 'Telegram', detalhe: 'Avisos de problema e backup diário', icone: 'fa-paper-plane' },
  { nome: 'Plataforma de cursos (Tekway)', detalhe: 'Liberação dos alunos', icone: 'fa-graduation-cap' },
  { nome: 'WhatsApp (Evolution)', detalhe: 'Mensagens e plano B dos avisos', icone: 'fa-comment-dots' },
  { nome: 'Brevo', detalhe: 'E-mails do sistema', icone: 'fa-envelope' },
]

function Operacao() {
  const saude = useQuery({ queryKey: ['saude'], queryFn: fetchSaude, retry: false })
  const dados = saude.data
  return (
    <div className="ac-grid">
      <div className="ac-card">
        <div className="ac-sub">Agora</div>
        <h3>Como está o sistema</h3>
        {saude.isLoading && <p className="ac-help">Conferindo...</p>}
        {saude.isError && <p className="ac-help">Não consegui ler a saúde do sistema agora.</p>}
        {dados && (
          <>
            <div className="ac-row">
              <div>
                <b>Banco de dados</b>
                <small>Respondeu em {dados.banco.ms} ms</small>
              </div>
              <span className={`ac-chip ${dados.banco.ok ? 'ac-ok' : 'ac-bad'}`}>{dados.banco.ok ? 'OK' : 'Com problema'}</span>
            </div>
            <div className="ac-row">
              <div>
                <b>Servidor</b>
                <small>
                  Ligado há {Math.round(dados.servidor.ligadoHaMinutos / 60)} h, memória {dados.servidor.memoriaMB} MB
                </small>
              </div>
              <span className={`ac-chip ${dados.ok ? 'ac-ok' : 'ac-warn'}`}>{dados.ok ? 'OK' : 'Atenção'}</span>
            </div>
          </>
        )}
      </div>
      <div className="ac-card">
        <div className="ac-sub">Atalhos</div>
        <h3>Telas de operação</h3>
        <p className="ac-help">As telas continuam as mesmas; aqui ficam os atalhos das de uso mais raro.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="ac-btn" to="/live">
            <i className="fa-solid fa-tower-broadcast" /> Live
          </Link>
          <Link className="ac-btn" to="/acessos">
            <i className="fa-solid fa-key" /> Acessos
          </Link>
          <Link className="ac-btn" to="/config/seguranca">
            <i className="fa-solid fa-shield-halved" /> Segurança e backup
          </Link>
        </div>
      </div>
    </div>
  )
}

function Integracoes() {
  return (
    <div className="ac-card">
      <div className="ac-sub">Conexões</div>
      <h3>Serviços ligados ao dash</h3>
      <p className="ac-help">As chaves ficam guardadas no servidor (Plesk) e nunca aparecem aqui. Para trocar uma chave, veja os lembretes em Segurança.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {INTEGRACOES.map((item) => (
          <div key={item.nome} className="ac-int">
            <i className={`fa-solid ${item.icone}`} />
            <div>
              <b>{item.nome}</b>
              <small>{item.detalhe}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Geral() {
  return (
    <div className="ac-card">
      <div className="ac-sub">Sobre</div>
      <h3>Academy Labs Dash</h3>
      <p className="ac-help">Painel de campanhas, vendas e liberação de acessos. Tema, mascote e nomes do menu são de cada pessoa: ficam em Minha conta → Aparência.</p>
      <Link className="ac-btn" to="/perfil">
        <i className="fa-solid fa-id-card" /> Ir para Minha conta
      </Link>
    </div>
  )
}

export default function SettingsPage() {
  const { secao } = useParams<{ secao?: string }>()
  const abasRef = useRef<HTMLElement>(null)
  // No carrossel de abas do celular, a aba aberta sempre aparece inteira.
  useEffect(() => {
    abasRef.current?.querySelector('.cfg-on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [secao])
  const atual = CONFIG_SECTIONS.find((item) => item.id === secao)
  if (!atual) return <Navigate to={`/config/${CONFIG_SECTIONS[0].id}`} replace />
  const id: ConfigSection = atual.id

  return (
    <div className="space-y-6 sm:space-y-8">
      {(id === 'operacao' || id === 'integracoes' || id === 'geral') && (
      <PageHero>
        <p className="section-label">Configurações</p>
        <Typewriter as="h2" className="section-title mt-1" text={atual.label} />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">Coisas do sistema inteiro. Só administradores veem esta área.</p>
      </PageHero>
      )}
      <div className="cfg-layout">
        <nav ref={abasRef} className="cfg-side" aria-label="Seções de configurações">
          {CONFIG_SECTIONS.map((item) => (
            <NavLink key={item.id} to={`/config/${item.id}`} className={({ isActive }) => (isActive ? 'cfg-on' : '')}>
              <span className="tn-ic">
                <Sticker name={item.sticker} flat />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Suspense fallback={<p className="ac-help">Carregando...</p>}>
            {id === 'operacao' && <Operacao />}
            {id === 'seguranca' && <SegurancaPage />}
            {id === 'usuarios' && <UsersPage />}
            {id === 'integracoes' && <Integracoes />}
            {id === 'geral' && <Geral />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
