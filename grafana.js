function loadCSS(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}


// Antes de usar ícones Font Awesome
loadCSS('font-awesome-css', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');

class TracerouteMonitor {
  constructor(panelElement) {
    this.panel = panelElement;
    this.apiUrl = "http://154.38.189.93:3055/api";
    this.tooltipData = {};
    this.editMode = { active: false, targetId: null };
    this.refreshIntervalId = null;
    this.previousResults = {};
    this.slowHopThreshold = 25;
    this.hourlyChart = null;
    this.dailyChart = null;
  }

async init() {
    console.log("Monitor: Iniciando...");
    
    // Etapa 1: Configuração básica (sem alteração)
    const configTemplate = this.panel.querySelector("#config-template");
    const configView = this.panel.querySelector("#config-view");
    if (configTemplate && configView) {
      configView.innerHTML = configTemplate.innerHTML;
    }
    this.cacheElements();
    this.attachEventListeners();
    
    // Etapa 2: Carregar configurações (como refresh e threshold)
    // A função loadSettings() foi modificada para NÃO iniciar o intervalo.
    const settings = await this.loadSettings(); 
    console.log("Monitor: Configurações carregadas.");

    // Etapa 3: Pré-carregar os dados das outras abas (mesmo ocultas)
    // Carrega a lista de alvos na aba "Configuração"
    await this.loadTargets();
    console.log("Monitor: Alvos da aba Configuração pré-carregados.");

    // Carrega os botões de alvo na aba "Histórico"
    await this.loadHistoryTargets();
    console.log("Monitor: Alvos da aba Histórico pré-carregados.");

    // Etapa 4: Agora sim, exibir o dashboard e disparar o PRIMEIRO teste
    this.switchTab("dashboard");
    console.log("Monitor: Aba Dashboard ativada, iniciando primeira execução dos testes.");

    // Etapa 5: Iniciar o intervalo de REFRESH (para execuções futuras)
    if (settings && settings.refreshRate > 0) {
        this.startInterval(settings.refreshRate);
        console.log(`Monitor: Intervalo de refresh iniciado (${settings.refreshRate}s).`);
    } else {
        console.log("Monitor: Intervalo de refresh desativado (0s).");
    }
  }

  cacheElements() {
    this.tabs = this.panel.querySelectorAll(".tab-btn");
    this.tabContents = this.panel.querySelectorAll(".tab-content");
    this.dashboardView = this.panel.querySelector("#dashboard-view");
    this.historyView = this.panel.querySelector("#history-view");
    this.historyTargetSelector = this.panel.querySelector(
      "#history-target-selector"
    );
    this.historyResults = this.panel.querySelector("#history-results");
    this.targetsList = this.panel.querySelector("#targets-list");
    this.addTargetBtn = this.panel.querySelector("#add-target-btn");
    this.cancelEditBtn = this.panel.querySelector("#cancel-edit-btn");
    this.displayNameInput = this.panel.querySelector("#displayName");
    this.targetInput = this.panel.querySelector("#target");
    this.highlightInput = this.panel.querySelector("#highlight-target");
    this.tooltip = this.panel.querySelector("#tooltip");
    this.refreshIntervalInput = this.panel.querySelector("#refresh-interval");
    this.slowHopInput = this.panel.querySelector("#slow-hop-threshold");
    this.saveSettingsBtn = this.panel.querySelector("#save-settings-btn");
    this.spotTestTargetInput = this.panel.querySelector("#spot-test-target");
    this.spotTestBtn = this.panel.querySelector("#spot-test-btn");
    this.spotTestResultPre = this.panel.querySelector("#spot-test-result");
    this.searchContainer = this.panel.querySelector(".search-container");
    this.searchInput = this.panel.querySelector("#global-search-filter");
    // --- ADICIONADO: Seleciona os wrappers dos gráficos ---
    this.hourlyChartWrapper = this.panel.querySelector("#hourly-chart")?.parentElement;
    this.dailyChartWrapper = this.panel.querySelector("#daily-chart")?.parentElement;
  }

  attachEventListeners() {
    if (this.addTargetBtn) {
      this.addTargetBtn.addEventListener("click", () => {
        this.editMode.active ? this.saveTargetChanges() : this.addTarget();
      });
    }
    if (this.cancelEditBtn) {
      this.cancelEditBtn.addEventListener("click", () => this.cancelEditMode());
    }
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener("click", () => this.saveSettings());
    }
    if (this.spotTestBtn) {
      this.spotTestBtn.addEventListener("click", () => this.runSpotTest());
    }
    if (this.spotTestTargetInput) {
      this.spotTestTargetInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.runSpotTest();
        }
      });
    }

    // --- CORREÇÃO: Movido para fora do "if (this.spotTestTargetInput)" ---
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => this.filterContent());
    }
    // --- FIM DA CORREÇÃO ---

    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    this.panel.addEventListener("mouseover", (e) => {
      // Ajuste para lidar com o 'i' dentro do 'div'
      const infoIcon = e.target.closest(".info-icon");
      if (infoIcon) {
        this.showTooltip(infoIcon, e); // Passa o 'div' e o evento
      }
    });
    this.panel.addEventListener("mouseout", (e) => {
      const infoIcon = e.target.closest(".info-icon");
      if (infoIcon) {
        this.hideTooltip();
      }
    });
    document.addEventListener("mousemove", (e) =>
      this.updateTooltipPosition(e)
    );

    // --- ADICIONADO: Listeners para o tooltip customizado nos gráficos ---
    if (this.hourlyChartWrapper) {
      // Usamos 'mousemove' para pegar o 'event' e atualizar a posição
      this.hourlyChartWrapper.addEventListener("mousemove", (e) => this.showChartTooltip(e));
      this.hourlyChartWrapper.addEventListener("mouseout", () => this.hideTooltip());
    }
    if (this.dailyChartWrapper) {
      this.dailyChartWrapper.addEventListener("mousemove", (e) => this.showChartTooltip(e));
      this.dailyChartWrapper.addEventListener("mouseout", () => this.hideTooltip());
    }
  }

switchTab(tabName) {
    this.tabs.forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.tab === tabName)
    );
    this.tabContents.forEach((content) => {
      content.classList.toggle("active", content.id.includes(tabName));
    });

    // --- MUDANÇA 1: Lógica da Busca (sem alteração, apenas mantida) ---
    if (this.searchContainer && this.searchInput) {
      // Mostra ou esconde o campo de busca dependendo da aba
      if (tabName === "dashboard" || tabName === "history" || tabName === "config") {
        this.searchContainer.style.display = "block";
        // Limpa a busca e re-aplica o filtro ao trocar de aba
        this.searchInput.value = "";
        this.filterContent();
      } else {
        this.searchContainer.style.display = "none";
      }
    }
    // --- FIM DA CORREÇÃO ---

    // --- MUDANÇA 2: Carregamento sob demanda ---
    // Agora o switchTab decide qual conteúdo carregar.
    if (tabName === "dashboard") this.runAllTests();
    if (tabName === "config") this.loadTargets();
    if (tabName === "history") this.loadHistoryTargets();
  }

  updateTooltipPosition(event) {
    if (!this.tooltip || this.tooltip.style.display !== "block") {
      return;
    }
    const padding = 15;
    let newLeft = event.clientX + padding;
    let newTop = event.clientY + padding;
    requestAnimationFrame(() => {
      const tooltipWidth = this.tooltip.offsetWidth;
      const tooltipHeight = this.tooltip.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (newLeft + tooltipWidth > viewportWidth) {
        newLeft = event.clientX - tooltipWidth - padding;
      }
      if (newTop + tooltipHeight > viewportHeight) {
        newTop = event.clientY - tooltipHeight - padding;
      }
      if (newLeft < 0) newLeft = padding;
      if (newTop < 0) newTop = padding;
      this.tooltip.style.left = `${newLeft}px`;
      this.tooltip.style.top = `${newTop}px`;
    });
  }

  async apiFetch(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, options);
      // Tente sempre retornar JSON; em caso de erro, trate respostas não‑JSON
      if (!response.ok) {
        let message = `Erro ${response.status}`;
        try {
          const errorData = await response.json();
          message = errorData?.error || message;
        } catch (_) {
          const text = await response.text();
          message = text || message;
        }
        throw new Error(message);
      }
      // Em sucesso, valide se é JSON; se não for, tente texto
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      } else {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch (_) {
          console.error(`Resposta não JSON para ${endpoint}:`, text);
          return null;
        }
      }
    } catch (error) {
      console.error(`❌ Erro na API para ${endpoint}:`, error);
      return null;
    }
  }

async loadSettings() {
    const settings = await this.apiFetch("/settings");
    let refreshRate = 0; // Padrão
    
    if (settings) {
      this.slowHopThreshold = parseInt(settings.slowHopThreshold, 10);
      this.slowHopInput.value = this.slowHopThreshold;
      refreshRate = parseInt(settings.refreshInterval, 10);
      this.refreshIntervalInput.value = refreshRate;
      
      // REMOVIDO: this.startInterval(refreshRate); 
      // O intervalo agora é iniciado no final da função init()
      
      // Retorna as configurações para o init()
      return { refreshRate: refreshRate, slowHopThreshold: this.slowHopThreshold };
    } else {
      // Valores padrão se a API falhar
      this.slowHopInput.value = this.slowHopThreshold;
      this.refreshIntervalInput.value = 0;
      return { refreshRate: 0, slowHopThreshold: this.slowHopThreshold };
    }
  }

  async saveSettings() {
    const newRate = parseInt(this.refreshIntervalInput.value, 10);
    const newThreshold = parseInt(this.slowHopInput.value, 10);
    if (
      isNaN(newRate) ||
      newRate < 0 ||
      isNaN(newThreshold) ||
      newThreshold <= 0
    ) {
      alert("Por favor, insira valores numéricos válidos.");
      return;
    }
    const response = await this.apiFetch("/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshInterval: newRate,
        slowHopThreshold: newThreshold,
      }),
    });
    if (response) {
      this.slowHopThreshold = newThreshold;
      this.startInterval(newRate);
      alert("Configurações salvas no servidor!");
      this.runAllTests();
    } else {
      alert("Falha ao salvar configurações no servidor.");
    }
  }

  startInterval(rateInSeconds) {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
    if (rateInSeconds > 0) {
      this.refreshIntervalId = setInterval(() => {
        this.runAllTests(true);
      }, rateInSeconds * 1000);
    }
  }

async runAllTests(isBackgroundRefresh = false) {
    if (!this.dashboardView) return;
    const isDashboardActive = this.dashboardView.classList.contains("active");

    // Lógica de Refresh (sem mudanças)
    if (isBackgroundRefresh && !isDashboardActive) {
      const targets = await this.apiFetch("/targets");
      if (!targets) return;
      targets.forEach((target) => {
        target.slowHopThreshold = this.slowHopThreshold;
        this.apiFetch("/traceroute/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        }).then((result) => {
          if (result) this.previousResults[result.id] = result;
        });
      });
      return;
    }

    const targets = await this.apiFetch("/targets");
    if (!targets || targets.length === 0) {
      this.dashboardView.innerHTML = "<p>Nenhum alvo configurado.</p>";
      return;
    }

    // Criação dos Cards (sem mudanças)
    this.dashboardView.innerHTML = "";
    targets.forEach((t) => {
      const safeId = t.target.replace(/[^a-zA-Z0-9]/g, "");
      let cardElement = document.createElement("div");
      cardElement.id = `card-${safeId}`;
      this.dashboardView.appendChild(cardElement);
      cardElement.className = "card loading";
      const iconClass = this.getIconForTarget(t.displayName);
      cardElement.innerHTML = `<div class="card-header"><div class="logo-container"><i class="${iconClass}"></i><div class="loading-circle"></div></div><div class="card-header-text"><h3>${t.displayName}</h3><small>${t.target}</small></div></div><div style="text-align: center; font-size: 12px; color: var(--text-secondary-color); margin-top: 10px;">Executando...</div>`;
    });

    // --- Lógica da Fila (Queue) ---

    // 1. Limite de concorrência. 
    // MANTEMOS EM 2 para evitar o Erro 500 do servidor.
    const concurrencyLimit = 20;

    const queue = [...targets];

    // 3. Função "worker" que processa a fila
    const processNext = async () => {
      if (queue.length === 0) {
        return; // Fila vazia, termina.
      }

      // Pega o próximo alvo
      const target = queue.shift();
      target.slowHopThreshold = this.slowHopThreshold;

      
      // --- INÍCIO DA MUDANÇA (Corrigir Card "Preso") ---

      // Tenta executar o teste
      const result = await this.apiFetch("/traceroute/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });

      if (result) {
        // Caminho 1: Sucesso (ou falha controlada)
        // O servidor respondeu (ex: { success: true } ou { success: false })
        this.updateSingleCard(result);
      } else {
        // Caminho 2: Falha Crítica (apiFetch retornou null)
        // Ex: Erro 500, timeout, ou falha de rede.
        // O card está "preso". Vamos criar um objeto de erro manual.
        
        const safeId = target.target.replace(/[^a-zA-Z0-9]/g, "");
        const errorResult = {
          id: safeId,
          displayName: target.displayName,
          target: target.target,
          success: false,
          error: "Falha na execução do teste, valide o DNS", // Mensagem de erro
          isHighlighted: target.isHighlighted // Para manter o CSS de destaque
        };
        
        // Agora atualizamos o card com o objeto de falha
        this.updateSingleCard(errorResult);
      }
      
      // --- FIM DA MUDANÇA ---


      // Chama-se a si mesmo para processar o próximo item da fila
      await processNext();
    };

    // 4. Inicia o "pool" de workers (Inicia 2 workers)
    const workerPool = [];
    for (let i = 0; i < concurrencyLimit; i++) {
      workerPool.push(processNext());
    }

    await Promise.all(workerPool);
  }

  // --- 🎨 ÁREA DE EDIÇÃO DE ÍCONES ---
  getIconForTarget(displayName) {
    const name = displayName.toLowerCase();

    if (name.includes("google")) return "fa-brands fa-google";
    if (name.includes("facebook")) return "fa-brands fa-facebook";
    if (name.includes("youtube")) return "fa-brands fa-youtube";
    if (name.includes("aws") || name.includes("amazon")) return "fa-brands fa-aws";
    if (name.includes("cloudflare")) return "fa-brands fa-cloudflare";
    if (name.includes("instagram")) return "fa-brands fa-instagram";
    if (name.includes("netflix")) return "fa-solid fa-film"; // Ícone 'fa-brands fa-netflix' é PRO
    if (name.includes("disney")) return "fa-solid fa-wand-magic-sparkles"; // Ícone 'fa-brands fa-disney' é PRO
    if (name.includes("uol")) return "fa-solid fa-globe";
    if (name.includes("discord")) return "fa-brands fa-discord";
    if (name.includes("microsoft")) return "fa-brands fa-microsoft";
    if (name.includes("tiktok")) return "fa-brands fa-tiktok";
    if (name.includes("spotify")) return "fa-brands fa-spotify";
    if (name.includes("prime video")) return "fa-brands fa-amazon";
    if (name.includes("akamai")) return "fa-solid fa-globe";




    // Ícone Padrão
    return "fa-solid fa-network-wired";
  }
  // --- FIM DA ÁREA DE EDIÇÃO ---


  updateSingleCard(result) {
    const cardElement = this.panel.querySelector(`#card-${result.id}`);
    if (!cardElement) return;
    if (result.isHighlighted) {
      cardElement.classList.add("highlighted");
    } else {
      cardElement.classList.remove("highlighted");
    }
    const previous = this.previousResults[result.id];
    let hopChange = 0;
    if (
      previous &&
      previous.success &&
      result.success &&
      previous.data &&
      result.data
    ) {
      hopChange = result.data.totalHops - previous.data.totalHops;
    }
    this.previousResults[result.id] = result;
    cardElement.classList.remove("loading");
    const iconClass = this.getIconForTarget(result.displayName);
    let cardHTML = "";
    if (result.success && result.data) {
      const data = result.data;
      this.tooltipData[result.id] = { ...data, hopChange };
      let hopChangeIndicator = "";
      if (hopChange > 0) {
        hopChangeIndicator = `<span class="hop-change increase"><i class="fa-solid fa-arrow-up"></i></span>`;
      } else if (hopChange < 0) {
        hopChangeIndicator = `<span class="hop-change decrease"><i class="fa-solid fa-arrow-down"></i></span>`;
      }
      const analysis = result.analysis;
      let analysisHTML = "";
      if (analysis) {
        const formatChange = (change) =>
          change === null ? "N/A" : change > 0 ? `+${change}` : change;

        const routeChangedText = analysis.routeChanged
          ? `<span class="value danger">Sim</span>`
          : '<span class="value">Não</span>';

        analysisHTML = `<div class="analysis-group"><div class="analysis-item"><span>Mudança de Rota:</span> ${routeChangedText}</div><div class="analysis-item"><span>Variação Saltos (24h):</span> <span class="value">${formatChange(
          analysis.hopChangeD
        )}</span></div><div class="analysis-item"><span>Variação Saltos (7d):</span> <span class="value">${formatChange(
          analysis.hopChange7D
        )}</span></div></div>`;
      }

      // --- HTML do Ícone 'i' CORRIGIDO ---
      cardHTML = `<div class="card-header"><div class="logo-container"><i class="${iconClass}"></i></div><div class="card-header-text"><h3>${result.displayName
        }</h3><small>${result.target
        }</small></div><div class="info-icon" data-id="${result.id
        }"><i class="fa-solid fa-info"></i></div></div><div class="card-body"><div class="metric-group"><div class="metric"><div class="value">${data.totalHops
        }${hopChangeIndicator}</div><div class="label">Saltos</div></div><div class="metric"><div class="value">${data.slowHopsCount
        }</div><div class="label">> ${this.slowHopThreshold
        }ms</div></div></div><div class="metric-group latency-group"><div class="metric"><div class="value">${data.fastestHop.toFixed(
          3
        )}</div><div class="label">Rápido (ms)</div></div><div class="metric"><div class="value">${data.slowestHop.toFixed(
          3
        )}</div><div class="label">Lento (ms)</div></div></div></div>${analysisHTML}`;
      // --- FIM DA CORREÇÃO ---

    } else {
      cardHTML = `<div class="card-header"><div class="logo-container"><i class="${iconClass}"></i></div><div class="card-header-text"><h3>${result.displayName
        }</h3><small>${result.target
        }</small></div></div><div style="text-align: center; font-size: 12px; color: #e54646; margin-top: 10px;">Falha: ${result.error || "Dados inválidos"
        }</div>`;
    }
    cardElement.innerHTML = cardHTML;
  }

  async loadTargets() {
    if (!this.targetsList) return;
    const targets = await this.apiFetch("/targets");
    if (!targets) {
      this.targetsList.innerHTML = "<p>Erro ao carregar alvos.</p>";
      return;
    }
    if (targets.length === 0) {
      this.targetsList.innerHTML = "<p>Nenhum alvo configurado.</p>";
      return;
    }
    let tableHTML = `<table><thead><tr><th>Nome</th><th>Alvo</th><th style="text-align: right;">Ações</th></tr></thead><tbody>`;
    targets.forEach((t) => {
      const targetInfo = JSON.stringify(t).replace(/"/g, "'");
      tableHTML += `<tr data-target-info="${targetInfo}"><td>${t.displayName}</td><td>${t.target}</td><td class="actions"><button class="edit-btn"><i class="fa-solid fa-pencil"></i></button><button class="delete-btn" data-id="${t.id}"><i class="fa-solid fa-trash-can"></i></button></td></tr>`;
    });
    tableHTML += "</tbody></table>";
    this.targetsList.innerHTML = tableHTML;
    this.targetsList.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteTarget(e.currentTarget.dataset.id);
      });
    });
    this.targetsList.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetJson = e.currentTarget
          .closest("tr")
          .dataset.targetInfo.replace(/'/g, '"');
        const targetInfo = JSON.parse(targetJson);
        this.setEditMode(targetInfo);
      });
    });
  }

  setEditMode(target) {
    this.editMode.active = true;
    this.editMode.targetId = target.id;
    this.displayNameInput.value = target.displayName;
    this.targetInput.value = target.target;
    this.highlightInput.checked = target.isHighlighted;
    this.addTargetBtn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
    this.cancelEditBtn.style.display = "inline-block";
    this.displayNameInput.focus();
  }

  cancelEditMode() {
    this.editMode.active = false;
    this.editMode.targetId = null;
    this.displayNameInput.value = "";
    this.targetInput.value = "";
    this.highlightInput.checked = false;
    this.addTargetBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
    this.cancelEditBtn.style.display = "none";
  }

  async addTarget() {
    const displayName = this.displayNameInput.value.trim();
    const target = this.targetInput.value.trim();
    const isHighlighted = this.highlightInput.checked;
    if (!displayName || !target) {
      alert("Preencha ambos os campos.");
      return;
    }
    const response = await this.apiFetch("/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, target, isHighlighted }),
    });
    if (response) {
      this.cancelEditMode();
      this.loadTargets();
    }
  }

  async saveTargetChanges() {
    const displayName = this.displayNameInput.value.trim();
    const target = this.targetInput.value.trim();
    const isHighlighted = this.highlightInput.checked;
    if (!displayName || !target) {
      alert("Preencha ambos os campos.");
      return;
    }
    const response = await this.apiFetch(`/targets/${this.editMode.targetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, target, isHighlighted }),
    });
    if (response) {
      this.cancelEditMode();
      this.loadTargets();
    }
  }

  async deleteTarget(id) {
    if (confirm("Tem certeza que deseja excluir este alvo?")) {
      const response = await this.apiFetch(`/targets/${id}`, {
        method: "DELETE",
      });
      if (response) this.loadTargets();
    }
  }

  async runSpotTest() {
    const target = this.spotTestTargetInput.value.trim();
    if (!target) {
      alert("Por favor, insira um alvo.");
      return;
    }
    this.spotTestResultPre.innerHTML = "Executando teste...";
    const body = {
      target: target,
      displayName: target,
      id: target.replace(/[^a-zA-Z0-9]/g, ""),
      slowHopThreshold: this.slowHopThreshold,
    };
    const result = await this.apiFetch("/traceroute/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result && result.success) {

      let output = `--- Resultado para ${target} ---\n\n`;

      // Define os tamanhos das colunas
      const hopWidth = 5;
      const latencyWidth = 15; // Alterado para 15

      // Cria o Cabeçalho
      let headerHop = "Salto".padStart(hopWidth);
      let headerLatency = "Latência (ms)".padStart(latencyWidth);
      let headerIp = "IP"; // IP é a última coluna, não precisa de pad
      output += `${headerHop} | ${headerLatency} | ${headerIp}\n`;

      // Cria a Linha de separação
      let lineHop = "-".repeat(hopWidth);
      let lineLatency = "-".repeat(latencyWidth);
      let lineIp = "-".repeat(25); // Linha fixa para a coluna de IP (pode ajustar)
      output += `${lineHop}-|-{lineLatency}-|-${lineIp}\n`;

      // Adiciona as Linhas de Dados
      result.data.detailedHops.forEach((hop) => {
        let hopStr = String(hop.hop).padStart(hopWidth);
        let latencyStr = hop.latency.toFixed(2).padStart(latencyWidth);
        output += `${hopStr} | ${latencyStr} | ${hop.ip}\n`;
      });

      this.spotTestResultPre.innerHTML = output;
    } else {
      this.spotTestResultPre.innerHTML = `Falha no teste para ${target}.\nErro: ${result ? result.error : "Desconhecido"
        }`;
    }
  }

  /**
   * Função principal que direciona a filtragem para a aba ativa.
   */
  filterContent() {
    // --- Adicionada verificação para não quebrar ---
    if (!this.searchInput) return;

    const filterText = this.searchInput.value.toLowerCase();

    // Descobre qual aba está ativa
    let activeTabName = null;
    this.tabs.forEach(tab => {
      if (tab.classList.contains("active")) {
        activeTabName = tab.dataset.tab;
      }
    });

    if (activeTabName === "dashboard") {
      this.filterDashboard(filterText);
    } else if (activeTabName === "history") {
      this.filterHistory(filterText);
    } else if (activeTabName === "config") {
      this.filterConfig(filterText);
    }
  }

  /**
   * Filtra os cards da aba Dashboard.
   */
  filterDashboard(filterText) {
    if (!this.dashboardView) return;
    const cards = this.dashboardView.querySelectorAll(".card");
    cards.forEach(card => {
      const displayName = card.querySelector(".card-header-text h3")?.textContent.toLowerCase() || "";
      const targetName = card.querySelector(".card-header-text small")?.textContent.toLowerCase() || "";

      // Verifica se o nome ou o alvo (IP/DNS) batem com o filtro
      if (displayName.includes(filterText) || targetName.includes(filterText)) {
        card.style.display = "flex"; // "flex" é o display original do card
      } else {
        card.style.display = "none";
      }
    });
  }

  /**
   * Filtra os botões de seleção da aba Histórico.
   */
  filterHistory(filterText) {
    if (!this.historyTargetSelector) return;
    const buttons = this.historyTargetSelector.querySelectorAll(".target-btn");
    buttons.forEach(btn => {
      const displayName = btn.textContent.toLowerCase();

      if (displayName.includes(filterText)) {
        btn.style.display = ""; // Reseta para o padrão (inline-block)
      } else {
        btn.style.display = "none";
      }
    });
  }

  /**
   * Filtra a tabela de Alvos Atuais na aba Configuração.
   */
  filterConfig(filterText) {
    if (!this.targetsList) return;
    const rows = this.targetsList.querySelectorAll("tbody tr");
    rows.forEach(row => {
      // Pega o texto da célula 0 (Nome) e 1 (Alvo)
      const displayName = row.cells[0]?.textContent.toLowerCase() || "";
      const targetName = row.cells[1]?.textContent.toLowerCase() || "";

      if (displayName.includes(filterText) || targetName.includes(filterText)) {
        row.style.display = ""; // Reseta para o padrão (table-row)
      } else {
        row.style.display = "none";
      }
    });
  }


  // --- FUNÇÃO CORRIGIDA (Tooltip e Posição) ---
  showTooltip(element, event) { // Recebe o elemento (div) e o evento (mouse)
    if (!this.tooltip) return;
    const id = element.dataset.id; // Pega o ID do 'div.info-icon'
    const data = this.tooltipData[id];

    if (!data || !data.detailedHops || data.detailedHops.length === 0) {
      this.tooltip.innerHTML = "<span>Nenhum dado de salto disponível.</span>";
    } else {
      let tooltipContent =
        "Salto | Latência (ms) | IP\n-----------------------------------\n";
      data.detailedHops.forEach((hop) => {
        const hopLine = `${String(hop.hop).padStart(5)} | ${hop.latency
          .toFixed(2)
          .padStart(12)} | ${hop.ip}\n`;
        tooltipContent += hop.isSlow ?
          `<span class="slow-hop">${hopLine}</span>` :
          hopLine;
      });
      if (data.hopChange && data.hopChange !== 0) {
        const sign = data.hopChange > 0 ? "+" : "";
        const changeClass = data.hopChange > 0 ? "increase" : "decrease";
        const variationText = `Variação: ${sign}${data.hopChange} salto(s)`;
        tooltipContent += `\n<span class="hop-change ${changeClass}">${variationText}</span>`;
      }
      // CORREÇÃO: Adiciona o conteúdo ao tooltip
      this.tooltip.innerHTML = tooltipContent;
    }

    this.tooltip.style.display = "block";
    // CORREÇÃO: Define a posição inicial
    this.updateTooltipPosition(event);
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.style.display = "none";
  }

  // --- ADICIONADO: Nova função para o tooltip do gráfico ---
  showChartTooltip(event) {
    if (!this.tooltip) return;
    const target = event.target;
    let tooltipText = null;

    // Verifica se está sobre um <rect> ou <circle> que tenha um <title>
    if ((target.tagName === 'rect' || target.tagName === 'circle') && target.querySelector('title')) {
      tooltipText = target.querySelector('title').textContent;
    }

    if (tooltipText) {
      // Evita atualizar o DOM desnecessariamente se o texto for o mesmo
      if (this.tooltip.innerHTML !== `<span>${tooltipText}</span>`) {
        this.tooltip.innerHTML = `<span>${tooltipText}</span>`;
      }
      this.tooltip.style.display = "block";
      // Não precisa chamar updateTooltipPosition, o listener global já faz isso
    } else {
      // Esconde se o mouse estiver sobre o fundo do gráfico, mas não sobre uma barra/ponto
      this.hideTooltip();
    }
  }

async loadHistoryTargets() {
    this.historyTargetSelector.innerHTML = "Carregando...";

    // Limpar gráficos anteriores
    this.hourlyChart = null;
    this.dailyChart = null;

    const chartContainer = this.panel.querySelector(
      "#history-view .chart-container"
    );
    if (chartContainer) chartContainer.style.display = "none";

    // --- CORREÇÃO INICIA AQUI ---

    // 1. Buscar TODOS os alvos ATUAIS. Esta é a nossa fonte da verdade.
    const currentTargets = await this.apiFetch("/targets");

    if (!currentTargets) {
      this.historyTargetSelector.innerHTML = "Erro ao carregar alvos.";
      return;
    }

    // 2. Filtrar a lista para pegar APENAS os que estão marcados para histórico.
    const highlightedTargets = currentTargets.filter(
      (target) => target.isHighlighted === true
    );

    // 3. Verificar se há alvos marcados para histórico
    if (highlightedTargets.length === 0) {
      this.historyTargetSelector.innerHTML = "Nenhum alvo está marcado para histórico na aba de Configuração.";
      return;
    }

    // 4. Limpar o seletor e construir os botões a partir da lista FILTRADA
    this.historyTargetSelector.innerHTML = "";

    highlightedTargets.forEach((target) => {
      const btn = document.createElement("button");
      btn.className = "target-btn";
      btn.textContent = target.displayName; // Usa o nome atual
      btn.dataset.targetId = target.id;     // Usa o ID atual

      btn.addEventListener("click", () => {
        this.historyTargetSelector
          .querySelectorAll(".target-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        
        // A função de carregar o gráfico continua a mesma
        this.loadHistoryForTarget(target.id); 
      });
      this.historyTargetSelector.appendChild(btn);
    });

    // 5. Clicar no primeiro botão da lista FILTRADA
    if (this.historyTargetSelector.querySelector(".target-btn")) {
      this.historyTargetSelector.querySelector(".target-btn").click();
    }
    
    // --- FIM DA CORREÇÃO ---
  }

  async loadHistoryForTarget(targetId) {
    // Limpar gráficos anteriores
    this.hourlyChart = null;
    this.dailyChart = null;

    const chartContainer = this.panel.querySelector(
      "#history-view .chart-container"
    );
    if (!chartContainer) return;

    // Buscar dados horários e diários separadamente
    const hourlyResponse = await this.apiFetch(
      `/history/charts/${targetId}/hourly`
    );
    const dailyResponse = await this.apiFetch(
      `/history/charts/${targetId}/daily`
    );

    if (
      !hourlyResponse ||
      !dailyResponse ||
      !hourlyResponse.success ||
      !dailyResponse.success
    ) {
      chartContainer.style.display = "none";
      chartContainer.innerHTML =
        '<p style="color:red;">Erro ao carregar dados do histórico.</p>';
      return;
    }

    const hourlyData = hourlyResponse.chartData;
    const dailyData = dailyResponse.chartData;

    chartContainer.style.display = "grid";

    // Gerar gráfico SVG para dados horários
    const hourlyEl = this.panel.querySelector("#hourly-chart");
    if (!hourlyEl || !hourlyEl.parentElement) {
      console.warn("Contêiner do gráfico horário não encontrado.");
      chartContainer.style.display = "none";
      chartContainer.innerHTML = '<p style="color:red;">Falha ao montar o gráfico horário.</p>';
      return;
    }
    const hourlyContainer = hourlyEl.parentElement;
    hourlyContainer.innerHTML = `
      <h3>${hourlyResponse.title || "Médias por Hora (24h)"}</h3>
      <div id="hourly-chart">${this.createSVGChart(hourlyData, "hourly")}</div>
    `;

    // Gerar gráfico SVG para dados diários
    const dailyEl = this.panel.querySelector("#daily-chart");
    if (!dailyEl || !dailyEl.parentElement) {
      console.warn("Contêiner do gráfico diário não encontrado.");
      chartContainer.style.display = "none";
      chartContainer.innerHTML = '<p style="color:red;">Falha ao montar o gráfico diário.</p>';
      return;
    }
    const dailyContainer = dailyEl.parentElement;
    dailyContainer.innerHTML = `
      <h3>${dailyResponse.title || "Métricas por Dia (7d)"}</h3>
      <div id="daily-chart">${this.createSVGChart(dailyData, "daily")}</div>
    `;

    // --- ADICIONADO: Re-seleciona os wrappers e re-adiciona os listeners ---
    // (Precisa fazer isso DEPOIS que o innerHTML é atualizado)
    this.hourlyChartWrapper = this.panel.querySelector("#hourly-chart");
    this.dailyChartWrapper = this.panel.querySelector("#daily-chart");

    if (this.hourlyChartWrapper) {
      this.hourlyChartWrapper.addEventListener("mousemove", (e) => this.showChartTooltip(e));
      this.hourlyChartWrapper.addEventListener("mouseout", () => this.hideTooltip());
    }
    if (this.dailyChartWrapper) {
      this.dailyChartWrapper.addEventListener("mousemove", (e) => this.showChartTooltip(e));
      this.dailyChartWrapper.addEventListener("mouseout", () => this.hideTooltip());
    }
  }

  createSVGChart(chartData, type) {
    if (!chartData || !chartData.labels || !chartData.datasets) {
      return '<p style="color: #FFFFFF;">Sem dados para exibir</p>'; // ATUALIZADO
    }

    // Decidir tipo de gráfico baseado no parâmetro type
    if (type === "hourly") {
      return this.createLineChart(chartData, type);
    } else {
      return this.createBarChart(chartData, type);
    }
  }

  // --- GRÁFICO DE LINHA ATUALIZADO ---
  createLineChart(chartData, type) {
    const width = 520;
    const height = 320;
    const padding = { top: 20, right: 50, bottom: 70, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const labels = chartData.labels;
    const datasets = chartData.datasets;

    let allValues = [];
    datasets.forEach((dataset) => {
      if (dataset.data) {
        allValues = allValues.concat(
          dataset.data.filter((v) => v !== null && v !== undefined && !isNaN(v))
        );
      }
    });

    if (allValues.length === 0) {
      return '<p style="color: #FFFFFF;">Sem dados válidos para exibir</p>'; // ATUALIZADO
    }

    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);
    const valueRange = Math.max(maxValue - minValue, 1);

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: transparent; font-family: inherit;">`;

    // Grid lines horizontais (Branco com opacidade)
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight * i) / gridLines;
      svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth
        }" y2="${y}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.5"/>`; // ATUALIZADO

      // Rótulos do eixo Y (Branco)
      const value = maxValue - (valueRange * i) / gridLines;
      svg += `<text x="${padding.left - 10}" y="${y + 4
        }" fill="#FFFFFF" text-anchor="end" font-size="11">${value.toFixed( // ATUALIZADO
          0
        )}</text>`;
    }

    // Grid lines verticais (Branco com opacidade)
    for (let i = 0; i < labels.length; i++) {
      const x =
        labels.length > 1
          ? padding.left + (i * chartWidth) / (labels.length - 1)
          : padding.left + chartWidth / 2;
      svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + chartHeight
        }" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.2" opacity="0.5"/>`; // ATUALIZADO
    }

    // Eixos (Branco)
    svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left
      }" y2="${padding.top + chartHeight}" stroke="#FFFFFF" stroke-width="1"/>`; // ATUALIZADO
    svg += `<line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth
      }" y2="${padding.top + chartHeight}" stroke="#FFFFFF" stroke-width="1"/>`; // ATUALIZADO

    const colors = ["#e54646", "#28a745", "#33a2e5", "#ffc107", "#6f42c1"];

    datasets.forEach((dataset, datasetIndex) => {
      const color =
        dataset.backgroundColor || colors[datasetIndex % colors.length];
      let pathData = "";
      let points = [];

      labels.forEach((label, index) => {
        const value = dataset.data[index];
        if (value !== null && value !== undefined && !isNaN(value)) {
          const x =
            labels.length > 1
              ? padding.left + (index * chartWidth) / (labels.length - 1)
              : padding.left + chartWidth / 2;
          const normalizedValue = Math.max((value - minValue) / valueRange, 0);
          const y = padding.top + chartHeight - normalizedValue * chartHeight;

          points.push({ x, y, value, label });

          if (pathData === "") {
            pathData = `M ${x} ${y}`;
          } else {
            pathData += ` L ${x} ${y}`;
          }
        }
      });

      if (pathData) {
        svg += `<path d="${pathData}" stroke="${color}" stroke-width="2" fill="none" opacity="0.8"/>`;
      }

      points.forEach((point) => {
        svg += `<circle cx="${point.x}" cy="${point.y
          }" r="4" fill="${color}" opacity="0.9" stroke="white" stroke-width="1">
                    <title>Média da ${dataset.label || "Dados"} na hora ${point.label
          }: ${point.value}${dataset.label && dataset.label.includes("Latência") ? "ms" : ""
          }</title>
                  </circle>`;
      });
    });

    // Rótulos do eixo X (Branco, Reto e ESPAÇADO)
    labels.forEach((label, index) => {
      // --- MUDANÇA: Mostrar apenas labels pares (00h, 02h, 04h...) ---
      if (index % 2 === 0) {
        const x =
          labels.length > 1
            ? padding.left + (index * chartWidth) / (labels.length - 1)
            : padding.left + chartWidth / 2;
        const y = padding.top + chartHeight + 20;

        svg += `<text x="${x}" y="${y}" fill="#FFFFFF" text-anchor="middle" font-size="10">${label}</text>`; // ATUALIZADO
      }
    });

    // Legenda (Branco, 5% do final, BOLD)
    let legendStartY = height * 0.95; // Posição 5% do final (95% do topo)
    const legendItemWidth = Math.min(200, chartWidth / datasets.length);

    datasets.forEach((dataset, index) => {
      const legendX = padding.left + index * legendItemWidth;
      const color = dataset.backgroundColor || colors[index % colors.length];

      // 1. AGORA SÓ DESENHA O CÍRCULO (r="6" é maior que r="2")
      svg += `<circle cx="${legendX + 6}" cy="${legendStartY}" r="6" fill="${color}" opacity="0.8"/>`;

      // 2. E ALINHA O TEXTO COM O CÍRCULO (y="${legendStartY + 4}")
      svg += `<text x="${legendX + 18
        }" y="${legendStartY + 4}" fill="#FFFFFF" font-size="11" font-weight="bold">${dataset.label || `Dataset ${index + 1}`
        }</text>`;
    });

    svg += "</svg>";
    return svg;
  }

  // --- GRÁFICO DE BARRA ATUALIZADO ---
  createBarChart(chartData, type) {
    const width = 520;
    const height = 320;
    const padding = { top: 20, right: 50, bottom: 70, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const labels = chartData.labels;
    const datasets = chartData.datasets;

    let allValues = [];
    datasets.forEach((dataset) => {
      if (dataset.data) {
        allValues = allValues.concat(
          dataset.data.filter((v) => v !== null && v !== undefined && !isNaN(v))
        );
      }
    });

    if (allValues.length === 0) {
      return '<p style="color: #FFFFFF;">Sem dados válidos para exibir</p>'; // ATUALIZADO
    }

    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);
    const valueRange = Math.max(maxValue - minValue, 1);

    const barGroupWidth = chartWidth / labels.length;
    const barWidth = Math.max(barGroupWidth / datasets.length - 2, 8);

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: transparent; font-family: inherit;">`;

    // Grid lines horizontais (Branco com opacidade)
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight * i) / gridLines;
      svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth
        }" y2="${y}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.5"/>`; // ATUALIZADO

      // Rótulos do eixo Y (Branco)
      const value = maxValue - (valueRange * i) / gridLines;
      svg += `<text x="${padding.left - 10}" y="${y + 4
        }" fill="#FFFFFF" text-anchor="end" font-size="11">${value.toFixed( // ATUALIZADO
          0
        )}</text>`;
    }

    // Grid lines verticais (opcional) (Branco com opacidade)
    for (let i = 0; i < labels.length; i++) {
      const x = padding.left + i * barGroupWidth + barGroupWidth / 2;
      svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + chartHeight
        }" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.2" opacity="0.5"/>`; // ATUALIZADO
    }

    // Eixos (Branco)
    svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left
      }" y2="${padding.top + chartHeight}" stroke="#FFFFFF" stroke-width="1"/>`; // ATUALIZADO
    svg += `<line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth
      }" y2="${padding.top + chartHeight}" stroke="#FFFFFF" stroke-width="1"/>`; // ATUALIZADO

    // Barras
    labels.forEach((label, index) => {
      const baseX = padding.left + index * barGroupWidth;

      datasets.forEach((dataset, datasetIndex) => {
        const value = dataset.data[index];
        if (value !== null && value !== undefined && !isNaN(value)) {
          const normalizedValue = Math.max((value - minValue) / valueRange, 0);
          const barHeight = normalizedValue * chartHeight;
          const x =
            baseX +
            datasetIndex * (barWidth + 2) +
            (barGroupWidth - datasets.length * (barWidth + 2)) / 2;
          const y = padding.top + chartHeight - barHeight;

          const colors = [
            "#33a2e5",
            "#e54646",
            "#28a745",
            "#ffc107",
            "#6f42c1",
          ];
          const color =
            dataset.backgroundColor || colors[datasetIndex % colors.length];

          // --- CORREÇÃO FINAL: Apenas UM retângulo com rx/ry e fill-opacity ---
          const radius = 8;
          const titleText = `${dataset.label || "Dados"}: ${value}${dataset.label && dataset.label.includes("Latência") ? "ms" : ""
            }`;

          svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" fill-opacity="0.8"
                      rx="${radius}" ry="${radius}" 
                      style="transition: opacity 0.2s;">
                      <title>${titleText}</title>
                    </rect>`;
          // --- FIM DA MUDANÇA ---
        }
      });
    });

    // Rótulos do eixo X (Branco e Reto)
    labels.forEach((label, index) => {
      const step = (type === 'daily') ? 1 : 2; // Mostra todos os dias, mas pula horas
      if (index % step === 0) {
        const x = padding.left + index * barGroupWidth + barGroupWidth / 2;
        const y = padding.top + chartHeight + 20;
        const parts = label.split("-");
        const displayLabel = (type === "daily" && parts.length === 3)
          ? `${parts[2]}/${parts[1]}` // Formato DD/MM
          : label;
        svg += `<text x="${x}" y="${y}" fill="#FFFFFF" text-anchor="middle" font-size="10">${displayLabel}</text>`; // ATUALIZADO
      }
    });

    // Legenda (Branco, 5% do final, CÍRCULO, BOLD)
    let legendStartY = height * 0.95; // Posição 5% do final (95% do topo)
    const legendItemWidth = Math.min(200, chartWidth / datasets.length);

    datasets.forEach((dataset, index) => {
      const legendX = padding.left + index * legendItemWidth;
      const colors = ["#33a2e5", "#e54646", "#28a745", "#ffc107", "#6f42c1"];
      const color = dataset.backgroundColor || colors[index % colors.length];

      // --- MUDANÇA: Troca <rect> por <circle> ---
      svg += `<circle cx="${legendX + 6}" cy="${legendStartY}" r="6" fill="${color}" opacity="0.8"/>`; // r="6" e centralizado em Y

      // --- MUDANÇA: Adicionado font-weight="bold" ---
      svg += `<text x="${legendX + 18
        }" y="${legendStartY + 4}" fill="#FFFFFF" font-size="11" font-weight="bold">${ // y + 4 para alinhar com o centro do círculo
        dataset.label || `Dataset ${index + 1}`
        }</text>`;
    });

    svg += "</svg>";
    return svg;
  }
}

window.startTracerouteMonitor = function (anchorElement) {
  const panelElement = anchorElement.closest(".main-container");
  if (panelElement && !panelElement.dataset.initialized) {
    panelElement.dataset.initialized = "true";
    const monitor = new TracerouteMonitor(panelElement);
    monitor.init();
  }
};