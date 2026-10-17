/** Itens do menu principal (o que a pessoa usa no dia a dia). Segurança, Usuários e ajustes ficam em Configurações. */
export interface NavItem {
  to: string
  label: string
  /** Nome do adesivo de tatuagem (ver components/flash/iconData.ts). */
  sticker: string
  end?: boolean
  adminOnly?: boolean
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Visão geral',
    items: [
      { to: '/', label: 'Dashboard', sticker: 'star', end: true },
      { to: '/acoes', label: 'Central de Ações', sticker: 'bolt' },
      { to: '/compare', label: 'Comparar', sticker: 'scales' },
    ],
  },
  {
    title: 'Dados',
    items: [
      { to: '/leads', label: 'Leads', sticker: 'rose' },
      { to: '/registros', label: 'Registros', sticker: 'scroll' },
      { to: '/purchases', label: 'Compras', sticker: 'coin' },
    ],
  },
  {
    title: 'Operação',
    items: [
      { to: '/live', label: 'Live', sticker: 'lighthouse' },
      { to: '/acessos', label: 'Acessos', sticker: 'crown', adminOnly: true },
    ],
  },
]

/** Seções de Configurações (só admin). */
export const CONFIG_SECTIONS = [
  { id: 'operacao', label: 'Operação', sticker: 'lighthouse' },
  { id: 'seguranca', label: 'Segurança', sticker: 'eye' },
  { id: 'usuarios', label: 'Usuários e cargos', sticker: 'skull' },
  { id: 'integracoes', label: 'Integrações', sticker: 'anchor' },
  { id: 'geral', label: 'Geral', sticker: 'star' },
] as const

export type ConfigSection = (typeof CONFIG_SECTIONS)[number]['id']
