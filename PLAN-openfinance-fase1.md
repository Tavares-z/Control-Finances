# PLAN — Open Finance, Fase 1

> Documento de planejamento. **Não é código de feature.** Todas as decisões de
> escopo abaixo estão FECHADAS (não reabrir). Cada afirmação técnica foi
> verificada contra o arquivo real citado (caminho + linha), conforme a Regra de
> Verificação do AGENTS.md.

## 0. Escopo fechado (referência)

- **F1 faz:** conectar 1 banco via Pluggy, puxar só conta-corrente
  (`account.type !== "CREDIT"`), criar pré-lançamentos `pending` na Inbox.
- **F1 NÃO faz:** cartão, transferência, consentimento OF real, webhook.
- **Pré-lançamento pré-registrado só com dado real:** `amount` (com sinal),
  `date`, `description`. Direção despesa/receita **pelo sinal** do amount. Conta =
  conta local vinculada. Categoria **em branco**.
- **Dedup 2 camadas** (ambas F1): id do Pluggy (Camada 1) + match por conteúdo
  (Camada 2).
- **Sync:** polling oportunístico, throttle 1x/h, no load do `/dashboard`. Nunca
  deleta por sumiço. Sem cron, sem webhook.
- **Ambiente:** flag `OPENFINANCE_ENABLED`; migration aditiva; validar só em
  staging (guard, host `sakura`); nunca `DB_ALLOW_UNSAFE=1`.

---

## 1. Verificação do código real — o que já existe (achados-chave)

### 1.1 O fluxo do modal JÁ decide direção pelo sinal — descoberta que simplifica a F1

Ao processar um item, o `TransactionDialog` recebe um `defaultTransactionType`
calculado assim
([inbox-page.tsx:552-560](src/features/inbox/components/inbox-page.tsx#L552-L560)):

```
defaultTransactionType={
  selectedProcessType === "despesa" ? "Despesa"
  : selectedProcessType === "receita" ? "Receita"
  : itemToProcess?.parsedAmount && parseFloat(itemToProcess.parsedAmount) < 0
      ? "Despesa"
      : "Receita"
}
```

Ou seja: **quando o usuário NÃO escolhe explicitamente**, a direção já é derivada
do **sinal de `parsedAmount`** — exatamente a regra da F1. E o `defaultAmount`
enviado ao form usa `Math.abs`
([inbox-page.tsx:409-411](src/features/inbox/components/inbox-page.tsx#L409-L411)),
então o valor exibido fica positivo e o tipo carrega a direção. `defaultName` e
`defaultPurchaseDate` também já saem de `parsedName` /`notificationTimestamp`
([inbox-page.tsx:402-408](src/features/inbox/components/inbox-page.tsx#L402-L408)).

**Consequência direta:** para F1, **não é preciso coluna nova de direção nem tocar
o `TransactionDialog`**. Basta o item OF gravar `parsedAmount` **com sinal**
(negativo = despesa) — o pipeline atual já pré-preenche direção, valor, nome e
data corretamente. Isso responde a pergunta 4 do briefing (ver §4.4).

### 1.2 O `InboxProcessTypeDialog` NÃO recebe pré-seleção hoje

O `InboxProcessTypeDialog` é renderizado sem nenhuma prop de tipo default
([inbox-page.tsx:564-568](src/features/inbox/components/inbox-page.tsx#L564-L568));
`onSelect` só dispara ao clique. O tipo escolhido vira `selectedProcessType`
([inbox-page.tsx:150-157](src/features/inbox/components/inbox-page.tsx#L150-L157)),
que é `null` quando o usuário abre pelo caminho normal.

**Caminho recomendado para F1 (menor toque, zero risco compartilhado):** deixar o
item OF passar pelo **mesmo** `InboxProcessTypeDialog` que Companion e Assinaturas
usam. Como o `defaultTransactionType` já cai no branch do sinal quando
`selectedProcessType` é `null`, o item OF chega ao `TransactionDialog` com a
direção certa **mesmo sem pré-selecionar o modal**. Ou seja: **não pular o modal,
não pré-selecionar opção** — o fluxo existente já entrega o resultado desejado.

> ⚠️ **Alternativa a EVITAR na F1:** pré-selecionar a opção no
> `InboxProcessTypeDialog` ou pular direto pro `TransactionDialog` exigiria passar
> uma nova prop (`defaultType`) e ramificar o `handleProcessTypeSelect`
> ([inbox-page.tsx:150](src/features/inbox/components/inbox-page.tsx#L150)) — código
> compartilhado com Companion/Assinaturas. **Risco de colisão real** e ganho nulo
> (o sinal já resolve). Fica fora da F1.

### 1.3 `markInboxAsProcessedAction` e `onSuccess` não mudam

`handleLancamentoSuccess`
([inbox-page.tsx:367-392](src/features/inbox/components/inbox-page.tsx#L367)) chama
`markInboxAsProcessedAction({ inboxItemId })`
([actions.ts:49-94](src/features/inbox/actions.ts#L49)) — que só flipa
`status→processed`, exigindo `status="pending"` + ownership. **Nada específico de
OF.** O bloco de `syncSubscriptionAmountAction`
([inbox-page.tsx:378-391](src/features/inbox/components/inbox-page.tsx#L378)) só
roda se `itemToProcess.subscriptionId` existir — item OF tem `subscriptionId`
`null`, então é ignorado naturalmente. **Sem toque aqui.**

### 1.4 Widget do dashboard e queries de leitura não mudam

`fetchDashboardInboxSnapshot`
([inbox-snapshot-queries.ts:36-51](src/features/dashboard/lib/inbox-snapshot-queries.ts#L36))
seleciona `id, sourceAppName, parsedName, parsedAmount, originalText,
notificationTimestamp, createdAt` filtrando só `status="pending"`. Item OF entra
automaticamente. **Nenhuma query de leitura precisa mudar** — igual Assinaturas.

### 1.5 Padrões de dedup e sync já existentes (a espelhar)

- **uniqueIndex parcial + onConflictDoNothing** (padrão a copiar na Camada 1):
  `lancamentos_ofx_fit_id_user_id_idx` em `(userId, ofxFitId) WHERE ofx_fit_id IS
  NOT NULL` ([schema.ts:872-874](src/db/schema.ts#L872)); e o de assinatura em
  `pre_lancamentos` `(subscriptionId, subscriptionPeriod) WHERE assinatura_id IS
  NOT NULL` ([schema.ts:689-693](src/db/schema.ts#L689)), aplicado com
  `.onConflictDoNothing({ target: [...] })`
  ([generate-due-inbox-items.ts:67-69](src/features/subscriptions/generate-due-inbox-items.ts#L67)).
- **Sync oportunístico** (padrão a copiar): `ensureDueSubscriptionsGenerated(user.id)`
  chamado no load do dashboard dentro de try/catch
  ([dashboard/page.tsx:28-32](src/app/(dashboard)/dashboard/page.tsx#L28)).
- **Insert de item na Inbox** (forma exata): ver
  [generate-due-inbox-items.ts:52-70](src/features/subscriptions/generate-due-inbox-items.ts#L52)
  — campos `userId, sourceApp, sourceAppName, originalTitle, originalText,
  notificationTimestamp, parsedName, parsedAmount, status`.

### 1.6 Estado das migrations

Última migration = **0037** (`0037_create_establishment_logos`), confirmado em
`drizzle/meta/_journal.json` (idx 37) e no diretório `drizzle/`. Próxima = **0038**.
Imports `date`, `jsonb`, `uuid`, `uniqueIndex` **já existem** em
[schema.ts:1-16](src/db/schema.ts#L1-L16) — a migration não precisa de import novo.

---

## 2. Migration exata (gerar via `drizzle-kit generate` a partir de 0037)

> **Não escrever .sql à mão** (regra 5 do AGENTS.md). Alterar `schema.ts`, rodar
> `npx drizzle-kit generate` — ele encadeia a 0038 a partir do snapshot 0037. Rodar
> `npx drizzle-kit migrate` **só contra staging**.

### 2.1 Coluna de dedup Camada 1 em `pre_lancamentos`

Adicionar ao bloco de colunas de `inboxItems`
([schema.ts:616-673](src/db/schema.ts#L616)):

```ts
// Id estável da transação na fonte externa (Open Finance / Pluggy).
// Usado para dedup idempotente do próprio sync (Camada 1). NULL para itens
// de outras fontes (Companion, assinatura).
externalSourceId: text("external_source_id"),
```

E no bloco de índices
([schema.ts:674-694](src/db/schema.ts#L674)), espelhando o padrão do 0035:

```ts
externalSourceIdUnique: uniqueIndex(
  "pre_lancamentos_external_source_id_key",
)
  .on(table.userId, table.externalSourceId)
  .where(sql`external_source_id IS NOT NULL`),
```

**Aditivo, seguro:** coluna nullable, índice parcial. Linhas existentes (Companion,
assinatura) ficam com `external_source_id = NULL` → fora do índice → sem conflito.

> Nota: o uniqueIndex é **escopado por usuário** de propósito —
> `(userId, external_source_id) WHERE external_source_id IS NOT NULL` — e NÃO um
> unique global só em `external_source_id`.

### 2.2 Tabela `openfinance_connections` (nova)

Modela a conexão Pluggy + o vínculo conta local ↔ conta Pluggy + o throttle.

```ts
export const openFinanceConnections = pgTable(
  "openfinance_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Identificadores Pluggy
    pluggyItemId: text("pluggy_item_id").notNull(),
    connectorName: text("connector_name"),          // nome do banco (display)

    // Vínculo conta local ↔ conta Pluggy (uma conta-corrente na F1)
    accountId: uuid("conta_id")                      // conta LOCAL
      .references(() => financialAccounts.id, { onDelete: "set null" }),
    pluggyAccountId: text("pluggy_account_id"),       // conta Pluggy vinculada

    // Status/consentimento — F1 só ARMAZENA, não age (fora do escopo agir)
    status: text("status"),                           // UPDATED / LOGIN_ERROR / ...
    consentExpiresAt: timestamp("consent_expires_at", {
      mode: "date", withTimezone: true,
    }),

    // Throttle do sync oportunístico
    lastSyncedAt: timestamp("last_synced_at", {
      mode: "date", withTimezone: true,
    }),

    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("openfinance_connections_user_id_idx").on(table.userId),
    pluggyItemIdUnique: uniqueIndex(
      "openfinance_connections_pluggy_item_id_key",
    ).on(table.userId, table.pluggyItemId),
  }),
);
```

**Decisão de modelagem (pergunta 2 do briefing):** o vínculo conta local ↔ conta
Pluggy fica **na `openfinance_connections`**, NÃO como coluna em `contas`. Motivo
verificado: `financialAccounts`/`contas`
([schema.ts:189-218](src/db/schema.ts#L189)) é uma tabela genérica e enxuta;
adicionar `pluggy_account_id` ali poluiria toda query de conta com um campo
OF-específico — mesmo argumento que já foi usado para NÃO colocar `nextRechargeDate`
na query genérica de dashboard (ver AGENTS.md, seção VR). A F1 vincula **1
conta-corrente**, então uma linha em `openfinance_connections` com
`accountId`+`pluggyAccountId` basta. `onDelete: set null` no `accountId` evita
quebrar a conexão se a conta local for apagada.

**Distinção item ≠ account (confirmada na captura — SANDBOX-SHAPE.md §b):** um
item tem `itemId` e possui **N accounts**, cada uma com seu próprio `id` (no
sandbox: BANK + CREDIT sob o mesmo `itemId`). Por isso a tabela guarda os DOIS
níveis: `pluggyItemId` (necessário pro `PATCH /items/{id}` e pro consentimento) E
o par `accountId` local ↔ `pluggyAccountId` (necessário pro
`GET /v2/transactions?accountId=`). `consentExpiresAt` é nível-**item**, não
account — por isso mora nesta tabela, uma vez por conexão.

**Campos adicionais definidos na implementação (registrados pra o PLAN não
divergir do schema):** `connector_name` (exibição do nome do banco na UI sem
chamada à Pluggy) e o unique `(user_id, pluggy_item_id)` (impede conexão
duplicada do mesmo item pro mesmo usuário).

### 2.3 O que a migration 0038 deve conter

1. `ALTER TABLE pre_lancamentos ADD COLUMN external_source_id text;`
2. `CREATE UNIQUE INDEX pre_lancamentos_external_source_id_key ON pre_lancamentos
   (user_id, external_source_id) WHERE external_source_id IS NOT NULL;`
3. `CREATE TABLE openfinance_connections (...)` + os 2 índices.

Tudo aditivo. Rollback trivial (§6).

---

## 3. Arquivos — novos e tocados

### 3.1 Novos (feature isolada, espelha `subscriptions/`)

| Arquivo | Papel |
|---|---|
| `src/features/openfinance/lib/pluggy-client.ts` | wrapper server-only: `auth()` interno (apiKey TTL 2h, re-auth única em 401/403), `listAccounts(itemId)`, `listTransactions(accountId, { createdAtFrom? })` — GET `/v2/transactions`, envelope `{results, next}`; **`cursor`/`page`/`limit` são REJEITADOS com 400** (SANDBOX-SHAPE.md §c), por isso o parâmetro é `createdAtFrom`, não cursor. `createConnectToken()`: **ADIADO** — necessário na UI de conexão (criação de item em prod), será capturado/especificado nesse sub-passo; fora do client da F1 até lá. Lê `PLUGGY_CLIENT_ID/SECRET` de `process.env` (padrão de [s3-client.ts:4-8](src/shared/lib/storage/s3-client.ts#L4)). |
| `src/features/openfinance/sync.ts` | `ensureOpenFinanceSynced(userId)`: throttle por `lastSyncedAt`, puxa transações da conta-corrente vinculada, insere na Inbox com dedup Camada 1+2. |
| `src/features/openfinance/lib/dedup.ts` | Camada 2: match por `(accountId, date, amount, description)` contra `pre_lancamentos` e `transactions`. |
| `src/features/openfinance/actions.ts` | conectar/desconectar item, gerar connect token (server action). |
| `src/features/openfinance/queries.ts` | ler conexões do usuário para a UI. |
| `src/app/api/openfinance/connect-token/route.ts` | endpoint server-side que gera o connect token pro widget Pluggy (nunca expõe a apiKey ao client). |
| UI de conexão (aba em `/settings` **ou** página) | conectar banco + status. Detalhar contra DESIGN.md §9 na fase de UI (fora deste .md, que é lógica). |
| `src/shared/lib/openfinance/flag.ts` (ou reuso de env) | `OPENFINANCE_ENABLED` — gate. |

### 3.2 Tocados (com risco de cada toque compartilhado)

| Arquivo | Mudança | Risco |
|---|---|---|
| [src/db/schema.ts](src/db/schema.ts) | coluna `externalSourceId` + índice em `inboxItems`; nova tabela `openFinanceConnections` | **Baixo.** Aditivo. Não altera colunas/índices existentes. |
| [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L28) | 1 chamada `await ensureOpenFinanceSynced(user.id)` em try/catch, ao lado da de assinaturas (linha 29), atrás da flag | **Baixo.** Mesmo padrão já ali. try/catch engole erro → não derruba dashboard. Custo: latência de sync no load — mitigado pelo throttle 1x/h. |
| UI do card/widget da Inbox (badge de fonte OF) | badge visual "Open Finance" + logo | **Baixo, opcional na F1.** `sourceAppName` livre já é renderizado por [inbox-widget.tsx:200-221](src/features/dashboard/components/widgets/inbox-widget.tsx#L200). Só cosmético. |

**Não tocar (confirmado):** `InboxProcessTypeDialog`, `TransactionDialog`,
`markInboxAsProcessedAction`, `handleLancamentoSuccess`, `fetchDashboardInboxSnapshot`,
rotas `api/inbox/*`. O item OF é apenas mais uma linha `pending` — o pipeline
existente cuida do resto (§1.1–1.4). **Este é o principal motivo de a F1 ser
barata: reusa 100% do fluxo, igual Assinaturas.**

---

## 4. Como cada peça funciona

### 4.1 Insert do item OF na Inbox (espelha assinatura)

Dentro de `ensureOpenFinanceSynced`, para cada transação Pluggy da conta-corrente:

```
INSERT pre_lancamentos {
  userId,
  sourceApp: "openfinance",
  sourceAppName: connectorName,        // nome do banco
  originalTitle: description,
  originalText: description,           // notNull — reusa description
  notificationTimestamp: date,         // data da transação
  parsedName: description,
  parsedAmount: amount,                // ⚠️ COM SINAL (negativo = despesa)
  status: "pending",
  externalSourceId: pluggyTransactionId,
}
.onConflictDoNothing({ target: [inboxItems.userId, inboxItems.externalSourceId] })
```

`parsedAmount` **com sinal** é o que faz o `defaultTransactionType` (§1.1) acertar a
direção sem tocar UI. `numeric(12,2)` aceita negativo. Confere com o uso atual, que
lê `parseFloat(parsedAmount) < 0`.

### 4.2 Dedup Camada 1 (id do Pluggy)

O `onConflictDoNothing` acima, amarrado ao uniqueIndex parcial `(userId,
externalSourceId)`. Garantia **no banco**, não em memória — mesma filosofia do 0035
(ver AGENTS.md). Dois polls concorrentes (2 abas) não duplicam.

### 4.3 Dedup Camada 2 (conteúdo — rede para pending→posted)

Antes de inserir, `dedup.ts` checa se já existe item/transação com `(accountId,
date, amount, description)` equivalente. Cobre o caso **pending→posted** (o Pluggy
troca o `id` da transação quando ela sai de pending para posted — confirmado DA
DOC, ver §5): a Camada 1 não pega (id mudou), a Camada 2 pega. Em F1, o
comportamento no conflito de Camada 2 é **não inserir** (conservador) OU **inserir
com flag de possível-duplicata** — decisão de UX a fechar na implementação; ambas
são aditivas. **Nunca deletar** o que já existe.

### 4.4 Direção despesa/receita (pergunta 4 — RESOLVIDA sem coluna nova)

**Não precisa campo novo.** Gravar `parsedAmount` com sinal já basta: o
`defaultTransactionType` deriva "Despesa" quando `parsedAmount < 0`
([inbox-page.tsx:557](src/features/inbox/components/inbox-page.tsx#L557)) e o
`defaultAmount` normaliza com `Math.abs`
([inbox-page.tsx:410](src/features/inbox/components/inbox-page.tsx#L410)). Verificado.

**CONFIRMADO POR TESTE no sandbox (SANDBOX-SHAPE.md §a):** em conta BANK, `type` e
sinal coincidem; em account **CREDIT**, toda compra vem `type: "CREDIT"` com
`amount` **negativo** — o campo `type` NÃO indica direção no cartão. Regra válida
para BANK e CREDIT: usar o **SINAL de `amount`** (negativo = despesa, positivo =
receita). Reforça a decisão de não criar coluna de direção.

### 4.5 Sync + throttle (pergunta 3)

`ensureOpenFinanceSynced(userId)` entra em
[dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx#L28), logo após o bloco
de `ensureDueSubscriptionsGenerated` (linha 29), no mesmo estilo try/catch, atrás da
flag `OPENFINANCE_ENABLED`:

```
if (process.env.OPENFINANCE_ENABLED === "true") {
  try { await ensureOpenFinanceSynced(user.id); }
  catch (e) { console.error("[ensureOpenFinanceSynced]", e); }
}
```

**Throttle:** a função lê `openfinance_connections.lastSyncedAt` da conexão do
usuário; se `now - lastSyncedAt < 1h`, retorna sem chamar Pluggy. Após um sync
bem-sucedido, grava `lastSyncedAt = now`. Padrão análogo ao `lastGeneratedPeriod`
das assinaturas, mas por tempo em vez de período. **Nunca cron** (decisão de stack).

**Rate-limit da própria Pluggy (observado no teste — SANDBOX-SHAPE.md §e):** o
`PATCH /items/{id}` é limitado a **1 update/item/hora** (HTTP 400 "Client updates
on this item are allowed at most every 1 hours"). Consequências:
(a) o throttle do app (`lastSyncedAt`) tem que ser **≥ 1h**;
(b) o handler no load do `/dashboard` DEVE engolir esse 400/429 como **no-op
silencioso** (igual `ensureDueSubscriptionsGenerated`) — nunca quebrar o load.

> ✅ **DECIDIDO (2026-07-25): GET passivo na F1** — sem `PATCH /items/{id}` no
> código da F1; somente GET (accounts/transactions), confiando na atualização
> automática do item pela Pluggy. Ressalva registrada: a frequência de auto-update
> em PRODUÇÃO é **DA DOC** (no sandbox o item atualizou sozinho, mas prod pode ser
> ~1x/dia dependendo de plano/conector) — frescor de até ~1 dia é aceitável pro
> caso de uso (Inbox, não saldo em tempo real). Reversão barata: se o dado se
> mostrar velho demais em prod, ligar PATCH depois é trocar uma chamada — o
> tratamento do rate-limit como no-op silencioso do item (b) acima já cobre esse
> cenário. Reavaliar quando webhook entrar (F2+).

---

## 5. Incertezas remanescentes (marcar honestamente)

| Item | Status | Nota |
|---|---|---|
| **`id` estável entre syncs** | **CONFIRMADO POR TESTE** (sandbox, 25/26 ids idênticos em 2 syncs reais do mesmo item; 1 sumiu, 0 nasceram, 0 trocas com conteúdo igual — SANDBOX-SHAPE.md §d) | Para transação postada e inalterada, o `id` é chave de dedup confiável (Camada 1). A troca de id em pending→posted segue **DA DOC** (não reproduzível no sandbox — só `POSTED` apareceu), por isso a Camada 2 continua como rede. |
| **Consumo do `next` (paginação de `/v2/transactions`)** | **Envelope `{results, next}` CONFIRMADO; consumo do `next` segue DA DOC** | Sandbox tem 1 página só: `next` veio `null`, e `cursor`/`page`/`limit` são **rejeitados** como query param (400). Consequência p/ F1: **evitar paginação via `createdAtFrom`** (param aceito) — sync incremental usa `createdAtFrom = lastSyncedAt (− folga)`; backfill inicial usa janela limitada (ex: −90d) pra caber em 1 página. Loop de paginação via `next` fica adiado pra validação em prod. **NÃO é bloqueador de F1.** |
| **Categoria em produção** | **NÃO DETERMINADO** | Pluggy devolve `category`, mas F1 decidiu **não inferir**. Em prod, mapear categoria Pluggy → categoria local é fase futura; F1 deixa em branco de propósito. |
| **Contrato exato de `/v2/transactions`** (nome do campo de id, formato do cursor) | **CONFIRMADO POR TESTE — shape completo capturado em SANDBOX-SHAPE.md §a/§c** | Campo de id é `id` (string UUID v4); envelope `{results, next}`; v1 dá 410. Ressalva que segue real: o consumo do `next` permanece **DA DOC** — ver a linha "Consumo do `next`" desta tabela. |
| **Cartão como account separado** | **CONFIRMADO POR TESTE** (SANDBOX-SHAPE.md §b: account `type: "CREDIT"` literal, `subtype: "CREDIT_CARD"`) | Filtro `type !== "CREDIT"` viável no nível de account, sem tocar nas transações do cartão. |
| **Consentimento (status/expiração)** | **DA DOC** | Vem no item Pluggy. F1 só **armazena** em `openfinance_connections`; não age. Sinalização na UI é fase 3. |

> ✅ **FEITO em 2026-07-25 — resultado em SANDBOX-SHAPE.md.** ~~Antes de escrever
> `pluggy-client.ts`, **reexecutar** os passos 1-5 da investigação da sessão
> anterior (auth → conector sandbox → item → accounts → transactions) **com as
> credenciais acessíveis ao processo do agente** — na última tentativa
> `PLUGGY_CLIENT_ID/SECRET` não estavam visíveis nem no Bash nem no PowerShell da
> sessão. Sem esse teste, o shape da transação continua hipótese.~~

---

## 6. Rollback

Migration 0038 é **puramente aditiva**:
- Código antigo ignora `external_source_id` (nullable) e a tabela nova → nada
  quebra se o código for revertido com a migration aplicada.
- Feature atrás de `OPENFINANCE_ENABLED`: pode-se mergear a coluna/tabela e o
  código **desligado**. Se a F1 falhar, basta manter a flag `false` — nenhum item OF
  é gerado, nenhum sync roda.
- Em prod a 0038 só chega no merge; se a F1 falhar em staging, **nunca é aplicada em
  prod**. Rollback = reverter o branch; a coluna/tabela órfãs no staging ficam
  inertes (drop opcional depois).

---

## 7. Checklist de teste em staging (prova a F1)

> `.env` local aponta pro staging (`sakura`); guard bloqueia migrate/push contra
> prod; nunca `DB_ALLOW_UNSAFE=1`. Migrations no Windows via `npx drizzle-kit
> generate` + `npx drizzle-kit migrate`.

1. **Migration aplica limpo no staging** — `drizzle-kit migrate` sobe a 0038 sem
   travar; conferir coluna `external_source_id`, índice parcial e tabela
   `openfinance_connections` no banco.
2. **Migration é no-op destrutivo-zero** — itens `pending` pré-existentes (Companion/
   assinatura) continuam com `external_source_id = NULL` e intactos.
3. **Conexão sandbox** — conectar o conector Sandbox Pluggy pelo widget; conexão
   grava linha em `openfinance_connections` com `pluggyItemId`, `accountId` local
   vinculado e `pluggyAccountId`.
4. **Só conta-corrente** — com um item sandbox que tenha BANK + CREDIT, confirmar que
   **só** transações da conta `type !== "CREDIT"` viram item na Inbox.
5. **Direção pelo sinal** — transação negativa vira item que, ao processar, abre o
   `TransactionDialog` já como **Despesa** com valor positivo; transação positiva →
   **Receita**. Sem tocar o modal.
6. **Categoria em branco** — o item processado não traz categoria pré-selecionada.
7. **Dedup Camada 1** — rodar o sync 2x seguidas (forçar o throttle a zero
   temporariamente em staging); a 2ª rodada **não** cria itens duplicados
   (`onConflictDoNothing` pega).
8. **Throttle** — com `lastSyncedAt` recente (<1h), o load do dashboard **não** chama
   a Pluggy (verificar por log/instrumentação).
9. **Fluxo Inbox intacto** — item OF processa via `InboxProcessTypeDialog →
   TransactionDialog → markInboxAsProcessedAction` igual Companion/assinatura;
   `status` vai a `processed`; transação criada corretamente.
10. **Não-regressão Companion/Assinatura** — gerar um item de assinatura e um item
    Companion no mesmo staging; ambos continuam processando normalmente (nenhum
    toque no fluxo compartilhado quebrou).
11. **Flag off** — com `OPENFINANCE_ENABLED` ausente/`false`, nenhum sync roda e
    nenhum item OF é gerado (mergear desligado é seguro).
12. **Nunca deleta** — remover uma transação no sandbox e re-sincronizar **não**
    apaga o item/transação já criado localmente.

---

## 8. Versão

Feature própria do fork, aditiva, estrutural (nova tabela + migration) → **minor →
`v3.1.0`** (base upstream v2.7.12), conforme a regra de versionamento do AGENTS.md.

---

**Não implementar sem aprovação explícita.** O gargalo do teste sandbox foi
resolvido (2026-07-25 — SANDBOX-SHAPE.md). A decisão PATCH-vs-GET está fechada
(§4.5: GET passivo na F1). Próximo passo: **migration 0038**.
