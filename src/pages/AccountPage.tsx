import { useRef, useState } from 'react'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { Avatar } from '@/components/layout/Avatar.tsx'
import { ICONS } from '@/components/flash/iconData.ts'
import { changePassword, resizePhoto, updateProfile } from '@/services/profileService.ts'
import { getDisplayName } from '@/lib/userDisplay.ts'
import { useAuthStore } from '@/store/authStore.ts'
import { useMascotStore } from '@/store/mascotStore.ts'
import { useThemeStore, type ThemeMode } from '@/store/themeStore.ts'
import { useUiStore } from '@/store/uiStore.ts'

const ABAS = [
  { id: 'perfil', rotulo: 'Perfil', icone: 'fa-user' },
  { id: 'aparencia', rotulo: 'Aparência', icone: 'fa-palette' },
  { id: 'senha', rotulo: 'Senha', icone: 'fa-key' },
] as const
type Aba = (typeof ABAS)[number]['id']

/** Adesivos que dá para escolher como foto (mesmos aceitos pelo servidor). */
const ADESIVOS = ['rose', 'skull', 'anchor', 'eye', 'swallow', 'dagger', 'heart', 'star', 'moon', 'bolt', 'crown', 'lighthouse']

const TEMAS: { id: ThemeMode; rotulo: string; fundo: string; barra: string; cartao: string }[] = [
  { id: 'light', rotulo: '☀️ Claro', fundo: '#efe2c4', barra: '#15110d', cartao: '#fcf6e6' },
  { id: 'dark', rotulo: '🌙 Escuro', fundo: '#14100b', barra: '#f1e6cd', cartao: '#1f1912' },
  { id: 'auto', rotulo: '🌗 Automático', fundo: 'linear-gradient(90deg,#efe2c4 50%,#14100b 50%)', barra: '#8d7e5f', cartao: '#8d7e5f' },
]

function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (valor: boolean) => void; rotulo: string }) {
  return <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} className="ac-sw" onClick={() => aoMudar(!ligado)} />
}

export default function AccountPage() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const mascotEnabled = useMascotStore((state) => state.enabled)
  const setMascotEnabled = useMascotStore((state) => state.setEnabled)
  const menuLabels = useUiStore((state) => state.menuLabels)
  const setMenuLabels = useUiStore((state) => state.setMenuLabels)

  const [aba, setAba] = useState<Aba>('perfil')
  const [nome, setNome] = useState(getDisplayName(user))
  const [avatar, setAvatar] = useState<string>(user?.avatar ?? '')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetir, setRepetir] = useState('')

  const mudou = nome.trim() !== getDisplayName(user) || avatar !== (user?.avatar ?? '')

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

  async function escolherFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const foto = evento.target.files?.[0]
    evento.target.value = ''
    if (!foto) return
    try {
      setAvatar(await resizePhoto(foto))
      setAviso(null)
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    }
  }

  async function trocar() {
    setAviso(null)
    if (nova !== repetir) return setAviso({ tipo: 'erro', texto: 'A nova senha e a repetição não são iguais.' })
    setSalvando(true)
    try {
      await changePassword(atual, nova)
      setAtual('')
      setNova('')
      setRepetir('')
      setAviso({ tipo: 'ok', texto: 'Senha trocada. Os outros aparelhos precisarão entrar de novo.' })
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: (erro as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Minha conta</p>
        <Typewriter as="h2" className="section-title mt-1" text="Seu perfil" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">Nome, foto, tema e senha: o que é só seu fica aqui, sem mexer no sistema dos outros.</p>
      </PageHero>

      <div className="ac-tabs" role="tablist">
        {ABAS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={aba === item.id} className={`ac-tab ${aba === item.id ? 'ac-on' : ''}`} onClick={() => { setAba(item.id); setAviso(null) }}>
            <i className={`fa-solid ${item.icone}`} /> {item.rotulo}
          </button>
        ))}
      </div>

      {aviso && (
        <p className={aviso.tipo === 'ok' ? 'text-emerald-600' : 'text-red-500'} role="status">
          {aviso.texto}
        </p>
      )}

      {aba === 'perfil' && (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="ac-card" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 12px' }}>
              <Avatar user={user} avatar={avatar || null} nome={nome} size={120} />
            </div>
            <b style={{ fontSize: '1.1rem' }}>{nome.trim() || '—'}</b>
            <p className="ac-help" style={{ marginTop: 10 }}>Escolha um adesivo de tatuagem ou envie uma foto.</p>
            <div className="ac-picks">
              <button type="button" className={`ac-pick ${avatar === '' ? 'ac-sel' : ''}`} onClick={() => setAvatar('')} title="Inicial do nome">
                {(nome.trim().charAt(0) || '?').toUpperCase()}
              </button>
              {ADESIVOS.slice(0, 11).map((nomeAdesivo) => (
                <button key={nomeAdesivo} type="button" className={`ac-pick ${avatar === `sticker:${nomeAdesivo}` ? 'ac-sel' : ''}`} onClick={() => setAvatar(`sticker:${nomeAdesivo}`)} title={nomeAdesivo}>
                  <svg className="stk flat" viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[nomeAdesivo] ?? '' }} />
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="ac-btn" onClick={() => arquivo.current?.click()}>
                <i className="fa-solid fa-camera" /> Enviar foto
              </button>
              <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(evento) => void escolherFoto(evento)} />
            </div>
          </div>
          <div className="ac-card">
            <div className="ac-sub">Dados</div>
            <h3>Como você aparece no sistema</h3>
            <div style={{ height: 10 }} />
            <label className="ac-field">
              <span>Nome</span>
              <input className="ac-in" value={nome} maxLength={80} onChange={(evento) => setNome(evento.target.value)} />
            </label>
            <label className="ac-field">
              <span>E-mail (login)</span>
              <input className="ac-in" value={user?.email ?? user?.usuario ?? ''} readOnly />
            </label>
            <label className="ac-field">
              <span>Cargo</span>
              <input className="ac-in" value={user?.cargo === 'admin' ? 'Administrador' : 'Usuário'} readOnly />
            </label>
            <p className="ac-help">O e-mail e o cargo só o administrador altera, em Configurações → Usuários e cargos.</p>
            <button type="button" className="ac-btn ac-prim" disabled={salvando || !mudou || nome.trim().length < 2} onClick={() => void salvar()}>
              <i className="fa-solid fa-floppy-disk" /> {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}

      {aba === 'aparencia' && (
        <div className="ac-grid">
          <div className="ac-card">
            <div className="ac-sub">Tema</div>
            <h3>Claro, escuro ou automático</h3>
            <p className="ac-help">Vale só para você neste navegador. O automático segue o tema do seu computador ou celular.</p>
            <div className="ac-themes">
              {TEMAS.map((tema) => (
                <button key={tema.id} type="button" className={`ac-theme ${mode === tema.id ? 'ac-sel' : ''}`} onClick={() => setMode(tema.id)} aria-pressed={mode === tema.id}>
                  <div className="ac-pre" style={{ background: tema.fundo }}>
                    <i style={{ background: tema.barra, width: '50%' }} />
                    <i style={{ background: '#ff8a1f', width: '80%' }} />
                    <i style={{ background: tema.cartao, border: `2px solid ${tema.barra}`, width: '100%', height: 20 }} />
                  </div>
                  <b>{tema.rotulo}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="ac-card">
            <div className="ac-sub">Detalhes</div>
            <h3>Do seu jeito</h3>
            <div className="ac-row">
              <div>
                <b>Mascote TaTuzinho</b>
                <small>Dicas e avisos no canto da tela</small>
              </div>
              <Interruptor ligado={mascotEnabled} aoMudar={setMascotEnabled} rotulo="Mascote TaTuzinho" />
            </div>
            <div className="ac-row">
              <div>
                <b>Nomes embaixo dos ícones do menu</b>
                <small>Mostra o nome de cada tela sem precisar passar o mouse</small>
              </div>
              <Interruptor ligado={menuLabels} aoMudar={setMenuLabels} rotulo="Nomes embaixo dos ícones" />
            </div>
          </div>
        </div>
      )}

      {aba === 'senha' && (
        <div className="ac-card" style={{ maxWidth: 520 }}>
          <div className="ac-sub">Segurança da conta</div>
          <h3>Trocar a senha</h3>
          <p className="ac-help">Mínimo de 8 caracteres, com maiúscula, minúscula, número e símbolo. Ao trocar, os outros aparelhos saem da conta.</p>
          <label className="ac-field">
            <span>Senha atual</span>
            <input className="ac-in" type="password" autoComplete="current-password" value={atual} onChange={(evento) => setAtual(evento.target.value)} />
          </label>
          <label className="ac-field">
            <span>Nova senha</span>
            <input className="ac-in" type="password" autoComplete="new-password" value={nova} onChange={(evento) => setNova(evento.target.value)} />
          </label>
          <label className="ac-field">
            <span>Repetir a nova senha</span>
            <input className="ac-in" type="password" autoComplete="new-password" value={repetir} onChange={(evento) => setRepetir(evento.target.value)} />
          </label>
          <button type="button" className="ac-btn ac-prim" disabled={salvando || !atual || !nova || !repetir} onClick={() => void trocar()}>
            <i className="fa-solid fa-key" /> {salvando ? 'Trocando...' : 'Trocar senha'}
          </button>
        </div>
      )}
    </div>
  )
}
