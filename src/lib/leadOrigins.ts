/** Nome amigável de cada origem de lead (produto/formulário do site). */
const ORIGIN_LABELS: Record<string, string> = {
  anuncio: 'Anúncio (formulário)',
  work_cobertura: 'Work Cobertura',
  essentials: 'Essentials',
  prompt: 'Prompt',
  workshop_gratuito: 'Workshop gratuito',
  workshop_gratuito_leao: 'Workshop Leão',
  workshop_irezumi_1: 'Workshop Irezumi',
  workshop_leao_2: 'Workshop Leão 2',
  lancamento_interessados: 'Lançamento (interessados)',
  mentoria_particular: 'Mentoria Particular',
}

export function originLabel(origem?: string): string {
  if (!origem) return 'Sem origem'
  return ORIGIN_LABELS[origem] ?? origem
}
