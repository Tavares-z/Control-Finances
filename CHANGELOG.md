# Changelog — Control-Finances (fork)

Mudanças notáveis do **Control-Finances**, fork pessoal do
[OpenMonetis](https://github.com/felipegcoutinho/openmonetis). Este arquivo cobre as
customizações próprias do fork e os pontos de sincronização com o upstream.

O changelog cru do upstream (espelho, sobrescrito no sync) fica em
[`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o fork segue seu próprio eixo de versão (`v3.x`), independente do upstream.
Cada release registra a base do upstream correspondente no corpo.

## [3.2.0] - 2026-07-29

Open Finance — Webhooks Pluggy: detecção em tempo real de eventos da Pluggy, fechando a Fase 1 de Open Finance. Base upstream v2.7.12.

### Adicionado
- Webhooks Pluggy (detecção em tempo real): receptor público `POST /api/webhooks/pluggy` que reage a eventos da Pluggy na hora, em vez de só oportunisticamente ao abrir o dashboard. Login expirado/consentimento vencido (`item/error`, `item/waiting_user_*`) atualizam o status da conexão em tempo real (badge + botão Reconectar reagem na hora); transações novas (`transactions/created`) sincronizam imediatamente, furando o throttle de 1h.
- Segurança do webhook: autenticado por um segredo compartilhado no header (`Authorization: Bearer`), validado em tempo constante. A Pluggy não assina o corpo — o segredo é configurado no header do webhook (via API) e no ambiente (`PLUGGY_WEBHOOK_SECRET`). Sem o segredo, o receptor rejeita tudo (fail-safe).
- Interno: `scripts/register-pluggy-webhook.mjs` para registrar o header de autenticação do webhook (a Pluggy só aceita headers via API, não pelo dashboard). Fecha a Fase 1 de Open Finance — sem pendências futuras conhecidas.

## [3.1.1] - 2026-07-28

Ajustes finais da conexão Open Finance: badge de conexão desatualizada e reconexão pelo usuário. Base upstream v2.7.12.

### Adicionado
- Badge "Desatualizada" (estado `OUTDATED`) na aba de conexões bancárias, com ícone de alerta e botão "Reconectar" que reabre o widget Pluggy em modo de atualização — sem esperar a conexão falhar de vez.

## [3.1.0] - 2026-07-25

Open Finance (Fase 1): conexão de contas bancárias via Pluggy, atrás de flag e desativado por padrão. Base upstream v2.7.12.

### Adicionado
- Open Finance (fase 1): conexão de contas bancárias via Pluggy. Nova aba "Conexões bancárias" em Ajustes, com **conectar** (widget Pluggy Connect) e **desconectar**. Os lançamentos das contas conectadas entram automaticamente na Caixa de entrada, com deduplicação (por id da transação e por conteúdo). Sincronização oportunística ao abrir o dashboard (no máximo 1x por hora por conexão). Tudo atrás de flag (`OPENFINANCE_ENABLED`), desativado por padrão.
- Interno: runner versionado de sincronização em `scripts/` para diagnóstico do Open Finance; liberação do domínio do widget (`connect.pluggy.ai`) no `frame-src` da CSP.

### Corrigido
- Assinaturas sem cartão vinculado não geravam item na Caixa de entrada por um conflito silencioso no banco (predicado do índice parcial faltando no `ON CONFLICT`); a geração voltou a funcionar. (Já em produção via cherry-pick.)

## [3.0.0] - 2026-07-23

Primeira release do fork Control-Finances, consolidando todas as customizações próprias sobre a base upstream v2.7.12.

### Adicionado
- VR/VA — data da próxima recarga (#5): campo opcional "Próxima recarga" no form de conta VR/VA (migration 0036, `contas.proxima_recarga`). Quando preenchida e futura, crava o `daysRemaining` do widget de saldo VR/VA no lugar da estimativa por histórico.
- Contas — saldo inicial editável (#4): o campo "Saldo inicial" passou a aparecer também na edição de conta (antes só na criação). O helper `syncInitialBalanceTransaction` mantém a coluna `saldo_inicial` e o lançamento do extrato em sincronia (upsert idempotente).
- Dashboard — widget de Saldo VR/VA: mostra saldo do benefício, disponível por dia até a próxima recarga, ritmo de consumo e veredito (fecha/aperta/não fecha). Query em `dashboard/vr/vr-balance-queries.ts`.
- Orçamentos — sugestão de limite pela média dos últimos 3 meses: ao escolher categoria e período no dialog de orçamento, busca o gasto real dos 3 meses anteriores na mesma categoria e mostra a média com um botão para preencher o limite. Sem migration.
- Dashboard — projeção de fluxo de caixa e alertas de anomalia: widget "Fluxo de caixa projetado" (saldo estimado em 30/60/90 dias) e seção "Anomalias de gastos" no sino de notificações (categoria com gasto ≥40% acima da média dos últimos 3 meses). Inclui a tool `consultar_projecao_caixa` na Monetinha. Sem migration.
- Metas — imagem de capa opcional: capa opcional por meta (migration 0034, `goals.coverAttachmentId`), reaproveitando a tabela `attachments`/S3 com fluxo de upload próprio por `goalId`.
- Assinaturas / Despesas Fixas: tabela `assinaturas` (migration 0033) + `inboxItems.subscriptionId`, CRUD completo, página `/assinaturas`, widget no dashboard, tool `consultar_assinaturas` na IA, relatório em `/reports/subscriptions`. Cobrança contínua de duração indefinida que, ao vencer, gera 1 pré-lançamento pending no Inbox (assinatura com `cardId` não gera — vai na fatura).
- Metas Financeiras: tabela `metas`, CRUD completo, página `/metas` (abas Ativas/Concluídas/Arquivadas), widget top-3 no dashboard, tool `consultar_metas` na IA.
- Monetinha (ChatWidget): chat com IA no layout do dashboard (tabela `mensagens_chat`, colunas `chat_model`/`chat_personality` em `preferencias_usuario`), anexos (jpg/png/webp/pdf até 10MB), modo full-screen, aba "Assistente" em `/settings`. Tools: `consultar_metas`, `consultar_assinaturas`, `consultar_orcamento`.
- Inbox — seleção de tipo ao processar: modal "Como deseja registrar?" (Despesa/Receita/Transferência entre contas) ao processar um pré-lançamento.
- Forma de pagamento "Saldo em conta": débito genérico direto do saldo da conta, distinto de Pix/Boleto no rótulo, para não sujar o widget de formas de pagamento.

### Alterado
- Lançamentos — forma de pagamento oculta em lançamentos técnicos (#3): "Ajuste de saldo" e "Saldo inicial" passam a exibir "—" na tabela desktop e a omitir o badge na lista mobile, via `hasNoRealPaymentMethod()`. Só renderização.
- Design: componentes customizados (widget VR/VA, card de assinatura, card de meta) passaram a usar os tokens semânticos `success`/`warning` no lugar de classes `emerald`/`amber` cruas, alinhando ao `DESIGN.md`.
- Documentação: `CLAUDE.md` ganhou a "Regra de Design" e foi renomeado para `AGENTS.md` (neutro entre IAs); `CLAUDE.md` virou um stub de uma linha (`@AGENTS.md`).

### Corrigido
- Deps — Popover dentro de Dialog (#1): override de `@radix-ui/react-dismissable-layer` numa única versão no `pnpm-workspace.yaml`, corrigindo o calendário inclicável em "Nova assinatura"/"Nova meta".
- Correções cruzadas: fatura paga não zera mais o valor exibido no card do cartão; capa de meta órfã no S3 é limpa ao excluir a meta; race de duplicidade de assinatura eliminada (migration 0035, `pre_lancamentos.assinatura_periodo` + índice único parcial).

---

> **Sincronização com o upstream:** o fork está sincronizado com o upstream **v2.7.12**
> (de v2.7.2). Detalhes de cada bloco portado no `AGENTS.md`, seção "Estado do Sync".
> O histórico completo das versões do OpenMonetis (2.7.2 e anteriores) vive em
> [`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).
