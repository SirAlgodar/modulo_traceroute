# Correção da Aba de Histórico no Grafana (HTML Graphic)

Este documento descreve as alterações realizadas para corrigir o problema de carregamento da aba **Histórico** no painel do Grafana, onde ocorria erro no console e falha ao montar os gráficos horários e diários.

## Sintomas
- Requisições `GET /api/history/charts/:targetId/hourly` retornavam **404**.
- O frontend executava `response.json()` sobre uma resposta **não JSON**, gerando `SyntaxError: Unexpected token 'H'`.
- Erro adicional: `Cannot read properties of null (reading 'parentElement')` ao tentar acessar os contêineres dos gráficos (`#hourly-chart` e `#daily-chart`).

## Causas Raiz
- Backend retornava texto com `res.send()` para 404 ao invés de JSON.
- Frontend assumia que qualquer resposta (inclusive erro) seria JSON e não tratava fallback para texto.
- Falta de verificação de existência dos elementos de gráfico antes de usar `parentElement`.

## Alterações Implementadas

### Backend (`api_node.js`)
- Endpoint `GET /api/history/charts/:targetId/:type`:
  - Em caso de histórico insuficiente, retorna `404` com corpo JSON: `{ success: false, error: "Histórico insuficiente..." }`.

### Frontend (`grafana.js`)
- Função `apiFetch(endpoint, options)`:
  - Em respostas não-ok, tenta primeiro `response.json()`. Se falhar, usa `response.text()` como mensagem de erro.
  - Em sucesso, checa `content-type`. Se não for JSON, tenta parse do texto; se falhar, retorna `null` e loga aviso.
- Função `loadHistoryForTarget(targetId)`:
  - Adicionadas verificações para existência dos elementos `#hourly-chart` e `#daily-chart` e seus `parentElement` antes de montar os gráficos.
  - Mensagens de erro amigáveis no DOM quando o contêiner não é encontrado.

## Testes e Validação
1. Inicie o servidor: `npm run dev` ou `npm start`.
2. Verifique `GET /api/targets` e selecione um alvo marcado como `isHighlighted=true`.
3. Abra o painel Grafana com o plugin HTML Graphic e navegue até a aba **Histórico**.
4. Confirme:
   - Em caso de histórico insuficiente, o frontend exibe mensagem e não quebra com `SyntaxError`.
   - Quando há dados suficientes, os gráficos horário e diário montam sem erro de `parentElement`.

## Observações
- Os IDs usados na aba **Histórico** são `safeId` derivados de `targets.csv` (ex.: `google.com.br` → `googlecombr`).
- Para gerar histórico, é necessário que os alvos estejam com `isHighlighted=true` e que **pelo menos duas** entradas tenham sido registradas.

## Próximos Passos
- Avaliar centralização de tratamento de erro visual na aba de histórico.
- Considerar retornar `200` com `success=false` ao invés de `404` se preferir evitar erros em proxies que ocultam corpo de erros.