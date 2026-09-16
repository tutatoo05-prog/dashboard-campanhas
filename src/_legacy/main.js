import './style.css'
import { fetchSession } from './services/authService.js'
import { initApp, setCurrentUser } from './app.js'
import { bindLoginEvents, renderLoginScreen } from './ui/login.js'
import { login, register } from './services/authService.js'

const loginState = {
  mode: 'login',
  error: '',
  message: '',
  loading: false,
  email: '',
  nome: '',
}

function renderLogin({ focusPassword = false } = {}) {
  document.querySelector('#app').innerHTML = renderLoginScreen({
    mode: loginState.mode,
    error: loginState.error,
    loading: loginState.loading,
    message: loginState.message,
    email: loginState.email,
    nome: loginState.nome,
  })

  bindLoginEvents({
    mode: loginState.mode,
    focusPassword,
    onSwitchMode: (mode) => {
      loginState.mode = mode
      loginState.error = ''
      loginState.message = ''
      renderLogin()
    },
    onSubmit: handleAuthSubmit,
  })
}

async function handleAuthSubmit({ mode, nome, email, usuario, senha, senhaConfirm }) {
  loginState.email = email
  loginState.nome = nome
  loginState.loading = true
  loginState.error = ''
  loginState.message = ''
  renderLogin()

  try {
    if (mode === 'register') {
      if (senha !== senhaConfirm) {
        throw new Error('As senhas não coincidem.')
      }
      const result = await register({ nome, email, usuario, senha })
      loginState.mode = 'login'
      loginState.message = result.message ?? 'Conta criada. Faça login.'
      loginState.nome = ''
    } else {
      const result = await login({ usuario: email || usuario, email, senha, nome: '' })
      setCurrentUser(result.user)
      initApp()
      return
    }
  } catch (error) {
    loginState.error = error.message
  }

  loginState.loading = false
  renderLogin({ focusPassword: Boolean(loginState.error) })
}

async function bootstrap() {
  try {
    const session = await fetchSession()

    if (session.authenticated && session.user) {
      setCurrentUser(session.user)
      initApp()
      return
    }
  } catch {
    /* mostra login */
  }

  renderLogin()
}

bootstrap()
