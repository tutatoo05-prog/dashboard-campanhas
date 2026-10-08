// Cargos do dash:
// - admin: acesso a tudo, inclusive alterações (metas, Live, cargos).
// - usuario: usa todas as funcionalidades, mas não altera nada.
export const ROLES = ['admin', 'usuario']

export function isAdmin(user) {
  return user?.cargo === 'admin'
}

// Cargo "usuario" só enxerga a aba Leads (por enquanto). A leitura de compras
// fica liberada porque a tela de Leads cruza os e-mails pra marcar quem virou aluno.
export function canAccessApi(user, method, url) {
  if (isAdmin(user)) return true
  if (url.startsWith('/api/leads')) return true
  if (url.startsWith('/api/purchases') && (method === 'GET' || method === 'HEAD')) return true
  return false
}
