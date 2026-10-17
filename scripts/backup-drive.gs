/**
 * Recebedor do backup do dash no Google Drive (Google Apps Script).
 *
 * Como instalar (uma vez só):
 *  1. Em https://script.google.com clique em "Novo projeto" e cole este arquivo inteiro.
 *  2. Em "Configurações do projeto" (engrenagem) → "Propriedades do script" → adicione
 *       nome:  SEGREDO     valor: uma senha longa que só você sabe (a mesma que vai em BACKUP_DRIVE_TOKEN no Plesk)
 *  3. "Implantar" → "Nova implantação" → tipo "App da Web":
 *       Executar como: Eu   |   Quem pode acessar: Qualquer pessoa
 *     Autorize o acesso ao Drive quando o Google pedir e copie a URL que termina em /exec
 *     (essa URL vai em BACKUP_DRIVE_URL no Plesk).
 *  4. Se mudar este código depois, use "Gerenciar implantações" → editar → "Nova versão".
 *
 * Segurança: a URL é pública, mas sem o SEGREDO o script não grava nada. O arquivo já chega criptografado.
 */
const PASTA_ID = '1-GNhBo6r-rKVTbqB7dF1ukQEuNkD25RF' // pasta do Drive onde os backups ficam
const MANTER = 30 // quantos backups guardar na pasta

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents)
    const segredo = PropertiesService.getScriptProperties().getProperty('SEGREDO')
    if (!segredo || dados.token !== segredo) return resposta({ ok: false, erro: 'não autorizado' })
    if (!/^dash-\d{4}-\d{2}-\d{2}\.bkp$/.test(String(dados.nome))) return resposta({ ok: false, erro: 'nome de arquivo inválido' })

    const pasta = DriveApp.getFolderById(PASTA_ID)
    const arquivo = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(dados.conteudo), 'application/octet-stream', dados.nome))

    // Mantém só os últimos backups (os mais antigos vão para a lixeira do Drive).
    const backups = []
    const lista = pasta.getFiles()
    while (lista.hasNext()) {
      const item = lista.next()
      if (/^dash-\d{4}-\d{2}-\d{2}\.bkp$/.test(item.getName())) backups.push(item)
    }
    backups.sort(function (a, b) { return b.getName().localeCompare(a.getName()) })
    backups.slice(MANTER).forEach(function (item) { item.setTrashed(true) })

    return resposta({ ok: true, id: arquivo.getId() })
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) })
  }
}

function resposta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON)
}
