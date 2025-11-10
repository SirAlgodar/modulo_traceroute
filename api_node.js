import { exec } from "child_process";
import cors from "cors";
import "dotenv/config";
import express from "express";
import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import { promisify } from "util";

const router = express.Router();
const execAsync = promisify(exec);

const CSV_PATH = path.join(process.cwd(), "data", "targets.csv");
const ENV_PATH = path.join(process.cwd(), ".env");
const HISTORY_JSON_PATH = path.join(
  process.cwd(),
  "data",
  "historico_traceroute",
  "historico_traceroute.json"
);

// ▼▼ LINHA QUE ESTAVA FALTANDO E FOI ADICIONADA ▼▼
let historyTaskChain = Promise.resolve();

// --- Funções Utilitárias ---
const ensureDirectoryExists = (filePath) => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};
const readTargetsFromCSV = () => {
  try {
    ensureDirectoryExists(CSV_PATH);
    if (!fs.existsSync(CSV_PATH)) fs.writeFileSync(CSV_PATH, "", "utf-8");
    const fileContent = fs.readFileSync(CSV_PATH, "utf-8");
    if (!fileContent.trim()) return [];
    return fileContent
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split("|");
        const displayName = parts[0] || "";
        const target = parts[1] || "";
        const isHighlighted = parts[2] === "true";
        const safeId = target.replace(/[^a-zA-Z0-9]/g, "");
        return { id: safeId, displayName, target, isHighlighted };
      });
  } catch (error) {
    console.error("Erro ao ler CSV:", error);
    return [];
  }
};
const writeTargetsToCSV = (targets) => {
  try {
    ensureDirectoryExists(CSV_PATH);
    const csvContent = targets
      .map((t) => `${t.displayName}|${t.target}|${!!t.isHighlighted}`)
      .join("\n");
    fs.writeFileSync(CSV_PATH, csvContent, "utf-8");
  } catch (error) {
    console.error("Erro ao escrever no CSV:", error);
  }
};
const parseTracerouteOutput = (output, slowHopThreshold = 25) => {
  const lines = output.split("\n");
  const hops = [];
  let slowHopsCount = 0;
  let fastestHop = Infinity;
  let slowestHop = 0;
  const hopRegex = /^\s*(\d+)\s+.*?\(([\d\.]+)\)\s+([\d\.]+)\s*ms/;
  lines.forEach((line) => {
    const match = line.match(hopRegex);
    if (match) {
      const hopNumber = parseInt(match[1], 10);
      const ip = match[2];
      const latency = parseFloat(match[3]);
      if (!ip || isNaN(latency)) return;
      const isSlow = latency > slowHopThreshold;
      if (isSlow) slowHopsCount++;
      if (latency < fastestHop) fastestHop = latency;
      if (latency > slowestHop) slowestHop = latency;
      hops.push({ hop: hopNumber, ip: ip, latency: latency, isSlow: isSlow });
    }
  });
  if (fastestHop === Infinity) fastestHop = 0;
  return {
    totalHops: hops.length,
    fastestHop,
    slowestHop,
    slowHopsCount,
    detailedHops: hops,
  };
};
const readHistory = async () => {
  try {
    if (!fs.existsSync(HISTORY_JSON_PATH)) return [];
    const fileContent = await fs.promises.readFile(HISTORY_JSON_PATH, "utf-8");
    if (!fileContent.trim()) return [];
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Erro ao ler ou parsear o arquivo de histórico:", error);
    return [];
  }
};
const writeHistory = async (data) => {
  try {
    ensureDirectoryExists(HISTORY_JSON_PATH);
    await fs.promises.writeFile(
      HISTORY_JSON_PATH,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("Erro ao escrever no arquivo de histórico:", error);
  }
};

const _internalLogHistory = async (result) => {
  if (!result.isHighlighted) return;
  if (!result.data || !result.data.detailedHops) {
    return;
  }
  const history = await readHistory();
  const newHistoryEntry = {
    timestamp: new Date().toISOString(),
    target: result.target,
    displayName: result.displayName,
    data: result.data,
  };
  history.push(newHistoryEntry);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const prunedHistory = history.filter(
    (entry) => new Date(entry.timestamp) >= sevenDaysAgo
  );
  await writeHistory(prunedHistory);
};

const logHistory = (result) => {
  historyTaskChain = historyTaskChain
    .then(() => _internalLogHistory(result))
    .catch((err) => {
      console.error("Erro na cadeia de log:", err);
      historyTaskChain = Promise.resolve();
    });
};

const analyzeHistory = async (target, currentResultData) => {
  const history = await readHistory();
  const targetHistory = history.filter(
    (entry) => entry.target === target && entry.data.detailedHops
  );
  if (targetHistory.length === 0) {
    return {
      hopChangeD: null,
      hopChange7D: null,
      routeChanged: false,
      latencyChanged: false,
    };
  }
  const now = new Date();
  const oneDayAgo = new Date(now.valueOf() - 86400000);
  const sevenDaysAgo = new Date(now.valueOf() - 7 * 86400000);
  const lastEntry = targetHistory[targetHistory.length - 1];
  const entry24h = targetHistory
    .slice()
    .reverse()
    .find((entry) => new Date(entry.timestamp) <= oneDayAgo);
  const entry7d = targetHistory
    .slice()
    .reverse()
    .find((entry) => new Date(entry.timestamp) <= sevenDaysAgo);
  const analysis = {
    hopChangeD:
      entry24h && entry24h.data
        ? currentResultData.totalHops - entry24h.data.totalHops
        : null,
    hopChange7D:
      entry7d && entry7d.data
        ? currentResultData.totalHops - entry7d.data.totalHops
        : null,
    routeChanged: false,
    latencyChanged: false,
  };
  if (
    lastEntry &&
    lastEntry.data &&
    lastEntry.data.detailedHops &&
    lastEntry.data.detailedHops.length > 0 &&
    currentResultData.detailedHops.length > 0
  ) {
    const lastHopsSignature = lastEntry.data.detailedHops
      .map((h) => h.ip)
      .join("-");
    const currentHopsSignature = currentResultData.detailedHops
      .map((h) => h.ip)
      .join("-");
    analysis.routeChanged = lastHopsSignature !== currentHopsSignature;
    const lastAvgLatency =
      lastEntry.data.detailedHops.reduce((sum, h) => sum + h.latency, 0) /
      lastEntry.data.detailedHops.length;
    const currentAvgLatency =
      currentResultData.detailedHops.reduce((sum, h) => sum + h.latency, 0) /
      currentResultData.detailedHops.length;
    if (lastAvgLatency > 0) {
      analysis.latencyChanged =
        Math.abs(currentAvgLatency - lastAvgLatency) / lastAvgLatency > 0.2;
    }
  }
  return analysis;
};
const analyzeHistoryForCharts = (history) => {
  const hourlyData = {
    labels: [],
    datasets: [
      {
        label: "Latência Média (ms)",
        data: [],
        backgroundColor: "rgba(229, 70, 70, 0.7)",
      },
      {
        label: "Saltos Médios",
        data: [],
        backgroundColor: "rgba(76, 175, 80, 0.7)",
      },
      {
        label: "Mudanças de Rota",
        data: [],
        backgroundColor: "rgba(51, 162, 229, 0.7)",
      },
    ],
  };
  const dailyData = {
    labels: [],
    datasets: [
      {
        label: "Média Saltos",
        data: [],
        backgroundColor: "rgba(51, 162, 229, 0.7)",
      },
      {
        label: "Lat. Máxima",
        data: [],
        backgroundColor: "rgba(229, 70, 70, 0.7)",
      },
      {
        label: "Lat. Mínima",
        data: [],
        backgroundColor: "rgba(76, 175, 80, 0.7)",
      },
    ],
  };
  const now = new Date();
  const last24h = new Date(now.valueOf() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.valueOf() - 7 * 24 * 60 * 60 * 1000);

  // Filtrar histórico das últimas 24 horas
  const hourlyHistory = history.filter(
    (entry) => new Date(entry.timestamp) >= last24h && entry.data.detailedHops
  );

  // Agrupar dados por hora (últimas 24 horas)
  const hourlyAggregates = {};

  // Inicializar todas as 24 horas com arrays vazios
  for (let i = 0; i < 24; i++) {
    const hourDate = new Date(now.valueOf() - (23 - i) * 60 * 60 * 1000);
    const hourLabel = hourDate.getHours().toString().padStart(2, "0") + "h";
    hourlyAggregates[hourLabel] = {
      latencies: [],
      hops: [],
      routeChanges: 0,
      routes: new Set(), // Para contar mudanças de rota únicas
      hour: hourDate.getHours(),
      entries: [],
    };
  }

  // Processar entradas do histórico
  hourlyHistory.forEach((entry) => {
    const entryDate = new Date(entry.timestamp);
    const hourLabel = entryDate.getHours().toString().padStart(2, "0") + "h";

    if (
      hourlyAggregates[hourLabel] &&
      entry.data.detailedHops &&
      entry.data.detailedHops.length > 0
    ) {
      // Calcular latência média desta entrada
      const avgLatency =
        entry.data.detailedHops.reduce((sum, h) => sum + h.latency, 0) /
        entry.data.detailedHops.length;
      const currentRoute = entry.data.detailedHops.map((h) => h.ip).join("-");

      hourlyAggregates[hourLabel].latencies.push(avgLatency);
      hourlyAggregates[hourLabel].hops.push(entry.data.totalHops);
      hourlyAggregates[hourLabel].entries.push(entry);

      // Contar mudanças de rota únicas nesta hora
      if (hourlyAggregates[hourLabel].routes.has(currentRoute)) {
        // Rota já vista, não é uma mudança
      } else {
        hourlyAggregates[hourLabel].routes.add(currentRoute);
        if (hourlyAggregates[hourLabel].routes.size > 1) {
          hourlyAggregates[hourLabel].routeChanges++;
        }
      }
    }
  });

  // Gerar dados do gráfico horário
  const sortedHours = Object.keys(hourlyAggregates).sort((a, b) => {
    return hourlyAggregates[a].hour - hourlyAggregates[b].hour;
  });

  sortedHours.forEach((hourLabel) => {
    const agg = hourlyAggregates[hourLabel];

    hourlyData.labels.push(hourLabel);

    // Média de latência da hora específica (ou 0 se não houver dados)
    const avgLatency =
      agg.latencies.length > 0
        ? agg.latencies.reduce((sum, lat) => sum + lat, 0) /
          agg.latencies.length
        : 0;
    hourlyData.datasets[0].data.push(parseFloat(avgLatency.toFixed(2)));

    // Média de saltos da hora específica (ou 0 se não houver dados)
    const avgHops =
      agg.hops.length > 0
        ? agg.hops.reduce((sum, hop) => sum + hop, 0) / agg.hops.length
        : 0;
    hourlyData.datasets[1].data.push(parseFloat(avgHops.toFixed(1)));

    // Número de mudanças de rota únicas detectadas na hora
    hourlyData.datasets[2].data.push(agg.routeChanges);
  });
  const dailyAggregates = {};
  const dailyHistory = history.filter(
    (entry) => new Date(entry.timestamp) >= last7d && entry.data.detailedHops
  );
  dailyHistory.forEach((entry) => {
    const dayLabel = new Date(entry.timestamp).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    if (!dailyAggregates[dayLabel]) {
      dailyAggregates[dayLabel] = {
        hops: [],
        maxLatencies: [],
        minLatencies: [],
        count: 0,
      };
    }
    dailyAggregates[dayLabel].hops.push(entry.data.totalHops);
    dailyAggregates[dayLabel].maxLatencies.push(entry.data.slowestHop);
    dailyAggregates[dayLabel].minLatencies.push(entry.data.fastestHop);
    dailyAggregates[dayLabel].count++;
  });
  for (const day in dailyAggregates) {
    const agg = dailyAggregates[day];
    dailyData.labels.push(day);
    dailyData.datasets[0].data.push(
      agg.hops.reduce((a, b) => a + b, 0) / agg.count
    );
    dailyData.datasets[1].data.push(Math.max(...agg.maxLatencies));
    dailyData.datasets[2].data.push(Math.min(...agg.minLatencies));
  }
  return { hourly: hourlyData, daily: dailyData };
};

// --- Endpoints da API ---
router.get("/targets", (req, res) => {
  res.json(readTargetsFromCSV());
});
router.post("/targets", (req, res) => {
  const { displayName, target, isHighlighted } = req.body;
  if (!displayName || !target)
    return res
      .status(400)
      .json({ error: "displayName e target são obrigatórios" });
  const targets = readTargetsFromCSV();
  if (targets.some((t) => t.target === target))
    return res.status(409).json({ error: "Este alvo já existe." });
  targets.push({ displayName, target, isHighlighted: !!isHighlighted });
  writeTargetsToCSV(targets);
  res.status(201).json({ message: "Alvo adicionado com sucesso!" });
});
router.delete("/targets/:id", (req, res) => {
  const { id } = req.params;
  let targets = readTargetsFromCSV();
  targets = targets.filter((t) => t.id !== id);
  writeTargetsToCSV(targets);
  res.json({ message: "Alvo removido com sucesso!" });
});
router.put("/targets/:id", (req, res) => {
  const { id } = req.params;
  const { displayName, target, isHighlighted } = req.body;
  if (!displayName || !target)
    return res
      .status(400)
      .json({ error: "displayName e target são obrigatórios" });
  let targets = readTargetsFromCSV();
  const index = targets.findIndex((t) => t.id === id);
  if (index === -1)
    return res.status(404).json({ error: "Alvo não encontrado." });
  targets[index] = { displayName, target, isHighlighted: !!isHighlighted };
  writeTargetsToCSV(targets);
  res.json({ message: "Alvo atualizado com sucesso!" });
});
router.get("/settings", (req, res) => {
  res.json({
    slowHopThreshold: process.env.SLOW_HOP_THRESHOLD || 25,
    refreshInterval: process.env.REFRESH_INTERVAL || 60,
  });
});
router.post("/settings", (req, res) => {
  const { slowHopThreshold, refreshInterval } = req.body;
  try {
    let envContent = fs.existsSync(ENV_PATH)
      ? fs.readFileSync(ENV_PATH, "utf-8")
      : "";
    const lines = envContent.split("\n");
    let thresholdFound = false;
    let intervalFound = false;
    const newLines = lines.map((line) => {
      if (line.startsWith("SLOW_HOP_THRESHOLD=")) {
        thresholdFound = true;
        return `SLOW_HOP_THRESHOLD=${slowHopThreshold}`;
      }
      if (line.startsWith("REFRESH_INTERVAL=")) {
        intervalFound = true;
        return `REFRESH_INTERVAL=${refreshInterval}`;
      }
      return line;
    });
    if (!thresholdFound)
      newLines.push(`SLOW_HOP_THRESHOLD=${slowHopThreshold}`);
    if (!intervalFound) newLines.push(`REFRESH_INTERVAL=${refreshInterval}`);
    fs.writeFileSync(ENV_PATH, newLines.filter(Boolean).join("\n"));
    process.env.SLOW_HOP_THRESHOLD = slowHopThreshold.toString();
    process.env.REFRESH_INTERVAL = refreshInterval.toString();
    res.json({ message: "Configurações salvas com sucesso!" });
  } catch (error) {
    console.error("Erro ao salvar o arquivo .env:", error);
    res.status(500).json({ error: "Falha ao salvar configurações." });
  }
});
router.post("/traceroute/single", async (req, res) => {
  const { target, displayName, id, isHighlighted, slowHopThreshold } = req.body;
  if (!target) {
    return res.status(400).json({ error: "Target é obrigatório" });
  }
  try {
    const { stdout } = await execAsync(`traceroute ${target}`, {
      timeout: 45000,
    });
    const parsedData = parseTracerouteOutput(
      stdout,
      slowHopThreshold || process.env.SLOW_HOP_THRESHOLD
    );
    const analysis = await analyzeHistory(target, parsedData);
    const fullResult = {
      id,
      displayName,
      target,
      isHighlighted,
      success: true,
      data: parsedData,
      analysis,
    };
    logHistory(fullResult);
    res.json(fullResult);
  } catch (error) {
    const errorResult = {
      id,
      displayName,
      target,
      isHighlighted,
      success: false,
      error: "Erro de execução",
    };
    logHistory(errorResult);
    res.status(500).json(errorResult);
  }
});
router.get("/history/targets", async (req, res) => {
  const history = await readHistory();
  const uniqueTargets = history.reduce((acc, entry) => {
    const safeId = entry.target.replace(/[^a-zA-Z0-9]/g, "");
    if (!acc.has(safeId)) {
      acc.set(safeId, {
        id: safeId,
        displayName: entry.displayName,
        target: entry.target,
      });
    }
    return acc;
  }, new Map());
  res.json(Array.from(uniqueTargets.values()));
});
router.get("/history/charts/:targetId/:type", async (req, res) => {
  const { targetId, type } = req.params;
  const history = await readHistory();
  const targetHistory = history.filter(
    (entry) => entry.target.replace(/[^a-zA-Z0-9]/g, "") === targetId
  );
  if (targetHistory.length < 2) {
    // Retorne JSON mesmo em erros para evitar falhas de parse no frontend
    return res.status(404).json({
      success: false,
      error: "Histórico insuficiente para gerar gráfico.",
      chartData: null,
      chartConfig: null,
    });
  }

  const allChartData = analyzeHistoryForCharts(targetHistory);
  const data = type === "hourly" ? allChartData.hourly : allChartData.daily;
  const title =
    type === "hourly"
      ? `Médias por Hora (24h) - ${targetHistory[0].displayName}`
      : `Métricas por Dia (7d) - ${targetHistory[0].displayName}`;

  // Retornar dados JSON para o frontend renderizar os gráficos
  const chartConfig = {
    type: "line",
    data: data,
    options: {
      plugins: {
        legend: { labels: { color: "#d8d9da" } },
        title: {
          display: true,
          text: title,
          color: "#d8d9da",
          padding: 20,
          font: { size: 16 },
        },
      },
      scales: {
        y: { ticks: { color: "#8e8e8e" }, grid: { color: "#323236" } },
        x: { ticks: { color: "#8e8e8e" }, grid: { color: "#323236" } },
      },
    },
  };

  try {
    res.json({
      success: true,
      title: title,
      chartData: data,
      chartConfig: chartConfig,
    });
  } catch (error) {
    console.error("Erro ao gerar dados do gráfico:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao gerar dados do gráfico.",
    });
  }
});

// --- Configuração e Inicialização do Servidor ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/api", router);

// Configurações do servidor a partir do .env
const HTTP_PORT = process.env.HTTP_PORT || 3055;
const HTTPS_PORT = process.env.HTTPS_PORT || 3056;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;

// Função para verificar se os certificados SSL existem
const checkSSLCertificates = () => {
  if (!SSL_CERT_PATH || !SSL_KEY_PATH) {
    return false;
  }
  
  try {
    return fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH);
  } catch (error) {
    console.warn("⚠️  Erro ao verificar certificados SSL:", error.message);
    return false;
  }
};

// Inicializar servidor HTTP
const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, () => {
  console.log(`✅ Servidor HTTP rodando na porta ${HTTP_PORT}`);
  console.log(`🌐 Acesse: http://localhost:${HTTP_PORT}`);
});

// Inicializar servidor HTTPS (se habilitado e certificados disponíveis)
if (ENABLE_HTTPS && checkSSLCertificates()) {
  try {
    const sslOptions = {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH)
    };
    
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`✅ Servidor HTTPS rodando na porta ${HTTPS_PORT}`);
      console.log(`🔒 Acesse: https://localhost:${HTTPS_PORT}`);
    });
  } catch (error) {
    console.error("❌ Erro ao inicializar servidor HTTPS:", error.message);
    console.log("ℹ️  Servidor HTTP continuará funcionando normalmente");
  }
} else {
  if (ENABLE_HTTPS) {
    console.warn("⚠️  HTTPS habilitado mas certificados não encontrados:");
    console.warn(`   - Certificado: ${SSL_CERT_PATH}`);
    console.warn(`   - Chave: ${SSL_KEY_PATH}`);
    console.log("ℹ️  Servidor funcionando apenas em HTTP");
  } else {
    console.log("ℹ️  HTTPS desabilitado - funcionando apenas em HTTP");
  }
}
