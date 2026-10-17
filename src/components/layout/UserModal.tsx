import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/layout/Avatar.tsx'
import { AvatarPicker } from '@/components/layout/AvatarPicker.tsx'
import { logout } from '@/services/authService.ts'
import { updateProfile } from '@/services/profileService.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore, type ThemeMode } from '@/store/themeStore.ts'
import { useTourStore } from '@/store/tourStore.ts'
import { useUiStore } from '@/store/uiStore.ts'

const MODOS: { id: ThemeMode; rotulo: string }[] = [
  { id: 'light', rotulo: 'Claro' },
  { id: 'dark', rotulo: 'Escuro' },
  { id: 'auto', rotulo: 'Auto' },
]

interface Atalho {
  to: string
  rotulo: string
  detalhe: string
  icone: string
}

const OPERACAO: Atalho[] = [
  { to: '/live', rotulo: 'Live', detalhe: 'Acompanhar a live do Essentials', icone: 'fa-tower-broadcast' },
  { to: '/acessos', rotulo: 'Acessos', detalhe: 'Quem tem acesso ao curso', icone: 'fa-key' },
]

const ADMIN: Atalho[] = [
  { to: '/config/usuarios', rotulo: 'Usuários e cargos', detalhe: 'Aprovar cadastros e definir cargos', icone: 'fa-users-gear' },
  { to: '/config/seguranca', rotulo: 'Segurança e backup', detalhe: 'Avisos, sessões, backup e deploy', icone: 'fa-shield-halved' },
  { to: '/config', rotulo: 'Configurações', detalhe: 'Operação, integrações e geral', icone: 'fa-gear' },
]

/** Janela da conta: editar nome e avatar, atalhos de operação/admin, tema, mascote e sair. */
export function UserModal() {
  const aberto = useUiStore((state) => state.userModalOpen)
  const fechar = useUiStore((state) => state.setUserModalOpen)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const startTour = useTourStore((state) => state.start)
  const navigate = useNavigate()

  const [nome, setNome] = useState('')
  const [avatar, setAvatar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // cada vez que abre, começa com os dados atuais
  useEffect(() => {
    if (!aberto) return
    setNome(getDisplayName(user))
    setAvatar(user?.avatar ?? '')
    setAviso(null)
  }, [aberto, user])

  useEffect(() => {
    if (!aberto) return
    function esc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') fechar(false)
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aberto, fechar])

  if (!aberto) return null

  const admin = isAdmin(user)
  const mudou = nome.trim() !== getDisplayName(user) || avatar !== (user?.avatar ?? '')
  const operacao = OPERACAO.filter((item) => canAccessPath(user, item.to))

  async function salvar() {
    setSalvando(true)
    setAviso(null)
    try {
      const novo = await updateProfile({ nome: nome.trim(), avatar })
      setUser({ ...(user ?? {}), ...novo })
      setAviso({ tipo: 'ok', texto: 'Perfil salvo.' })
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  function ir(destino: string) {
    fechar(false)
    navigate(destino)
  }

  function tour() {
    fechar(false)
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  async function sair() {
    fechar(false)
    await logout()
    setUser(null)
  }

  const atalho = (item: Atalho) => (
    <button key={item.to} type="button" className="um-link" onClick={() => ir(item.to)}>
      <i className={`fa-solid ${item.icone}`} />
      <span>
        <b>{item.rotulo}</b>
        <small>{item.detalhe}</small>
      </span>
      <i className="fa-solid fa-chevron-right um-go" />
    </button>
  )

  return (
    <div className="um-overlay" onMouseDown={(evento) => evento.target === evento.currentTarget && fechar(false)}>
      <div className="um-dialog" role="dialog" aria-modal="true" aria-label="Minha conta">
        <header className="um-head">
          <Avatar user={user} avatar={avatar} nome={nome} size={64} />
          <div className="min-w-0">
            <b>{nome.trim() || '—'}</b>
            <small>{user?.email ?? user?.usuario ?? ''}</small>
            <span className="tn-role">{admin ? 'ADMIN' : 'USUÁRIO'}</span>
          </div>
          <button type="button" className="um-x" onClick={() => fechar(false)} aria-label="Fechar">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="um-body">
          <section>
            <h4>Meu perfil</h4>
            <label className="ac-field">
              <span>Nome</span>
              <input className="ac-in" value={nome} maxLength={80} onChange={(evento) => setNome(evento.target.value)} />
            </label>
            <div className="ac-field">
              <span>Avatar</span>
              <AvatarPicker value={avatar} inicial={nome} onChange={setAvatar} />
            </div>
            <div className="um-save">
              <button type="button" className="ac-btn ac-prim" disabled={salvando || !mudou || nome.trim().length < 2} onClick={() => void salvar()}>
                <i className="fa-solid fa-floppy-disk" /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              {aviso && (
                <span className={aviso.tipo === 'ok' ? 'text-emerald-600' : 'text-red-500'} role="status">
                  {aviso.texto}
                </span>
              )}
            </div>
            <button type="button" className="um-more" onClick={() => ir('/perfil')}>
              Trocar senha e mais opções da conta <i className="fa-solid fa-arrow-right" />
            </button>
          </section>

          {operacao.length > 0 && (
            <section>
              <h4>Operação</h4>
              {operacao.map(atalho)}
            </section>
          )}

          {admin && (
            <section>
              <h4>Administração</h4>
              {ADMIN.map(atalho)}
            </section>
          )}

          <section>
            <h4>Preferências</h4>
            <div className="ac-row">
              <div>
                <b>Tema</b>
                <small>Só neste navegador</small>
              </div>
              <span className="tn-seg">
                {MODOS.map((item) => (
                  <button key={item.id} type="button" className={mode === item.id ? 'tn-sel' : ''} onClick={() => setMode(item.id)}>
                    {item.rotulo}
                  </button>
                ))}
              </span>
            </div>
            <div className="ac-row">
              <div>
                <b>Mascote TaTuzinho</b>
                <small>Dicas e avisos no canto da tela</small>
              </div>
              <button type="button" role="switch" aria-checked={mascotEnabled} aria-label="Mascote TaTuzinho" className="ac-sw" onClick={() => setMascotEnabled(!mascotEnabled)} />
            </div>
            <button type="button" className="um-link" onClick={tour}>
              <i className="fa-solid fa-wand-magic-sparkles" />
              <span>
                <b>Tour com o TaTuzinho</b>
                <small>Passeio rápido pelo painel</small>
              </span>
            </button>
          </section>
        </div>

        <footer className="um-foot">
          <button type="button" className="ac-btn" onClick={() => void sair()}>
            <i className="fa-solid fa-right-from-bracket" /> Sair da conta
          </button>
        </footer>
      </div>
    </div>
  )
}
