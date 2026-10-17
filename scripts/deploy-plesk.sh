#!/bin/sh
# Passos do deploy no Plesk (referência; no Plesk as "ações pós-implantação" usam a linha única do DEPLOY.md).
#   sh scripts/deploy-plesk.sh
set -e

# As ações de implantação do Plesk rodam com um PATH quase vazio (nem `sort` existe): acha o Node do Plesk só
# com o próprio shell e junta os diretórios padrão do sistema.
for d in /opt/plesk/node/*/bin; do PATH="$d:$PATH"; done
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"
command -v npm || { echo "npm não encontrado: confira onde o Node está instalado no servidor"; exit 1; }

# Dependências (inclui as de desenvolvimento: o build precisa delas)
npm install --no-audit --no-fund

# Gera o site (pasta dist) e as bibliotecas que o servidor compartilha com o site
npm run build

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

echo "Deploy concluído: $(date '+%d/%m/%Y %H:%M:%S')"
