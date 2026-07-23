# Changelog — Control-Finances (fork)

Mudanças notáveis do **Control-Finances**, fork pessoal do
[OpenMonetis](https://github.com/felipegcoutinho/openmonetis). Este arquivo cobre as
customizações próprias do fork e os pontos de sincronização com o upstream.

O changelog cru do upstream (espelho, sobrescrito no sync) fica em
[`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
As datas seguem o histórico real do git (`%cs` do commit).

## [Não lançado]

### Alterado
- **Design:** componentes customizados (widget VR/VA, card de assinatura, card de meta)
  passaram a usar os tokens semânticos `success`/`warning` no lugar de classes
  `emerald`/`amber` cruas, alinhando ao `DESIGN.md`. (2026-07-22)
- **Documentação:** `CLAUDE.md` ganhou a "Regra de Design", apontando o `DESIGN.md`
  como fonte de verdade visual obrigatória em qualquer alteração de UI. (2026-07-22)
- **Documentação:** o documento de instruções foi renomeado de `CLAUDE.md` para
  `AGENTS.md` (neutro entre IAs); `CLAUDE.md` virou um stub de uma linha
  (`@AGENTS.md`) para o Claude Code seguir carregando automaticamente. (2026-07-23)

## Customizações do fork

### 2026-07-22 — VR/VA: data da próxima recarga (#5)
- Campo opcional "Próxima recarga" no form de conta VR/VA (migration 0036,
  `contas.proxima_recarga`). Quando preenchida e futura, crava o `daysRemaining` do
  widget de saldo VR/VA no lugar da estimativa por histórico.

### 2026-07-22 — Contas: saldo inicial editável (#4)
- O campo "Saldo inicial" passou a aparecer também na edição de conta (antes só na
  criação). O helper `syncInitialBalanceTransaction` mantém a coluna `saldo_inicial`
  e o lançamento do extrato em sincronia (upsert idempotente).

### 2026-07-22 — Lançamentos: forma de pagamento oculta em lançamentos técnicos (#3)
- "Ajuste de saldo" e "Saldo inicial" gravam `paymentMethod` "Pix" como carimbo
  default (coluna notNull), mas não têm forma de pagamento real. Passam a exibir "—"
  na tabela desktop e a omitir o badge na lista mobile, via `hasNoRealPaymentMethod()`.
  Só renderização — preserva a dependência do saldo inicial em `paymentMethod === "Pix"`.

### 2026-07-21 — Dashboard: widget de Saldo VR/VA
- Widget que mostra saldo do benefício, disponível por dia até a próxima recarga,
  ritmo de consumo e veredito (fecha/aperta/não fecha). Query em
  `dashboard/vr/vr-balance-queries.ts`.

### 2026-07-19 — Orçamentos: sugestão de limite pela média dos últimos 3 meses
- Ao escolher categoria e período no dialog de orçamento, busca o gasto real dos 3 meses
  anteriores na mesma categoria e mostra a média com um botão para preencher o limite.
  Sem migration — reaproveita o filtro de `fetchCategoryBudgetSummary`.

### 2026-07-15 — Dashboard: projeção de fluxo de caixa e alertas de anomalia de gastos
- Widget "Fluxo de caixa projetado" (saldo estimado em 30/60/90 dias, combinando
  transações futuras já lançadas e próximas cobranças de assinaturas ativas) e seção
  "Anomalias de gastos" no sino de notificações (categoria com gasto ≥40% acima da média
  dos últimos 3 meses). Inclui a tool `consultar_projecao_caixa` na Monetinha. Sem
  migration — toda a feature é leitura sobre colunas já existentes.

### 2026-07-13 — Metas: imagem de capa opcional
- Capa opcional por meta (migration 0034, `goals.coverAttachmentId`), reaproveitando
  a tabela `attachments`/S3 com fluxo de upload próprio por `goalId`.

### 2026-07-13 — Correções cruzadas
- Fatura paga não zera mais o valor exibido no card do cartão; capa de meta órfã no S3
  é limpa ao excluir a meta; race de duplicidade de assinatura eliminada (migration 0035,
  `pre_lancamentos.assinatura_periodo` + índice único parcial).

### 2026-07-12 — Deps: correção do Popover dentro de Dialog (#1)
- Override de `@radix-ui/react-dismissable-layer` numa única versão no
  `pnpm-workspace.yaml`, corrigindo o calendário inclicável em "Nova assinatura"/"Nova meta".

### 2026-07-11 — Assinaturas / Despesas Fixas
- Tabela `assinaturas` (migration 0033) + `inboxItems.subscriptionId`, CRUD completo,
  página `/assinaturas`, widget no dashboard, tool `consultar_assinaturas` na IA,
  relatório em `/reports/subscriptions`. Cobrança contínua de duração indefinida que,
  ao vencer, gera 1 pré-lançamento pending no Inbox (assinatura com `cardId` não gera —
  vai na fatura).

### 2026-06-07 — Metas Financeiras
- Tabela `metas`, CRUD completo, página `/metas` (abas Ativas/Concluídas/Arquivadas),
  widget top-3 no dashboard, tool `consultar_metas` na IA.

### 2026-05-30 — Monetinha (ChatWidget)
- Chat com IA no layout do dashboard (tabela `mensagens_chat`, colunas
  `chat_model`/`chat_personality` em `preferencias_usuario`), anexos (jpg/png/webp/pdf
  até 10MB), modo full-screen, aba "Assistente" em `/settings`. Tools: `consultar_metas`,
  `consultar_assinaturas`, `consultar_orcamento`.

### 2026-05-29 — Inbox: seleção de tipo ao processar
- Modal "Como deseja registrar?" (Despesa/Receita/Transferência entre contas) ao
  processar um pré-lançamento.

## Sincronização com o upstream

### 2026-07 — Sincronizado com upstream v2.7.12
- Sync de v2.7.2 → v2.7.12 (migrations, Settings/Monetinha, transações, dashboard
  widgets, popovers de fatura, anexos por pessoa, import de planilhas, cards). Workflows
  de CI/CD deixados de fora por decisão (fork usa Railway). Detalhes no `AGENTS.md`,
  seção "Estado do Sync".

---

> Histórico completo das versões do OpenMonetis (2.7.2 e anteriores):
> ver [`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).
