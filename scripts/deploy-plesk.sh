#!/bin/sh
# Passos do deploy no Plesk, para rodar sozinhos a cada push (ver DEPLOY.md → "Deploy automático").
# Cole no campo "Ações adicionais de implantação" do Plesk:   sh scripts/deploy-plesk.sh
set -e

# As ações de implantação do Plesk nem sempre enxergam o Node: usa o mais novo instalado pelo Plesk, se houver.
if [ -d /opt/plesk/node ]; then
  NODE_BIN="$(ls -d /opt/plesk/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && PATH="$NODE_BIN:$PATH"
fi
export PATH

# Dependências (inclui as de desenvolvimento: o build precisa delas)
npm ci --no-audit --no-fund

# Gera o site (pasta dist) e as bibliotecas que o servidor compartilha com o site
npm run build

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

echo "Deploy concluído: $(date '+%d/%m/%Y %H:%M:%S')"
