#!/bin/sh
# Passos do deploy no Plesk (referência; no servidor da Telway as "ações pós-implantação" usam a linha única do DEPLOY.md).
#   sh scripts/deploy-plesk.sh
set -e

# As ações de implantação do Plesk nem sempre enxergam o Node. Neste servidor ele vem do nodenv;
# se não houver, usa o mais novo instalado pelo próprio Plesk.
if [ -d "$HOME/.nodenv" ]; then
  export PATH="$HOME/.nodenv/bin:$PATH"
  eval "$(nodenv init -)"
elif [ -d /opt/plesk/node ]; then
  NODE_BIN="$(ls -d /opt/plesk/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && PATH="$NODE_BIN:$PATH"
  export PATH
fi

# Dependências (inclui as de desenvolvimento: o build precisa delas)
npm install --no-audit --no-fund

# Gera o site (pasta dist) e as bibliotecas que o servidor compartilha com o site
npm run build

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

echo "Deploy concluído: $(date '+%d/%m/%Y %H:%M:%S')"
