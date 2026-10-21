/**
 * A empresa da plataforma de cursos se chama Telway, mas as variáveis nasceram como TEKWAY_*.
 * O código usa só TELWAY_*; quem ainda tem o nome antigo no Plesk continua funcionando: se TELWAY_X não existe
 * e TEKWAY_X existe, o valor antigo é copiado. O nome novo sempre vence.
 */
export function aplicarNomesAntigos(env) {
  for (const [nome, valor] of Object.entries(env)) {
    if (!nome.startsWith('TEKWAY_')) continue
    const novo = `TELWAY_${nome.slice('TEKWAY_'.length)}`
    if (!String(env[novo] ?? '').trim()) env[novo] = valor
  }
  return env
}
