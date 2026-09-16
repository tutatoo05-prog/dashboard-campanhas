function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderPasswordField({ id, label }) {
  return `
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-zinc-500">${label}</span>
      <div class="relative">
        <input
          id="${id}"
          type="password"
          name="${id}-field"
          autocomplete="off"
          data-lpignore="true"
          data-form-type="other"
          required
          minlength="6"
          class="auth-input filter-input pr-10"
          placeholder="••••••••"
          readonly
        />
        <button
          type="button"
          class="password-toggle absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
          data-target="${id}"
          aria-label="Mostrar senha"
          tabindex="-1"
        >
          <i class="password-toggle-icon fa-regular fa-eye text-sm"></i>
        </button>
      </div>
    </label>
  `
}

export function renderLoginScreen({
  mode = 'login',
  error = '',
  loading = false,
  message = '',
  email = '',
  nome = '',
}) {
  const isRegister = mode === 'register'

  return `
    <div class="auth-screen flex min-h-dvh w-full items-center justify-center p-4">
      <div class="w-full max-w-md">
        <div class="mb-8 text-center">
          <div class="brand-logo brand-logo-lg mx-auto mb-4"><i class="fa-solid fa-fire"></i></div>
          <h1 class="font-display text-3xl text-zinc-50">Tuzinho Ads</h1>
          <p class="mt-1 text-sm text-zinc-500">Tuzinho Academy · Meta Ads</p>
        </div>

        <div class="surface-card p-6 sm:p-8">
          <div class="mb-6 flex rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-1">
            <button type="button" id="tab-login" class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${!isRegister ? 'accent-gradient text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}">
              <i class="fa-solid fa-right-to-bracket text-xs"></i> Entrar
            </button>
            <button type="button" id="tab-register" class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isRegister ? 'accent-gradient text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}">
              <i class="fa-solid fa-user-plus text-xs"></i> Criar conta
            </button>
          </div>

          ${error ? `<div class="mb-4 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">${escapeHtml(error)}</div>` : ''}
          ${message ? `<div class="mb-4 rounded-lg border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm text-green-300">${escapeHtml(message)}</div>` : ''}

          <form id="auth-form" class="space-y-4" autocomplete="off" novalidate>
            <input type="text" name="prevent_autofill" tabindex="-1" autocomplete="off" aria-hidden="true" class="pointer-events-none absolute h-0 w-0 opacity-0" />
            <input type="password" name="prevent_autofill_pass" tabindex="-1" autocomplete="off" aria-hidden="true" class="pointer-events-none absolute h-0 w-0 opacity-0" />

            ${isRegister ? `
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-zinc-500">Nome</span>
                <input id="auth-nome" type="text" name="auth-nome-field" autocomplete="off" data-lpignore="true" required
                  class="auth-input filter-input"
                  placeholder="Seu nome" value="${escapeHtml(nome)}" ${nome ? '' : 'readonly'} />
              </label>
            ` : ''}

            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-zinc-500">E-mail</span>
              <input id="auth-email" type="text" inputmode="email" name="auth-email-field" autocomplete="off" data-lpignore="true" data-form-type="other" required
                class="auth-input filter-input"
                placeholder="usuario@email.com" value="${escapeHtml(email)}" ${email ? '' : 'readonly'} />
            </label>

            ${renderPasswordField({ id: 'auth-senha', label: 'Senha' })}
            ${isRegister ? renderPasswordField({ id: 'auth-senha-confirm', label: 'Confirmar senha' }) : ''}

            <button type="submit" id="auth-submit" ${loading ? 'disabled' : ''}
              class="btn-gold w-full disabled:opacity-60">
              ${loading ? '<i class="fa-solid fa-spinner fa-spin"></i> Aguarde...' : isRegister ? '<i class="fa-solid fa-user-plus"></i> Criar conta' : '<i class="fa-solid fa-right-to-bracket"></i> Entrar'}
            </button>
          </form>
        </div>

        <p class="mt-6 text-center text-xs text-zinc-600">
          <i class="fa-solid fa-shield-halved mr-1 text-gold/50"></i>
          Acesso restrito · credenciais validadas via n8n
        </p>
      </div>
    </div>
  `
}

function unlockAuthInputs() {
  document.querySelectorAll('.auth-input').forEach((input) => {
    input.addEventListener('focus', () => input.removeAttribute('readonly'), { once: true })
  })
}

function clearAutofill() {
  // Só limpa senhas — e-mail/nome ficam preservados após erro de login
  ;['auth-senha', 'auth-senha-confirm'].forEach((id) => {
    const input = document.getElementById(id)
    if (input && document.activeElement !== input) {
      input.value = ''
    }
  })
}

function bindPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target)
      if (!input) return

      input.removeAttribute('readonly')
      const icon = button.querySelector('.password-toggle-icon')
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      icon?.classList.toggle('fa-eye', !show)
      icon?.classList.toggle('fa-eye-slash', show)
      button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha')
    })
  })
}

function bindAntiAutofill() {
  unlockAuthInputs()
  clearAutofill()
  requestAnimationFrame(clearAutofill)
  setTimeout(clearAutofill, 50)
  setTimeout(clearAutofill, 250)
}

export function bindLoginEvents({ mode, onSubmit, onSwitchMode, focusPassword = false }) {
  document.getElementById('tab-login')?.addEventListener('click', () => onSwitchMode('login'))
  document.getElementById('tab-register')?.addEventListener('click', () => onSwitchMode('register'))

  bindPasswordToggles()
  bindAntiAutofill()

  if (focusPassword) {
    const passwordInput = document.getElementById('auth-senha')
    passwordInput?.removeAttribute('readonly')
    passwordInput?.focus()
  }

  document.getElementById('auth-form')?.addEventListener('submit', (event) => {
    event.preventDefault()

    const nome = document.getElementById('auth-nome')?.value?.trim() ?? ''
    const email = document.getElementById('auth-email')?.value?.trim() ?? ''
    const senha = document.getElementById('auth-senha')?.value ?? ''
    const senhaConfirm = document.getElementById('auth-senha-confirm')?.value ?? ''

    onSubmit({ mode, nome, email, usuario: email, senha, senhaConfirm })
  })
}
