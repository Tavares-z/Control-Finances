import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Wrapper server-only da API Pluggy (Open Finance).
 *
 * Contrato baseado na captura factual em `SANDBOX-SHAPE.md` (não em suposição):
 * - Auth: `POST /auth` `{clientId, clientSecret}` → `{ apiKey }` (TTL ~2h),
 *   enviado nas requisições via header `X-API-KEY`.
 * - Accounts: `GET /accounts?itemId=` → envelope paginado por página
 *   `{ total, totalPages, page, results }`.
 * - Transactions: `GET /v2/transactions?accountId=` → envelope por cursor
 *   `{ results, next }` (o v1 `GET /transactions` responde 410). O `next` é
 *   exposto CRU ao chamador (mecanismo de continuação ainda não verificado —
 *   ver SANDBOX-SHAPE.md §c).
 *
 * ⚠️ As credenciais (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`) são lidas só do
 * ambiente e NUNCA são logadas nem incluídas em mensagens de erro.
 */

const PLUGGY_API_URL = "https://api.pluggy.ai";

// ---------------------------------------------------------------------------
// Tipos (nomes de campo EXATOS conforme SANDBOX-SHAPE.md)
// ---------------------------------------------------------------------------

/** `account.type` — string literal observada; aberto a outros valores futuros. */
export type PluggyAccountType = "BANK" | "CREDIT" | (string & {});

/** `transaction.type` — direção NÃO confiável em cartão; usar sinal de `amount`. */
export type PluggyTransactionType = "DEBIT" | "CREDIT";

/** `transaction.status` — só `POSTED` visto no sandbox; `PENDING` é da doc. */
export type PluggyTransactionStatus = "POSTED" | "PENDING" | (string & {});

export interface PluggyBankData {
  transferNumber: string | null;
  closingBalance: number | null;
  automaticallyInvestedBalance: number | null;
  overdraftContractedLimit: number | null;
  overdraftUsedLimit: number | null;
  unarrangedOverdraftAmount: number | null;
  hasReservedBalance: boolean | null;
  reservedBalances: unknown[] | null;
}

export interface PluggyCreditData {
  level: string | null;
  brand: string | null;
  brandAdditionalInfo: string | null;
  balanceCloseDate: string | null;
  balanceDueDate: string | null;
  availableCreditLimit: number | null;
  balanceForeignCurrency: number | null;
  minimumPayment: number | null;
  creditLimit: number | null;
  isLimitFlexible: boolean | null;
  holderType: string | null;
  status: string | null;
  disaggregatedCreditLimits: unknown[] | null;
  additionalCards: unknown[] | null;
}

export interface PluggyAccount {
  id: string;
  type: PluggyAccountType;
  subtype: string | null;
  name: string | null;
  balance: number | null;
  currencyCode: string | null;
  itemId: string;
  number: string | null;
  createdAt: string;
  updatedAt: string;
  marketingName: string | null;
  taxNumber: string | null;
  owner: string | null;
  bankData: PluggyBankData | null;
  creditData: PluggyCreditData | null;
}

export interface PluggyCreditCardMetadata {
  installmentNumber: number | null;
  totalInstallments: number | null;
  totalAmount: number | null;
  payeeMCC: number | null;
  billId: string | null;
  billForecastDate: string | null;
}

export interface PluggyTransaction {
  id: string;
  description: string | null;
  descriptionRaw: string | null;
  currencyCode: string | null;
  /** COM sinal: negativo = despesa, positivo = receita. `number`, não string. */
  amount: number;
  amountInAccountCurrency: number | null;
  /** ISO 8601 UTC (sufixo `Z`). Único campo de data — não há postDate/purchaseDate. */
  date: string;
  category: string | null;
  categoryId: string | null;
  balance: number | null;
  accountId: string;
  providerCode: string | null;
  status: PluggyTransactionStatus;
  paymentData: unknown | null;
  type: PluggyTransactionType;
  operationType: string | null;
  operationTypeAdditionalInfo: string | null;
  creditCardMetadata: PluggyCreditCardMetadata | null;
  merchant: unknown | null;
  providerId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Envelope cru de `GET /v2/transactions`. `next` exposto sem tratamento. */
export interface PluggyTransactionsPage {
  results: PluggyTransaction[];
  /**
   * Cursor de continuação, exposto CRU. Só `null` observado no sandbox; o
   * formato não-null é DA DOC — tipar como `string` quando validado em prod.
   * O check `next !== null` do chamador funciona igual com `unknown`.
   */
  next: unknown;
}

/**
 * Consentimento de um item Pluggy (aninhado em `item.consent`). Só modelamos
 * `expiresAt` (ISO 8601), que é o dado que persistimos; o resto do objeto de
 * consentimento não é usado — deixamos aberto sem tipar campo inventado.
 */
export interface PluggyConsent {
  /** ISO 8601 da expiração do consentimento; pode vir null/ausente. */
  expiresAt?: string | null;
}

/**
 * Item Pluggy (`GET /items/{id}`). Modelamos conservadoramente só o que o A2
 * usa: `id`, `status` (cru — ex.: `UPDATED`, `LOGIN_ERROR`, `OUTDATED`, …) e a
 * expiração do consentimento. `executionStatus` é opcional (detalhe do último
 * ciclo de atualização). Não inventamos os demais campos do item.
 */
export interface PluggyItem {
  id: string;
  /** Status cru do item; string aberta — não restringimos a um enum fixo. */
  status: string;
  /** Detalhe do último ciclo de atualização; opcional. */
  executionStatus?: string | null;
  /** Consentimento aninhado; ausente/null em alguns itens. */
  consent?: PluggyConsent | null;
}

/** Envelope paginado por página de `GET /accounts`. */
interface PluggyAccountsEnvelope {
  total: number;
  totalPages: number;
  page: number;
  results: PluggyAccount[];
}

interface PluggyAuthResponse {
  apiKey: string;
}

interface PluggyConnectTokenResponse {
  accessToken: string;
}

interface PluggyErrorBody {
  message?: string;
  code?: number;
  codeDescription?: string;
  errorId?: string;
}

// ---------------------------------------------------------------------------
// Erro tipado
// ---------------------------------------------------------------------------

/**
 * Erro de chamada à API Pluggy. NUNCA carrega credenciais — só o status HTTP e
 * os campos que a própria API devolve (`code`/`message`/`errorId`).
 */
export class PluggyApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly errorId?: string;

  constructor(
    status: number,
    message: string,
    options?: { code?: number; errorId?: string },
  ) {
    super(message);
    this.name = "PluggyApiError";
    this.status = status;
    this.code = options?.code;
    this.errorId = options?.errorId;
  }
}

// ---------------------------------------------------------------------------
// Auth (apiKey em cache de módulo, com re-auth única em 401/403)
// ---------------------------------------------------------------------------

// TTL real da apiKey é ~2h; expiramos com folga para evitar corrida com a borda.
const API_KEY_TTL_MS = 110 * 60 * 1000;

let cachedApiKey: string | null = null;
let cachedApiKeyExpiresAt = 0;

function readCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // Mensagem sem valores — só sinaliza ausência.
    throw new PluggyApiError(
      500,
      "PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET ausentes no ambiente.",
    );
  }
  return { clientId, clientSecret };
}

async function authenticate(): Promise<string> {
  const { clientId, clientSecret } = readCredentials();
  const res = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Não repassar o corpo cru do /auth para evitar ecoar qualquer credencial.
    throw new PluggyApiError(res.status, "Falha na autenticação com a Pluggy.");
  }

  const data = (await res.json()) as PluggyAuthResponse;
  if (!data?.apiKey) {
    throw new PluggyApiError(500, "Resposta de /auth sem apiKey.");
  }

  cachedApiKey = data.apiKey;
  cachedApiKeyExpiresAt = Date.now() + API_KEY_TTL_MS;
  return data.apiKey;
}

async function getApiKey(): Promise<string> {
  if (cachedApiKey && Date.now() < cachedApiKeyExpiresAt) {
    return cachedApiKey;
  }
  return authenticate();
}

// ---------------------------------------------------------------------------
// Request base (GET) com re-auth única em 401/403
// ---------------------------------------------------------------------------

async function pluggyGet<T>(path: string): Promise<T> {
  const doFetch = (apiKey: string) =>
    fetch(`${PLUGGY_API_URL}${path}`, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });

  let apiKey = await getApiKey();
  let res = await doFetch(apiKey);

  // Uma única tentativa de re-auth se a apiKey expirou/foi revogada.
  if (res.status === 401 || res.status === 403) {
    cachedApiKey = null;
    cachedApiKeyExpiresAt = 0;
    apiKey = await authenticate();
    res = await doFetch(apiKey);
  }

  if (!res.ok) {
    let body: PluggyErrorBody | null = null;
    try {
      body = (await res.json()) as PluggyErrorBody;
    } catch {
      // corpo não-JSON — segue com null
    }
    throw new PluggyApiError(
      res.status,
      body?.message ?? `Pluggy respondeu HTTP ${res.status}.`,
      { code: body?.code, errorId: body?.errorId },
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Request base (POST) com re-auth única em 401/403
// ---------------------------------------------------------------------------

async function pluggyPost<T>(path: string, body: unknown): Promise<T> {
  const doFetch = (apiKey: string) =>
    fetch(`${PLUGGY_API_URL}${path}`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

  let apiKey = await getApiKey();
  let res = await doFetch(apiKey);

  // Uma única tentativa de re-auth se a apiKey expirou/foi revogada.
  if (res.status === 401 || res.status === 403) {
    cachedApiKey = null;
    cachedApiKeyExpiresAt = 0;
    apiKey = await authenticate();
    res = await doFetch(apiKey);
  }

  if (!res.ok) {
    let errBody: PluggyErrorBody | null = null;
    try {
      errBody = (await res.json()) as PluggyErrorBody;
    } catch {
      // corpo não-JSON — segue com null
    }
    throw new PluggyApiError(
      res.status,
      errBody?.message ?? `Pluggy respondeu HTTP ${res.status}.`,
      { code: errBody?.code, errorId: errBody?.errorId },
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Request base (DELETE) com re-auth única em 401/403
// ---------------------------------------------------------------------------

async function pluggyDelete<T>(path: string): Promise<T> {
  const doFetch = (apiKey: string) =>
    fetch(`${PLUGGY_API_URL}${path}`, {
      method: "DELETE",
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });

  let apiKey = await getApiKey();
  let res = await doFetch(apiKey);

  // Uma única tentativa de re-auth se a apiKey expirou/foi revogada.
  if (res.status === 401 || res.status === 403) {
    cachedApiKey = null;
    cachedApiKeyExpiresAt = 0;
    apiKey = await authenticate();
    res = await doFetch(apiKey);
  }

  if (!res.ok) {
    let body: PluggyErrorBody | null = null;
    try {
      body = (await res.json()) as PluggyErrorBody;
    } catch {
      // corpo não-JSON — segue com null
    }
    throw new PluggyApiError(
      res.status,
      body?.message ?? `Pluggy respondeu HTTP ${res.status}.`,
      { code: body?.code, errorId: body?.errorId },
    );
  }

  // O DELETE de item devolve corpo pequeno/ausente; alguns endpoints Pluggy
  // respondem 200 com JSON, outros 204 sem corpo. Não impomos JSON: tentamos
  // ler e caímos para undefined quando não há corpo (ex.: 204).
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Gera um connect token (accessToken) para inicializar o widget Pluggy Connect.
 * `POST /connect_token`, autenticado com a apiKey (mesmo fluxo das demais).
 *
 * @param options.itemId      se presente, o widget abre em modo UPDATE do item.
 * @param options.webhookUrl  se presente, a Pluggy associa este webhook ao item
 *   criado/atualizado por este token — é como as conexões passam a receber
 *   `item/error`, `transactions/created`, etc. em tempo real (Webhooks).
 * @returns `{ accessToken }` — trate como segredo: dá acesso ao widget; nunca
 *   logar/ecoar. Erros NÃO carregam o token nem credenciais.
 */
export async function createConnectToken(options?: {
  itemId?: string;
  webhookUrl?: string;
}): Promise<{ accessToken: string }> {
  const body: { itemId?: string; webhookUrl?: string } = {};
  if (options?.itemId) body.itemId = options.itemId;
  if (options?.webhookUrl) body.webhookUrl = options.webhookUrl;
  const data = await pluggyPost<PluggyConnectTokenResponse>(
    "/connect_token",
    body,
  );
  if (!data?.accessToken) {
    throw new PluggyApiError(500, "Resposta de /connect_token sem accessToken.");
  }
  return { accessToken: data.accessToken };
}

/**
 * Lista as accounts de um item. Desembrulha o `results` do envelope paginado
 * `{ total, totalPages, page, results }`.
 */
export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const query = new URLSearchParams({ itemId });
  const env = await pluggyGet<PluggyAccountsEnvelope>(
    `/accounts?${query.toString()}`,
  );
  // Falhar alto em vez de engolir páginas: uma account silenciosamente ausente
  // numa conexão é bug difícil de diagnosticar. Caso hoje teoricamente
  // impossível (nunca observado > 1 página — ver SANDBOX-SHAPE.md §b).
  if (env.totalPages > 1) {
    throw new PluggyApiError(
      500,
      `GET /accounts retornou ${env.totalPages} páginas; paginação de accounts não é suportada (nunca observada — ver SANDBOX-SHAPE.md §b).`,
    );
  }
  return env.results;
}

/**
 * Lista transações de uma account via `GET /v2/transactions` (cursor).
 * Retorna o envelope cru `{ results, next }` — o `next` é exposto sem
 * tratamento (ver SANDBOX-SHAPE.md §c: mecanismo de continuação não verificado).
 *
 * @param accountId    account Pluggy (obrigatório).
 * @param createdAtFrom filtro opcional (aceito pela API: `createdAtFrom`).
 */
export async function listTransactions(
  accountId: string,
  options?: { createdAtFrom?: string },
): Promise<PluggyTransactionsPage> {
  const query = new URLSearchParams({ accountId });
  if (options?.createdAtFrom) {
    query.set("createdAtFrom", options.createdAtFrom);
  }
  return pluggyGet<PluggyTransactionsPage>(
    `/v2/transactions?${query.toString()}`,
  );
}

/**
 * Exclui um item na Pluggy: `DELETE /items/{itemId}`. Encerra a conexão do lado
 * da Pluggy (item + consentimento). Usado no fluxo best-effort de desconexão —
 * o chamador decide se uma falha aqui aborta ou só é logada.
 *
 * Retorno CRU do endpoint (200 com JSON ou 204 sem corpo → `undefined`). O
 * chamador do fluxo de desconexão ignora o valor; a tipagem `unknown` reflete
 * que o corpo não é contratual. Erros viram `PluggyApiError` (sem credenciais).
 */
export async function deleteItem(itemId: string): Promise<unknown> {
  return pluggyDelete<unknown>(`/items/${encodeURIComponent(itemId)}`);
}

/**
 * Lê o estado real de um item: `GET /items/{id}`. Usado pela detecção de status
 * do A2 (login expirado etc.) — o chamador grava `item.status` cru e a
 * expiração do consentimento na conexão. Reusa `pluggyGet` (auth/erro já
 * tratados). Erros viram `PluggyApiError` (sem credenciais).
 */
export async function getItem(itemId: string): Promise<PluggyItem> {
  return pluggyGet<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
}

// ---------------------------------------------------------------------------
// Validação de assinatura de webhook (HMAC-SHA512)
// ---------------------------------------------------------------------------

/**
 * Verifica a assinatura de um webhook Pluggy.
 *
 * A Pluggy assina o CORPO CRU da requisição com HMAC-SHA512 e envia a
 * assinatura em base64 no header `X-HMAC-SHA512-Signature`. A verificação
 * recomputa o HMAC sobre o corpo cru (NÃO sobre o JSON re-serializado — qualquer
 * reordenação/reespaçamento quebraria o match) e compara em tempo constante.
 *
 * Rotação de secret: a Pluggy expõe DOIS secrets — CURRENT (ativo) e NEXT (o que
 * assumirá numa rotação). Verificamos contra CURRENT e caímos para NEXT quando
 * presente, para que uma rotação não derrube a recepção. Passe os dois secrets
 * que estiverem configurados; `undefined`/`""` são ignorados.
 *
 * ⚠️ `rawBody` DEVE ser exatamente os bytes recebidos (via `request.text()`),
 * nunca `JSON.stringify(await request.json())`.
 *
 * @returns `true` se a assinatura casar com CURRENT ou NEXT; `false` caso
 *   contrário (inclui header ausente ou nenhum secret configurado).
 */
export function verifyPluggyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secrets: { current?: string; next?: string },
): boolean {
  if (!signatureHeader) return false;

  // Assinatura recebida em base64 → bytes. Corpo malformado (não-base64) →
  // rejeita sem lançar.
  let receivedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  if (receivedBuf.length === 0) return false;

  const candidates = [secrets.current, secrets.next].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (candidates.length === 0) return false;

  for (const secret of candidates) {
    const expectedBuf = createHmac("sha512", secret)
      .update(rawBody, "utf8")
      .digest();
    // timingSafeEqual exige buffers de mesmo tamanho — o length check evita o
    // throw e já descarta assinaturas de tamanho errado.
    if (
      receivedBuf.length === expectedBuf.length &&
      timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}
