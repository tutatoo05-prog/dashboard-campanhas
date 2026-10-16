/* Aplica o tema salvo antes da 1ª pintura, para a tela não piscar clara.
   Fica em arquivo próprio porque a política de segurança do servidor (CSP) bloqueia script dentro do HTML. */
try {
  if (localStorage.getItem('dash-theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#14100b')
  }
} catch (e) {}
