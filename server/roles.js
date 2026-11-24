// Cargos do dash:
// - admin: acesso a tudo, inclusive alterações (metas, Live, cargos).
// - usuario: usa todas as funcionalidades, mas não altera nada.
export const ROLES = ['admin', 'usuario']

export function isAdmin(user) {
  return user?.cargo === 'admin'
}

// Cargo "usuario" enxerga Leads e Recuperação. A leitura de compras fica liberada porque a tela de Leads
// cruza os e-mails pra marcar quem virou aluno.
export function canAccessApi(user, method, url) {
  if (isAdmin(user)) return true
  if (url.startsWith('/api/leads')) return true
  if (url.startsWith('/api/recuperacao') && (method === 'GET' || method === 'HEAD')) return true
  if (url.startsWith('/api/purchases') && (method === 'GET' || method === 'HEAD')) return true
  return false
}

/**
 * Escritas que o cargo "usuario" pode fazer: só a anotação da pessoa (situação do contato, etiquetas, nota),
 * que é o trabalho do dia a dia de quem faz a recuperação. Nada de configuração, campanha ou cadastro.
 */
export function canWriteAsUser(method, url) {
  return method === 'PUT' && new URL(url, 'http://localhost').pathname === '/api/leads/notas'
}
