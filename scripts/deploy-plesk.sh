#!/bin/sh
# Deploy no Plesk, em segundo plano e com registro. O Plesk chama assim (linha única nas "ações pós-implantação"):
#   (nohup sh scripts/deploy-plesk.sh > deploy.log 2>&1 &)
# O arquivo deploy.log aparece na tela Segurança do dash ("Último deploy"), para ver onde parou se algo falhar.
passo() { echo "[$(date '+%H:%M:%S')] $1"; }

# As ações de implantação do Plesk rodam com um PATH quase vazio: acha o Node do Plesk só com o shell
# e junta os diretórios padrão do sistema.
for d in /opt/plesk/node/*/bin; do PATH="$d:$PATH"; done
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"

passo "deploy iniciado em $(pwd)"
command -v npm >/dev/null 2>&1 || { passo "ERRO: npm não encontrado no servidor"; exit 1; }
passo "node $(node -v), npm $(npm -v)"

passo "npm install..."
npm install --no-audit --no-fund || { passo "ERRO: npm install falhou"; exit 1; }

passo "npm run build..."
npm run build || { passo "ERRO: build falhou (o app antigo continua no ar)"; exit 1; }

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

passo "Deploy concluído: o app foi reiniciado"
