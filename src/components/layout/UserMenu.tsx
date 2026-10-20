import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarPicker } from '@/components/layout/AvatarPicker.tsx'
import { updateProfile } from '@/services/profileService.ts'
import { canAccessPath, isAdmin } from '@/lib/roles.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore, type ThemeMode } from '@/store/themeStore.ts'
import { useTourStore } from '@/store/tourStore.ts'

const MODOS: { id: ThemeMode; rotulo: string }[] = [
  { id: 'light', rotulo: 'Claro' },
  { id: 'dark', rotulo: 'Escuro' },
  { id: 'auto', rotulo: 'Auto' },
]

interface Atalho {
  to: string
  rotulo: string
  icone: string
}

const OPERACAO: Atalho[] = [
  { to: '/live', rotulo: 'Live', icone: 'fa-tower-broadcast' },
  { to: '/videos', rotulo: 'Vídeos', icone: 'fa-circle-play' },
  { to: '/acessos', rotulo: 'Acessos', icone: 'fa-key' },
]

const ADMIN: Atalho[] = [
  { to: '/config/usuarios', rotulo: 'Usuários e cargos', icone: 'fa-users-gear' },
  { to: '/config/seguranca', rotulo: 'Segurança e backup', icone: 'fa-shield-halved' },
  { to: '/config', rotulo: 'Configurações', icone: 'fa-gear' },
]

/** Menu pequeno (dropdown) do botão "mais" do usuário. */
export function UserMenu({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const startTour = useTourStore((state) => state.start)
  const navigate = useNavigate()

  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(getDisplayName(user))
  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const admin = isAdmin(user)
  const operacao = OPERACAO.filter((item) => canAccessPath(user, item.to))
  const mudou = nome.trim() !== getDisplayName(user) || avatar !== (user?.avatar ?? '')

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      const novo = await updateProfile({ nome: nome.trim(), avatar })
      setUser({ ...(user ?? {}), ...novo })
      onClose()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  function ir(destino: string) {
    onClose()
    navigate(destino)
  }

  function tour() {
    onClose()
    if (!mascotEnabled) setMascotEnabled(true)
    window.setTimeout(startTour, mascotEnabled ? 0 : 400)
  }

  const linha = (item: Atalho) => (
    <button key={item.to} type="button" role="menuitem" className="dd-row" onClick={() => ir(item.to)}>
      <i className={`fa-solid ${item.icone}`} />
      {item.rotulo}
    </button>
  )

  if (editando) {
    return (
      <div className="dd" role="dialog" aria-label="Editar perfil">
        <button type="button" className="dd-back" onClick={() => setEditando(false)}>
          <i className="fa-solid fa-arrow-left" /> Editar perfil
        </button>
        <input className="ac-in dd-in" value={nome} maxLength={80} onChange={(evento) => setNome(evento.target.value)} aria-label="Nome" placeholder="Seu nome" />
        <AvatarPicker value={avatar} inicial={nome} onChange={setAvatar} />
        {erro && <p className="dd-err">{erro}</p>}
        <div className="dd-actions">
          <button type="button" className="ac-btn" onClick={() => ir('/perfil')}>
            Senha e mais
          </button>
          <button type="button" className="ac-btn ac-prim" disabled={salvando || !mudou || nome.trim().length < 2} onClick={() => void salvar()}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dd" role="menu">
      <button type="button" role="menuitem" className="dd-row" onClick={() => setEditando(true)}>
        <i className="fa-solid fa-user-pen" />
        Editar perfil
      </button>
      {operacao.length > 0 && <p className="dd-sec">Operação</p>}
      {operacao.map(linha)}
      {admin && <p className="dd-sec">Admin</p>}
      {admin && ADMIN.map(linha)}
      <p className="dd-sec">Preferências</p>
      <div className="dd-row dd-pref">
        <i className="fa-solid fa-circle-half-stroke" />
        Tema
        <span className="tn-seg">
          {MODOS.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? 'tn-sel' : ''} onClick={() => setMode(item.id)}>
              {item.rotulo}
            </button>
          ))}
        </span>
      </div>
      <div className="dd-row dd-pref">
        <i className="fa-solid fa-paw" />
        Mascote
        <button type="button" role="switch" aria-checked={mascotEnabled} aria-label="Mascote TaTuzinho" className="ac-sw dd-sw" onClick={() => setMascotEnabled(!mascotEnabled)} />
      </div>
      <button type="button" role="menuitem" className="dd-row" onClick={tour}>
        <i className="fa-solid fa-wand-magic-sparkles" />
        Tour do TaTuzinho
      </button>
    </div>
  )
}
