# Monitor de Traceroute (traceroute-monitor)

[![Versão](https://img.shields.io/badge/version-1.0.0-blue)](./package.json) [![Licença](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

Monitor de traceroute com API em Node.js/Express para executar testes de rede, manter histórico e expor dados prontos para gráficos. O projeto fornece endpoints para gerenciar alvos, ajustar configurações e obter análises agregadas por hora/dia. Frontend não incluso.

## Sumário
- Visão Geral
- Requisitos
- Instalação
- Configuração (.env e JSON)
- Uso (exemplos práticos)
- Arquivos do Dashboard Grafana
- Execução como Serviço (Debian/systemd)
- Contribuição

## Visão Geral
- API REST para traceroute e gerenciamento de alvos
- Armazenamento de alvos em `data/targets.csv`
- Histórico em `data/historico_traceroute/historico_traceroute.json` (7 dias)
- Cache com `node-cache` para alto desempenho
- Dados prontos para gráficos (Chart.js) por hora (24h) e por dia (7d)

## Requisitos
- Node.js >= 14
- NPM (ou Yarn)
- Utilitário `traceroute` instalado
  - Linux (Debian/Ubuntu): `sudo apt-get install traceroute`
  - Linux (RHEL/CentOS): `sudo yum install traceroute`
  - macOS (Homebrew): `brew install traceroute`

## Instalação
### Clonar e instalar dependências
```bash
git clone https://github.com/SirAlgodar/modulo_traceroute.git
cd modulo_traceroute
npm install
```

### Estrutura de dados
```bash
mkdir -p data/historico_traceroute
touch data/targets.csv
echo "[]" > data/historico_traceroute/historico_traceroute.json
```

### Executar
```bash
# Produção
npm start

# Desenvolvimento (watch)
npm run dev
```
Servidor padrão em `http://localhost:3055`.

## Configuração (.env e JSON)
### Variáveis de ambiente (.env)
```ini
# Limiar de salto lento (ms)
SLOW_HOP_THRESHOLD=25
# Intervalo de atualização da UI (s)
REFRESH_INTERVAL=60

# HTTP/HTTPS
HTTP_PORT=3055
ENABLE_HTTPS=false
HTTPS_PORT=3056
SSL_CERT_PATH=/caminho/para/fullchain.pem
SSL_KEY_PATH=/caminho/para/privkey.pem
```

Tabela de opções (.env):
| Chave | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `SLOW_HOP_THRESHOLD` | number | `25` | Limiar de latência por salto considerado lento |
| `REFRESH_INTERVAL` | number | `60` | Intervalo (UI) para refresh de dados |
| `HTTP_PORT` | number | `3055` | Porta do servidor HTTP |
| `ENABLE_HTTPS` | boolean | `false` | Habilita HTTPS quando `true` e certificados válidos |
| `HTTPS_PORT` | number | `3056` | Porta do servidor HTTPS |
| `SSL_CERT_PATH` | string | — | Caminho para certificado SSL (quando HTTPS) |
| `SSL_KEY_PATH` | string | — | Caminho para chave privada SSL (quando HTTPS) |

### Configuração por JSON (corpos de requisição)
`POST /api/settings`
```json
{
  "slowHopThreshold": 50,
  "refreshInterval": 120
}
```
Opções:
| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|------------|---------|-----------|
| `slowHopThreshold` | number | sim | `.env SLOW_HOP_THRESHOLD` | Atualiza limiar de salto lento |
| `refreshInterval` | number | sim | `.env REFRESH_INTERVAL` | Atualiza intervalo de atualização |

`POST /api/targets`
```json
{
  "displayName": "Cloudflare DNS",
  "target": "1.1.1.1",
  "isHighlighted": true
}
```

`PUT /api/targets/:id`
```json
{
  "displayName": "Cloudflare DNS (Novo)",
  "target": "1.1.1.1",
  "isHighlighted": false
}
```

`POST /api/traceroute/single`
```json
{
  "target": "google.com",
  "displayName": "Google",
  "id": "googlecom",
  "isHighlighted": true,
  "slowHopThreshold": 25
}
```
Opções:
| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|------------|---------|-----------|
| `target` | string | sim | — | Host a ser testado (`traceroute`) |
| `displayName` | string | não | — | Nome exibido para o alvo |
| `id` | string | não | `target` sanitizado | Identificador do card |
| `isHighlighted` | boolean | não | `false` | Loga no histórico quando `true` |
| `slowHopThreshold` | number | não | `.env SLOW_HOP_THRESHOLD` | Limiar por requisição |

## Uso (exemplos práticos)
### Alvos
```bash
# Listar alvos
curl -s http://localhost:3055/api/targets | jq

# Adicionar alvo
curl -s -X POST http://localhost:3055/api/targets \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Cloudflare DNS","target":"1.1.1.1","isHighlighted":true}' | jq

# Atualizar alvo
curl -s -X PUT http://localhost:3055/api/targets/1.1.1.1 \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Cloudflare DNS (Novo)","target":"1.1.1.1","isHighlighted":false}' | jq

# Remover alvo
curl -s -X DELETE http://localhost:3055/api/targets/1.1.1.1 | jq
```

### Configurações
```bash
# Ler configurações
curl -s http://localhost:3055/api/settings | jq

# Atualizar configurações
curl -s -X POST http://localhost:3055/api/settings \
  -H "Content-Type: application/json" \
  -d '{"slowHopThreshold":50,"refreshInterval":120}' | jq
```

### Traceroute e histórico
```bash
# Executar um traceroute
curl -s -X POST http://localhost:3055/api/traceroute/single \
  -H "Content-Type: application/json" \
  -d '{"target":"google.com","displayName":"Google","isHighlighted":true}' | jq

# Alvos com histórico
curl -s http://localhost:3055/api/history/targets | jq

# Dados de gráficos (24h / 7d)
curl -s http://localhost:3055/api/history/charts/google.com/hourly | jq
curl -s http://localhost:3055/api/history/charts/google.com/daily | jq
```

## Arquivos do Dashboard Grafana
- JSON: [MONITORAMENTO DE SALTOS - VERSÃO FINAL v2-1763062811850.json](./MONITORAMENTO%20DE%20SALTOS%20-%20VERSA%CC%83O%20FINAL%20v2-1763062811850.json) — Configuração completa do dashboard.
- PDF: [DASHBOARD MONITORAMENTO DE SALTOS _ Guia do Usuário.pdf](./DASHBOARD%20MONITORAMENTO%20DE%20SALTOS%20_%20Guia%20do%20Usu%C3%A1rio.pdf) — Documentação:
  - Funcionalidades implementadas
  - Configurações necessárias
  - Guia de implantação passo a passo

Importação no Grafana: importe o arquivo `.json` pelo menu de dashboards.

## Execução como Serviço (Debian/systemd)
```bash
sudo nano /etc/systemd/system/traceroute-monitor.service
```
```ini
[Unit]
Description=Monitor de Traceroute API
After=network.target

[Service]
User=seu_usuario
Group=seu_usuario
WorkingDirectory=/caminho/completo/para/modulo_traceroute
Environment=NODE_ENV=production
ExecStart=/usr/bin/node api_node.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable traceroute-monitor.service
sudo systemctl start traceroute-monitor.service
sudo systemctl status traceroute-monitor.service
journalctl -u traceroute-monitor.service -f
```

## Contribuição
- Faça um fork, crie uma branch e envie um PR.
- Siga o estilo do projeto e mantenha a consistência dos endpoints.
- Licença: MIT.
