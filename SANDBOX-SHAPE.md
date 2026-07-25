# SANDBOX-SHAPE.md — Shape real da API Pluggy (Sandbox)

> Captura factual do contrato da API Pluggy, obtida executando contra o ambiente
> **Sandbox** (conector "Pluggy Bank", dados fictícios) com credenciais reais no
> ambiente do processo. Fonte de verdade para o futuro `pluggy-client.ts` — cada
> nome de campo abaixo é EXATO como veio na resposta, não suposição.
>
> **Não contém segredos.** Todos os ids de conexão (itemId, accountId, transaction
> id, apiKey, client id/secret) e PII fictícia estão redigidos como `<UUID>` /
> `<REDACTED>`. Capturado em 2026-07-25. Endpoint base: `https://api.pluggy.ai`.

## Como foi capturado
- `POST /auth` `{clientId, clientSecret}` → `{ apiKey }` (TTL 2h). Header de acesso:
  `X-API-KEY: <apiKey>`.
- Item Sandbox: conector **id 2 "Pluggy Bank"** (`isSandbox: true`), credenciais de
  teste `user-ok` / `password-ok` → item chega a `status: UPDATED`.
- `GET /accounts?itemId=<UUID>` → 2 accounts (BANK + CREDIT).
- `GET /v2/transactions?accountId=<UUID>` → transações (cursor).
- ⚠️ v1 `GET /transactions` responde **HTTP 410 ENDPOINT_DEPRECATED** → usar sempre
  `/v2/transactions`.

---

## a) TRANSAÇÃO — shape de `/v2/transactions`

**Todas as chaves de um objeto de transação** (ordem exata da resposta):

```
id, description, descriptionRaw, currencyCode, amount, amountInAccountCurrency,
date, category, categoryId, balance, accountId, providerCode, status, paymentData,
type, operationType, operationTypeAdditionalInfo, creditCardMetadata, merchant,
providerId, order, createdAt, updatedAt
```

| Campo | Formato observado | Nota |
|---|---|---|
| `id` | string **UUID v4** (ex: `<UUID>`) | Campo de id da transação. Estável entre syncs (ver §d). |
| `description` | string | Descrição tratada (ex: "Pagamento de boleto", "NETFLIX.COM"). |
| `descriptionRaw` | string \| **null** | Bruta; veio `null` em várias (ex: transação de cartão). Não confiar que sempre existe. |
| `amount` | **number** (não string) | **Com sinal.** Negativo e positivo observados. Ex: `-100`, `8500`, `-55.9`. |
| `amountInAccountCurrency` | number \| **null** | `null` no sandbox. |
| `currencyCode` | string | `"BRL"`. |
| `date` | string **ISO 8601 UTC** (sufixo `Z`) | Ex: `2026-05-01T03:00:00.000Z` (= meia-noite America/Sao_Paulo, UTC-3, para transações "por dia") e `2026-07-25T16:06:00.677Z` (timestamp real p/ transação criada no momento do sync). **Não há campo `postDate`/`purchaseDate` separado — só `date`.** |
| `category` / `categoryId` | string \| **null** | Ambos `null` no sandbox (categorização não populada aqui). |
| `balance` | number \| **null** | `null` em TODAS as transações do sandbox. Saldo agregado vem no `account.balance`, não por transação. |
| `accountId` | string UUID (`<UUID>`) | FK da account dona da transação. |
| `providerCode` / `providerId` | string \| **null** | `null` no sandbox. |
| `status` | string | **Só `"POSTED"` observado.** `"PENDING"` **NÃO apareceu** no sandbox (ver §d). |
| `paymentData` | object \| **null** | Presente em transferência/pagamento (ex: boleto). Sub-shape abaixo. |
| `type` | string | **`"DEBIT"` ou `"CREDIT"`.** ⚠️ NÃO é confiável para direção em cartão — ver "distinção crédito/débito". |
| `operationType` / `operationTypeAdditionalInfo` | null | `null` no sandbox. |
| `creditCardMetadata` | object \| **null** | Não-null só em transações de cartão (account CREDIT). Sub-shape abaixo. |
| `merchant` | object \| **null** | `null` no sandbox. |
| `order` | number | `0` no sandbox. |
| `createdAt` / `updatedAt` | string ISO 8601 UTC | Timestamps de sync (quando a Pluggy gravou), não da transação em si. |

**Distinção crédito vs débito (CONFIRMADO por teste):**
- Em conta **BANK**: `type` é fiel (`CREDIT` = entrada, ex salário `+8500`; `DEBIT` =
  saída, ex `-100`) **e** o sinal de `amount` acompanha.
- Em cartão **CREDIT**: **todas as compras vêm `type: "CREDIT"` com `amount`
  negativo** — `type` NÃO indica direção no cartão. **Regra segura para os dois
  tipos: usar o SINAL de `amount`** (negativo = despesa, positivo = receita).
  Isso valida a decisão do PLAN-openfinance-fase1.md §4.4.

**`paymentData` (quando presente — ex. boleto):**
```
payer:    { accountNumber, branchNumber, documentNumber:{type,value}, name,
            routingNumber, routingNumberISPB }
receiver: { accountNumber, branchNumber, documentNumber:{type,value}, name,
            routingNumber, routingNumberISPB }
paymentMethod (ex "BOLETO"), reason, receiverReferenceId, authenticationCode,
referenceNumber,
boletoMetadata: { barcode, baseAmount, discountAmount, digitableLine,
                  interestAmount, penaltyAmount }
```
> `documentNumber.value` (CPF/CNPJ) de payer e receiver é a única pista para inferir
> transferência mesmo-titular — não há id ligando as duas pernas. (Valores redigidos.)

**`creditCardMetadata` (só account CREDIT):**
```
installmentNumber, totalInstallments, totalAmount (com sinal), payeeMCC (número MCC),
billId (<UUID>), billForecastDate (ex "2023-07", YYYY-MM)
```

---

## b) ACCOUNT — shape de `/accounts?itemId=`

**Todas as chaves de um objeto de account:**
```
id, type, subtype, name, balance, currencyCode, itemId, number, createdAt,
updatedAt, marketingName, taxNumber, owner, bankData, creditData
```

| Campo | Conta-corrente | Cartão |
|---|---|---|
| `type` | **`"BANK"`** | **`"CREDIT"`** ← string literal exata do cartão |
| `subtype` | `"CHECKING_ACCOUNT"` | `"CREDIT_CARD"` |
| `id` | `<UUID>` | `<UUID>` |
| `itemId` | `<UUID>` | `<UUID>` |
| `name` | `"Conta Corrente"` | `"Mastercard Black"` |
| `marketingName` | ex "GOLD Conta Corrente" | ex "PLUGGY ... MASTERCARD BLACK" |
| `number` | ex "0001/12345-0" | ex "9437" (últimos dígitos) |
| `balance` | number (ex 21544.6) | number **negativo** (ex -503.1 = devedor) |
| `currencyCode` | "BRL" | "BRL" |
| `taxNumber` | `<REDACTED>` (CPF fictício) | `null` |
| `owner` | `<REDACTED>` (nome fictício) | `null` |
| `bankData` | object (ver abaixo) | `null` |
| `creditData` | `null` | object (ver abaixo) |

**`bankData` (conta):** `transferNumber, closingBalance, automaticallyInvestedBalance,
overdraftContractedLimit, overdraftUsedLimit, unarrangedOverdraftAmount,
hasReservedBalance, reservedBalances[]` (cada reserva:
`{name, identification:<UUID>, availableAmounts:[{amount, currencyCode, remuneration:{indexer,rateType,calculation,preFixedRate,ratePeriodicity}}]}`).

**`creditData` (cartão):** `level, brand, brandAdditionalInfo, balanceCloseDate
(YYYY-MM-DD), balanceDueDate (YYYY-MM-DD), availableCreditLimit, balanceForeignCurrency,
minimumPayment, creditLimit, isLimitFlexible, holderType, status (ex "ACTIVE"),
disaggregatedCreditLimits, additionalCards`.

> **Filtro F1** (`type !== "CREDIT"`): confirmado que dá para separar cartão da
> conta-corrente pelo `type` no nível de account, sem chamar `/v2/transactions` do
> cartão.

---

## c) CURSOR / paginação de `/v2/transactions`

- **Envelope da resposta:** `{ results: [...], next: <cursor|null> }`.
- **Fim da paginação:** campo **`next`** vem **`null`** na última (ou única) página.
  No sandbox só há 1 página, então `next` veio `null` e o valor não-null de `next`
  **não foi observável** (ver ⚠️).
- **Parâmetros de request TESTADOS:**
  - **aceitos:** `accountId` (obrigatório), `createdAtFrom` (data), `ids` (lista de
    ids de transação).
  - **rejeitados com 400 "property X should not exist":** `pageSize`, `page`,
    `cursor`, `limit`, `size`, `first`, `from`, `to`, `type`.
- ⚠️ **Como consumir o `next` (DA DOC / NÃO reproduzível no sandbox):** como
  `cursor`/`page` são rejeitados como query param, o `next` provavelmente é um
  cursor/URL opaco a seguir — **não confirmável** aqui porque o dataset do sandbox
  cabe em 1 página. Validar o mecanismo exato de continuação com dataset paginado
  (prod) antes de implementar o loop de paginação no `pluggy-client.ts`.

---

## d) ESTABILIDADE DE ID (CONFIRMADO por teste — 2 syncs do mesmo item)

Dois syncs reais consecutivos do mesmo item (sync#1 e sync#2, re-sync forçado via
`PATCH /items/{id}`):

- **25 de 26 ids IDÊNTICOS** entre os dois syncs.
- 1 transação **sumiu** (não recriada); **0 nasceram**.
- **0 ids trocados com conteúdo idêntico** → a transição **pending→posted NÃO é
  reproduzível no sandbox** (só `status: POSTED` aparece; ver §a).

**Conclusões:**
1. Para transação postada e inalterada, o `id` é **chave de dedup confiável (Camada
   1)** — comprovado.
2. O conjunto **pode encolher** entre syncs (transação some sem recriação) → o sync
   nunca deve deletar por sumiço (alinhado ao PLAN §0).
3. O caso **pending→posted troca id** permanece **DA DOC**, não provável no sandbox →
   justifica a **Camada 2 (match por conteúdo)** como rede.

---

## e) Erros / rate-limit observados (anotação, não investigação)

- `GET /transactions` (v1): **HTTP 410** `{code:410, "ENDPOINT_DEPRECATED", "Use GET
  /v2/transactions with cursor pagination instead"}`.
- Query param inválido em `/v2/transactions`: **HTTP 400** `{code:400, message:
  "property <x> should not exist"}`.
- Re-sync via `PATCH /items/{id}`: **rate-limit de 1 update/item/hora** —
  `{message: "Client updates on this item are allowed at most every 1 hours. Last
  update was at <timestamp>"}`. Relevante para o throttle do sync oportunístico
  (PLAN §4.5): a própria Pluggy já impõe 1x/h no update do item.
- Toda resposta de erro traz um `errorId` (UUID) além de `code`/`message`.
