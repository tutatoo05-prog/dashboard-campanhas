#!/bin/sh
# Deploy no Plesk, em segundo plano e com registro. O Plesk chama assim (linha única nas "ações pós-implantação"):
#   (sh scripts/deploy-plesk.sh > deploy.log 2>&1 &); echo "deploy em segundo plano"
# O arquivo deploy.log aparece na tela Segurança do dash ("Último deploy"), para ver onde parou se algo falhar.
passo() { echo "[$(date '+%H:%M:%S')] $1"; }

# As ações de implantação do Plesk rodam com um shell limitado: acha o Node do Plesk só com o próprio shell
# e junta os diretórios padrão do sistema.
passo "deploy iniciado em $(pwd)"
passo "PATH inicial: $PATH"
for d in /opt/plesk/node/*/bin; do PATH="$d:$PATH"; done
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"

# Diagnóstico: o que este ambiente tem (ajuda a entender qualquer falha)
for ferramenta in node npm git curl sort; do
  if command -v "$ferramenta" >/dev/null 2>&1; then passo "tem $ferramenta: $(command -v "$ferramenta")"; else passo "NÃO tem $ferramenta"; fi
done
if [ -d /opt/plesk/node ]; then passo "pasta do Node do Plesk: $(echo /opt/plesk/node/*)"; else passo "pasta /opt/plesk/node NÃO existe neste ambiente"; fi

command -v npm >/dev/null 2>&1 || { passo "ERRO: npm não encontrado neste ambiente"; exit 1; }
passo "node $(node -v), npm $(npm -v)"

passo "npm install..."
npm install --no-audit --no-fund || { passo "ERRO: npm install falhou"; exit 1; }

passo "npm run build..."
npm run build || { passo "ERRO: build falhou (o app antigo continua no ar)"; exit 1; }

# O Plesk reinicia o app Node quando este arquivo muda
mkdir -p tmp
touch tmp/restart.txt

passo "Deploy concluído: o app foi reiniciado"
