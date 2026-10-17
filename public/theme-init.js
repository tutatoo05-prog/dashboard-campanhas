/* Aplica o tema salvo antes da 1ª pintura, para a tela não piscar clara.
   Fica em arquivo próprio porque a política de segurança do servidor (CSP) bloqueia script dentro do HTML.
   Valores: 'dark', 'light' (padrão) ou 'auto' (segue o tema do computador). */
try {
  var salvo = localStorage.getItem('dash-theme')
  var escuro = salvo === 'dark' || (salvo === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (escuro) {
    document.documentElement.setAttribute('data-theme', 'dark')
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#14100b')
  }
} catch (e) {}
