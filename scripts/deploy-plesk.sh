#!/bin/sh
# Passos do deploy no Plesk, para rodar sozinhos a cada push (ver DEPLOY.md → "Deploy automático").
# Cole o conteúdo do bloco "Ações adicionais de implantação" do Plesk ou aponte para este arquivo:
#   sh scripts/deploy-plesk.sh
set -e

# Dependências (inclui as de desenvolvimento: o build precisa delas)
npm ci --no-audit --no-fund

# Gera o site (pasta dist) e as bibliotecas que o servidor compartilha com o site
npm run build

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

echo "Deploy concluído: $(date '+%d/%m/%Y %H:%M:%S')"
