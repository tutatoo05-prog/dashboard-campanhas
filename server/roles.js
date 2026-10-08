// Cargos do dash:
// - admin: acesso a tudo, inclusive alterações (metas, Live, cargos).
// - usuario: usa todas as funcionalidades, mas não altera nada.
export const ROLES = ['admin', 'usuario']

export function isAdmin(user) {
  return user?.cargo === 'admin'
}
