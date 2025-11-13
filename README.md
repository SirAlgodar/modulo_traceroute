# **Monitor de Traceroute (traceroute-monitor)**

## **Descrição**

Este projeto é um "Monitor de traceroute com interface web". Ele consiste em uma API de backend construída em Node.js e Express, projetada para executar testes de traceroute em alvos (hosts) pré-configurados, armazenar o histórico de resultados e fornecer dados para uma interface de frontend (não incluída neste repositório).  
A aplicação permite adicionar, remover e atualizar alvos, executar testes sob demanda e consultar o histórico de latência e rotas para análise de desempenho da rede.

## **📜Recursos Principais**

* **API RESTful:** Gerenciamento de alvos e configurações via endpoints HTTP.  
* **Execução de Traceroute:** Executa o comando traceroute do sistema para obter dados de rota.  
* **Gerenciamento de Alvos:** Alvos são armazenados em um arquivo targets.csv.  
* **Histórico de Testes:** Salva os resultados de testes para alvos "destacados" em um arquivo JSON (historico\_traceroute.json) por até 7 dias.  
* **Análise de Histórico:** Processa o histórico para detectar mudanças de rota e variações de latência.  
* **Dados para Gráficos:** Agrega dados históricos para visualização em gráficos diários (7 dias) e por hora (24 horas).  
* **Cache de Alto Desempenho:** Utiliza node-cache para reduzir leituras de disco dos arquivos de histórico e alvos, melhorando a performance da API.  
* **Configuração Dinâmica:** Permite ajustar limiares de latência e intervalos de atualização via API, que são salvos no arquivo .env.

## **⚙️ Pré-requisitos**

Para replicar este ambiente, você precisará ter os seguintes softwares instalados em seu sistema:

1. **Node.js:** (Versão 14 ou superior, pois o projeto utiliza Módulos ES \- import/export).  
2. **NPM** (ou Yarn): Gerenciador de pacotes do Node.js.  
3. **traceroute:** O utilitário de linha de comando traceroute (ou tracert no Windows, embora o código use traceroute).  
* **Linux (Debian/Ubuntu):** sudo apt-get install traceroute  
* **Linux (RHEL/CentOS):** sudo yum install traceroute  
* **macOS (via Homebrew):** brew install traceroute

## 

## **🚀 Como Replicar a Aplicação**

Siga estes passos para configurar e executar a aplicação em um novo ambiente.

### **1\. Clonar o Repositório**

Obtenha os arquivos do projeto (ou copie-os para um novo diretório).

| git clone \<url-do-seu-repositorio\> cd traceroute-monitor |
| :---- |

### 

### **2\. Instalar Dependências**

Instale os pacotes Node.js necessários listados no package.json.

| npm install |
| :---- |

Isso instalará:

* cors  
* dotenv  
* express  
* node-cache

### **3\. Criar Estrutura de Diretórios de Dados**

A aplicação espera que uma estrutura de diretórios específica exista para salvar os alvos e o histórico. Crie-a na raiz do projeto:

| \# Cria o diretório 'data'  mkdir data   \# Cria o diretório para o histórico  mkdir \-p data/historico\_traceroute |
| :---- |

### 

### **4\. Criar Arquivos de Dados Iniciais**

A aplicação precisa que os arquivos de dados existam, mesmo que vazios.

| \# Crie o arquivo CSV de alvos (pode ser vazio) touch data/targets.csv \# Crie o arquivo JSON de histórico (deve ser um array vazio) echo "\[\]" \> data/historico\_traceroute/historico\_traceroute.json |
| :---- |

### 

### **5\. Configurar o Ambiente (.env)**

Crie um arquivo .env na raiz do projeto. Este arquivo é **essencial** para definir as configurações da aplicação.

Copie o exemplo abaixo para o seu arquivo .env:

| \# Configurações de Rede e Teste \# Limite (em ms) para considerar um salto como "lento" SLOW\_HOP\_THRESHOLD=25  \# Intervalo de atualização (em segundos) usado pela interface (não pela API) REFRESH\_INTERVAL=60   \# Portas do Servidor HTTP\_PORT=3055   \# Configuração de HTTPS (Opcional) \# Mude para 'true' para habilitar HTTPS ENABLE\_HTTPS=false HTTPS\_PORT=3056   \# Caminhos para os certificados SSL (obrigatório se ENABLE\_HTTPS=true) SSL\_CERT\_PATH=/caminho/para/seu/fullchain.pem SSL\_KEY\_PATH=/caminho/para/seu/privkey.pem |
| :---- |

## 

## **🏃 Como Executar a Aplicação**

Com as dependências instaladas e o .env configurado, você pode iniciar o servidor.

### **Para Produção**

O servidor será iniciado e permanecerá em execução.

| npm start |
| :---- |

### **Para Desenvolvimento**

O servidor será iniciado com o "watch mode" do Node.js, reiniciando automaticamente a cada alteração nos arquivos.

| npm run dev |
| :---- |

Após a execução, o servidor estará disponível (por padrão) em [http://localhost:3055](http://localhost:3055).

## 

## **📡 Documentação da API**

Todos os endpoints são prefixados com `/api`.

### **Gerenciamento de Alvos**

* `GET /api/targets`  
  * **Descrição:** Retorna a lista de todos os alvos monitorados.

**Resposta (200 OK)**

| {   "targets": \[     { "id": "google.com", "displayName": "Google", "target": "google.com", "isHighlighted": true }   \] } |
| :---- |

* `POST /api/targets`  
  * **Descrição:** Adiciona um novo alvo à lista (`targets.csv`).

**Corpo (JSON):**

| {   "displayName": "Cloudflare DNS",   "target": "1.1.1.1",   "isHighlighted": true } |
| :---- |

* **Resposta (201 Created):** `{ "message": "Alvo adicionado com sucesso!" }`  
* `DELETE /api/targets/:id`  
  * **Descrição:** Remove um alvo da lista. O `:id` deve ser o *target* (ex: `1.1.1.1`).  
  * **Resposta (200 OK):** `{ "message": "Alvo removido com sucesso!" }`  
* `PUT /api/targets/:id`  
  * **Descrição:** Atualiza um alvo existente. O `:id` é o *target* antigo.

**Corpo (JSON):**

| {   "displayName": "Cloudflare DNS (Novo)",   "target": "1.1.1.1",   "isHighlighted": false } |
| :---- |

* **Resposta (200 OK):** `{ "message": "Alvo atualizado com sucesso!" }`

### 

### **Configurações da Aplicação**

* `GET /api/settings`  
  * **Descrição:** Retorna as configurações atuais de `SLOW_HOP_THRESHOLD` e `REFRESH_INTERVAL` (lidas do `.env`).

**Resposta (200 OK):**

| {   "slowHopThreshold": 25,   "refreshInterval": 60 } |
| :---- |

* `POST /api/settings`  
  * **Descrição:** Atualiza as configurações. A API salva esses valores diretamente no arquivo `.env` na raiz do projeto.

**Corpo (JSON):**

| {   "slowHopThreshold": 50,   "refreshInterval": 120 } |
| :---- |

* **Resposta (200 OK):** `{ "message": "Configurações salvas com sucesso!" }`

### 

### **Execução e Histórico**

* `POST /api/traceroute/single`  
  * **Descrição:** Dispara um único teste `traceroute` sob demanda. Retorna o resultado completo, incluindo a análise do histórico.

**Corpo (JSON):**

| {   "target": "google.com",   "displayName": "Google",   "id": "googlecom",   "isHighlighted": true,   "slowHopThreshold": 25 } |
| :---- |

* **Resposta (200 OK \- Sucesso):** Retorna o objeto de resultado completo (com `success: true` e os dados do traceroute).  
  * **Resposta (200 OK \- Falha):** Retorna um objeto de resultado com `success: false` e uma mensagem de erro (ex: "Host desconhecido").  
      
* `GET /api/history/targets`  
  * **Descrição:** Retorna uma lista de alvos únicos que possuem dados salvos no arquivo de histórico (`historico_traceroute.json`).

**Resposta (200 OK):**

| \[   { "id": "google.com", "displayName": "Google", "target": "google.com" } \] |
| :---- |

* `GET /api/history/charts/:targetId/:type`  
  * **Descrição:** Retorna dados agregados e formatados para uso direto em bibliotecas de gráficos (como Chart.js).  
  * **Parâmetros da URL:**  
    * `:targetId`: O host a ser consultado (ex: `google.com`).  
    * `:type`: O tipo de agregação: `hourly` (dados das últimas 24h) ou `daily` (dados dos últimos 7 dias).

**Resposta (200 OK):**

| {   "success": true,   "title": "Médias por Hora (24h) \- Google",   "chartData": { ... (objeto de dados do Chart.js) ... },   "chartConfig": { "type": "line", ... } } |
| :---- |

* **Resposta (404 Not Found):** Ocorre se não houver histórico suficiente (menos de 2 registros) para gerar um gráfico.

## **Configurando como um Serviço no Debian (systemd)**

Para garantir que sua aplicação inicie automaticamente com o servidor e seja gerenciada de forma robusta (com reinicialização automática em caso de falhas), você pode configurá-la como um serviço systemd.

### **1\. Criar o Arquivo de Serviço**

Primeiro, crie um arquivo de definição de serviço para o systemd:

| sudo nano /etc/systemd/system/traceroute-monitor.service |
| :---- |

### **2\. Colar o Conteúdo do Serviço**

Cole o conteúdo abaixo no arquivo. **Lembre-se de alterar os campos User, Group e WorkingDirectory**:

| \[Unit\] Description=Monitor de Traceroute API Documentation=https://github.com/seu-usuario/seu-repositorio \# Opcional After=network.target   \[Service\] \# Mude 'seu\_usuario' para o usuário que executará a aplicação \# NÃO é recomendado usar 'root' User=seu\_usuario Group=seu\_usuario   \# Mude este caminho para o diretório RAIZ da sua aplicação WorkingDirectory=/caminho/completo/para/traceroute-monitor   \# Garante que o .env seja carregado Environment=NODE\_ENV=production   \# Comando para iniciar a aplicação \# 1\. Descubra o caminho do Node com: which node \# 2\. Substitua '/usr/bin/node' abaixo se for diferente ExecStart=/usr/bin/node api\_node.js   \# Política de reinicialização Restart=always RestartSec=10   \[Install\] WantedBy=multi-user.target |
| :---- |

Para encontrar o caminho do Node.js:  
Execute which node no seu terminal. O resultado (ex: /usr/bin/node ou /usr/local/bin/node) deve ser usado no campo ExecStart.

### **3\. Habilitar e Iniciar o Serviço**

Após salvar o arquivo, execute os seguintes comandos para gerenciar o serviço com systemctl:  
\# 1\. Recarregar o daemon do systemd para ler o novo arquivo

| sudo systemctl daemon-reload |
| :---- |

\# 2\. Habilitar o serviço (para iniciar automaticamente no boot)

| sudo systemctl enable traceroute-monitor.service |
| :---- |

\# 3\. Iniciar o serviço imediatamente

| sudo systemctl start traceroute-monitor.service |
| :---- |

### **4\. Gerenciando o Serviço**

Agora você pode usar os comandos systemctl padrão:

* **Verificar o status:**

| sudo systemctl status traceroute-monitor.service |
| :---- |


* **Parar o serviço:**

| sudo systemctl stop traceroute-monitor.service |
| :---- |


* **Reiniciar o serviço (após uma alteração, por exemplo):**

| sudo systemctl restart traceroute-monitor.service |
| :---- |

* **Ver os logs da aplicação em tempo real:**

| journalctl \-u traceroute-monitor.service \-f |
| :---- |

