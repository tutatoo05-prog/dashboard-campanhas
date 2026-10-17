/** Seções de Configurações (só admin). */
export const CONFIG_SECTIONS = [
  { id: 'operacao', label: 'Operação', sticker: 'lighthouse' },
  { id: 'seguranca', label: 'Segurança', sticker: 'eye' },
  { id: 'usuarios', label: 'Usuários e cargos', sticker: 'skull' },
  { id: 'integracoes', label: 'Integrações', sticker: 'anchor' },
  { id: 'geral', label: 'Geral', sticker: 'star' },
] as const

export type ConfigSection = (typeof CONFIG_SECTIONS)[number]['id']
