# AGENTS.md — Control-Finances (fork OpenMonetis)

> Este é o documento de instruções do projeto, neutro entre IAs. O Claude Code o
> carrega automaticamente via o import `@AGENTS.md` no `CLAUDE.md` da raiz.

## Visão Geral
- **Projeto:** Control-Finances — fork pessoal do OpenMonetis, deployado no Railway
- **Upstream:** https://github.com/felipegcoutinho/openmonetis (versionamento semver, releases por tag)
- **Fork local:** `C:\OpenMonetis-dev` (Windows, PowerShell + VS Code) — preencher URL do remote `origin` aqui: https://github.com/Tavares-z/Control-Finances
- **Sync atual:** upstream v2.7.12 (completo — falta só os workflows de CI/CD, por decisão; ver "Estado do Sync" abaixo e [`CHANGELOG.md`](./CHANGELOG.md))

## Contexto de Fork e Atualizações — REGRAS OBRIGATÓRIAS
1. **NUNCA sugerir merge automático** de uma nova versão do upstream sem antes verificar conflitos com as customizações abaixo.
2. Ao lidar com uma nova versão do upstream, Claude DEVE pedir primeiro:
   ```bash
   git fetch upstream
   git --no-pager log vX.Y.Z..upstream/main --stat
   ```
   e analisar quais arquivos tocam nas áreas customizadas antes de qualquer ação.

3. **Nunca presumir que um arquivo está intocado.** Sempre pedir a versão local (`type caminho\arquivo`) E a versão upstream (`git --no-pager show "upstream/main:caminho/arquivo" > arquivo.txt`) antes de sugerir substituição.
4. Sempre gerar arquivos completos para substituição — nunca snippets parciais com instrução de inserção.
5. Migrations com numeração conflitante (upstream reusa número já usado localmente) → NÃO renomear manualmente .sql/snapshot.json. Resolver portando as mudanças pro schema.ts e rodando drizzle-kit generate, que encadeia certo a partir do snapshot local.
6. Caminhos com parênteses no PowerShell (`(dashboard)`) exigem aspas no comando inteiro, não só no nome do arquivo de saída.

## Regra de Verificação (qualquer contexto, não só upstream)
Essa regra vale para TODA conversa neste projeto, não só merge de upstream — inclusive brainstorming, avaliação de features, e análise de viabilidade.

- NUNCA afirme que algo existe/não existe, é fácil/difícil, ou precisa/não precisa de mudança (migration, refactor, nova dependência) sem antes ler o arquivo real que comprova isso.
- Proibido usar "provavelmente", "assumo que", "acho que", "deve ser" quando o arquivo está disponível para leitura — nesses casos, leia primeiro e afirme com certeza, ou não afirme.
- Se delegar pesquisa a um subagente (Explore, general-purpose, etc.), trate o retorno dele como HIPÓTESE, não fato. Antes de repassar a conclusão ao usuário como certeza — especialmente se ela vai embasar uma recomendação tipo "vale a pena implementar" ou "não precisa migration" — confirme com leitura direta (Read/Grep) do(s) arquivo(s) citado(s) pelo subagente.
- Se não for possível verificar (arquivo não encontrado, ambíguo, etc.), diga isso explicitamente em vez de hedgear.
- Depois de editar código com duas ou mais variáveis/maps de tipo igual e fácil de confundir (ex: dois Maps construídos a partir de queries paralelas, valores com mesmo tipo mas significado diferente), releia o bloco editado inteiro e rastreie cada variável até sua origem antes de rodar typecheck/build. Typecheck não pega troca semântica entre duas variáveis do mesmo tipo — só reler o código pega (aconteceu de verdade na sessão que corrigiu `currentInvoiceAmount` em `cards/queries.ts`, quase inverteu `usageMap`/`invoiceMap`).
- ⚠️ Invariante de query em `cards/queries.ts`: `currentInvoiceAmount` deve somar TODAS as transações do período sem excluir faturas PAID (igual `fetchDashboardInvoices`/`fetchInvoiceData`). Reaproveitar a query de limite ali (que exclui PAID) zera o valor exibido assim que a fatura é marcada paga e esconde transações novas do mesmo cartão/período. Preservar ao sincronizar.
- Quando perguntado sobre gaps/riscos do sistema ("tem algum gap que você identifique?"), não faça varredura módulo por módulo — simule mentalmente, ponta a ponta, os fluxos de usuário que cruzam ≥2 features customizadas (ver lista em "Minhas Customizações" abaixo: Assinaturas × Inbox × Import × Fatura, Metas × Attachments, Companion × Auth). Os bugs mais caros vivem na interação entre features que isoladamente parecem corretas, não dentro de uma única feature.

## Regra de Design (DESIGN.md é fonte de verdade visual)
O arquivo [`DESIGN.md`](./DESIGN.md) na raiz define o design system do projeto (direção visual, tokens, tipografia, componentes, layout, acessibilidade). Ele é a FONTE DE VERDADE para qualquer decisão de UI — e vale tanto para código novo quanto para sync de upstream.

- SEMPRE que uma alteração tocar UI (novo widget, form, dialog, card, cor, ícone, layout, estado vazio/loading/erro), ler o DESIGN.md ANTES de escrever o componente e validar contra o "Checklist de revisão visual" (seção 9) ANTES de concluir.
- Regras não-negociáveis do DESIGN.md: (1) reutilizar componentes de `src/shared/components/ui/` em vez de recriar; (2) usar tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`, `success`/`warning`/`info`/`destructive`, `chart-1..10`/`data-1..6`) — proibido hex ou valor arbitrário quando já existe token; (3) validar tema claro E escuro; (4) nunca comunicar estado só por cor (incluir label/ícone/tooltip); (5) foco visível com `ring`, labels associados a inputs, nome acessível em botão de ícone.
- Toda fuga consciente do DESIGN.md (ex: `<input type="date">` nativo no account-form no lugar do `DatePicker` compartilhado, por causa do bug de Popover-em-Dialog do Radix) DEVE ser registrada com o motivo, aqui no AGENTS.md ou em comentário no código — pra não parecer descuido numa auditoria futura.
- Ao sincronizar upstream: se o upstream mexer em `globals.css` (tokens), `src/shared/components/ui/` ou `public/fonts/`, tratar como mudança de design system e reconciliar com o DESIGN.md, não só aplicar o diff cru.

## Minhas Customizações (preservar sempre)

### Metas Financeiras
tabela metas, migration local (era 0031, ver histórico de migrations), CRUD completo, página /metas (abas Ativas/Concluídas/Arquivadas), widget top-3 no dashboard, tool consultar_metas na IA. Imagem de capa opcional (migration 0034, goals.coverAttachmentId → attachments, ON DELETE SET NULL): foto de referência da meta (ex: destino de viagem), exibida no topo do card quando presente — NÃO substitui o seletor de ícones, que continua sempre visível e funcional independente de ter capa ou não. Reaproveita a tabela attachments/storage S3 já existente, mas com fluxo de upload próprio em src/features/goals/actions.ts (getGoalCoverUploadUrlAction/confirmGoalCoverUploadAction/removeGoalCoverAction, token assinado por goalId em vez de transactionId, já que o fluxo original de attachments em transactions/actions/attachments.ts é acoplado a transactionId e não é genérico). Só aceita JPEG/PNG/WebP, máx. 5MB. Constante GOAL_COVER_MAX_SIZE_MB fica em src/features/goals/lib/goal-cover-config.ts (não no actions.ts) porque arquivos "use server" só podem exportar async functions — exportar uma const ali quebra o módulo inteiro no build (erro só aparece no `next build`, não no `tsc`). deleteGoalAction limpa o attachment de capa (linha em attachments + objeto S3) antes de excluir a meta, mesmo padrão de removeGoalCoverAction — sem isso, sobra lixo órfão no S3.

### Assinaturas/Despesas Fixas
tabela assinaturas (migration 0033) + coluna inboxItems.subscriptionId, CRUD completo em src/features/subscriptions/, página /assinaturas (abas Ativas/Pausadas/Canceladas, item no menu), widget "Assinaturas" no dashboard, tool consultar_assinaturas na IA. Não confundir com o "Recorrente" nativo (condition="Recorrente" em transactions, materializa N transações de uma vez no registro) — Assinaturas é para cobrança contínua de duração indefinida (Netflix, aluguel): quando vence, gera 1 pré-lançamento pending no Inbox (sourceApp="assinatura") via ensureDueSubscriptionsGenerated, chamada oportunisticamente a cada load do /dashboard (sem cron — decisão explícita, ver histórico da sessão que implementou). subscriptions.lastGeneratedPeriod evita gerar duplicado no mesmo mês. Reaproveita 100% o fluxo existente do Inbox (InboxProcessTypeDialog → TransactionDialog → markInboxAsProcessedAction), nenhuma mudança lá. Relatório em /reports/subscriptions (projeção anual de 12 meses dos gastos fixos ativos, breakdown por categoria, export) — fetchSubscriptionsAnnualProjection em src/features/reports/subscriptions/queries.ts, item no menu de Relatórios. Ao confirmar no Inbox um pré-lançamento de assinatura com valor diferente do cadastrado, syncSubscriptionAmountAction atualiza o valor esperado automaticamente — TransactionDialog.onSuccess passou a receber { amount } do valor confirmado (breaking change de assinatura da prop, verificar outros usos antes de mexer). syncSubscriptionAmountAction só atualiza se status="ativa" (evita sobrescrever valor de assinatura pausada/cancelada entre a geração do item no Inbox e a confirmação tardia).

⚠️ Assinatura com cardId setado NÃO gera item no Inbox: se a assinatura é cobrada no cartão, o gasto já vai aparecer quando a fatura for importada/reconciliada (import de OFX/planilha não cruza com Inbox por nome — só dedup por ofxFitId) — gerar Inbox também duplicaria o lançamento. `ensureDueSubscriptionsGenerated` (src/features/subscriptions/generate-due-inbox-items.ts) pula a geração e só carimba lastGeneratedPeriod quando cardId existe. subscription-card.tsx mostra aviso "Cobrada na fatura do cartão — não gera item no Inbox" quando aplicável. Isso só cobre assinaturas SEM cardId (débito/pix), onde o Inbox é a única fonte de registro.

Geração de Inbox de assinatura é protegida contra duplicidade por corrida (duas abas, ou web+Companion quase simultâneos): migration 0035 adiciona pre_lancamentos.assinatura_periodo (YYYY-MM) + uniqueIndex parcial em (assinatura_id, assinatura_periodo) WHERE assinatura_id IS NOT NULL. O insert usa onConflictDoNothing amarrado nessa constraint — a garantia de não-duplicidade é do banco, não mais de lastGeneratedPeriod lido em memória (que sozinho tinha janela de corrida read-then-write).

### Monetinha (ChatWidget)
tabela mensagens_chat, colunas chat_model/chat_personality em preferencias_usuario, widget de chat no layout do dashboard, anexos (jpg/png/webp/pdf até 10MB), modo full-screen, modal de insight (ESC fecha antes de minimizar), aba "Assistente" em /settings com assistant-form.tsx, action updateChatSettings (limpa histórico se o modelo mudar). Tools da IA (em src/app/api/chat/route.ts): registrar_transacao, consultar_resumo_mensal, listar_transacoes, consultar_metas, consultar_assinaturas, consultar_orcamento (limite/gasto/restante por categoria no período, via fetchBudgetsForUser), consultar_projecao_caixa, consultar_saldo_vr. Queries de leitura do chat em src/features/chat/lib/execute-chat-queries.ts; contexto injetado por buildChatContext (src/features/chat/lib/build-chat-context.ts).

⚠️ Invariantes do chat que evitam a IA "opinar no olho" (todos vieram de bugs reais em que a Monetinha contradizia o resto do app — preservar ao sincronizar route.ts / execute-chat-queries.ts / build-chat-context.ts):
1. **Realizado x agendado.** `consultar_resumo_mensal` e `listar_transacoes` aceitam `apenasRealizado` (mapeia p/ `untilToday` nas queries → `purchaseDate <= current_date`). Sem isso, "quanto gastei ATÉ AGORA" somava lançamentos agendados no futuro (data 21/22 do mês) como se já tivessem sido gastos. `buildChatContext` injeta a data de hoje (via `getBusinessDateString`, timezone America/Sao_Paulo) — antes só o período (YYYY-MM) ia no contexto, e a IA não tinha como saber o que era futuro. Default é o mês inteiro (comportamento antigo), só filtra quando a IA pede.
2. **Filtro por conta que IGNORA a exclusão de saldo.** As duas queries aceitam `accountId` opcional. Quando presente, o WHERE filtra a conta E deixa de aplicar `excludeTransactionsFromExcludedAccounts()` — porque a conta de VR/VA é `excludeFromBalance=true`, então a exclusão zerava os gastos dela e a IA acabava juntando contas no olho (chegou a contar uma despesa da 99pay como gasto de VR). A proteção por `userId` permanece; o filtro de conta só estreita dentro do próprio conjunto do usuário. Sem `accountId`, a exclusão de saldo continua valendo (visão geral).
3. **Veredito de VR reusa a query do widget.** `consultar_saldo_vr` chama `fetchDashboardVrBalance` (a MESMA de src/features/dashboard/vr/vr-balance-queries.ts que alimenta o widget) e devolve o veredito já traduzido em `vereditoTexto`. O prompt manda a IA repassar esse texto e NÃO formar julgamento próprio de "saldo saudável/apertado" — senão o chat contradiz o widget (aconteceu: chat dizia "saldo super saudável" enquanto o widget dizia "ritmo não fecha o ciclo", porque a IA só via transações soltas sem a lógica de ritmo/dias-até-recarga). O enum verdict (fecha/aperta/nao-fecha/impreciso) é mapeado p/ frase no route.ts.

### Saldo VR/VA (widget de dashboard)
widget "Saldo VR/VA" (id `vr-balance`, registrado em widget-config.tsx logo após `cash-flow`) que mostra saldo do benefício, quanto dá pra gastar por dia até a próxima recarga, ritmo atual de consumo e veredito (fecha/aperta/não fecha). O widget em si é de leitura; a única coluna que grava é a data-alvo opcional da próxima recarga (ver parágrafo abaixo). Query em src/features/dashboard/vr/vr-balance-queries.ts (`fetchDashboardVrBalance`), plugada no `Promise.all` de fetch-dashboard-data.ts como `vrBalanceSnapshot`; componente em components/widgets/vr-balance-widget.tsx. Só renderiza conteúdo se existir conta com accountType `"Pré-Pago | VR/VA"`.

Data-alvo opcional da próxima recarga (migration 0036, `contas.proxima_recarga` = `nextRechargeDate`, `date` nullable, sem default): campo "Próxima recarga" que só aparece no form de conta quando accountType é `"Pré-Pago | VR/VA"` (input `<input type="date">` nativo em account-form-fields.tsx — de propósito, não o DatePicker com Popover, que quebra dentro de Dialog pelo bug do Radix documentado em Stack Técnica). Quando preenchida E futura (`configuredNextRecharge > today`), ela CRAVA `daysRemaining` (dias corridos de hoje até a data) e o "disponível por dia" recalcula sobre ela, no lugar da estimativa por histórico; quando vazia ou já vencida, cai de volta na estimativa. Degradação suave: não atualizar a data nunca quebra o widget. A leitura da coluna é feita direto em `fetchDashboardVrBalance` (query pontual pela conta VR já identificada) — NÃO em `fetchDashboardAccounts`, de propósito, pra não poluir a query genérica de dashboard com um campo VR-específico. O snapshot ganhou `nextRechargeDate` + `nextRechargeIsManual`; o widget mostra "Próxima recarga em … · data informada" e suprime o "ciclo de 30d presumido" quando a data é manual. Não fere a rejeição do `recargaDia` (item 1 das decisões de design abaixo): aquilo era dia-do-mês fixo recorrente (que mente nos meses em que VR varia); isto é data pontual única — ou está certa, ou está vazia, nunca "meio errada" sozinha, e o usuário reinforma a cada ciclo (não "aprende"/avança sozinha — decisão explícita de manter aditivo, sem tocar no fluxo de lançamento de receita; revisitar se quiser auto-avanço). O tipo de entrada da `createAccountAction`/`updateAccountAction` passou de `z.infer` para `z.input` porque o form envia string e a action re-parseia (preprocess: `""`/ausente → null, senão exige YYYY-MM-DD e converte com `parseLocalDateString`) — `z.infer` mentiria sobre o tipo do payload que o dialog monta.

⚠️ Esse widget depende de um comportamento não-óbvio de `fetchDashboardAccounts` (dashboard/lib/accounts-queries.ts): o WHERE dela é só `userId`, e `excludeFromBalance` é aplicado DEPOIS, apenas no cálculo do `totalBalance` — o array `accounts` sai completo. É isso que permite ler a conta de VR (que normalmente tem `excludeFromBalance = true`) sem query própria e sem violar a convenção do resto do dashboard, onde `excludeTransactionsFromExcludedAccounts()` é aplicado em toda parte (budgets/queries.ts, cash-flow-queries.ts, reports/establishments/queries.ts). Se um sync futuro do upstream mover esse filtro para dentro do WHERE de `fetchDashboardAccounts`, o widget zera silenciosamente — typecheck não pega. A query tem comentário explicando a exceção deliberada; preservar ao sincronizar.

Decisões de design que já foram testadas contra alternativa e devem ser preservadas: (1) a data da recarga é INFERIDA da receita mais recente da conta, não configurada — chegou a existir plano de uma coluna `recargaDia` (int) em `contas`, descartado porque VR não cai em dia fixo e o campo ou mentiria ou viraria manutenção mensal; (2) a duração do ciclo sai da média dos intervalos entre as últimas 4 recargas (fallback 30 dias sem histórico); (3) o ritmo diário usa dias corridos, INCLUINDO fim de semana (o usuário usa VR no fim de semana — não "corrigir" pra dias úteis); (4) o veredito é suprimido nos 3 primeiros dias do ciclo (`MIN_DAYS_FOR_VERDICT`) porque um gasto alto no dia 1 projetaria um mês catastrófico. A recarga é identificada como receita excluindo `INITIAL_BALANCE_NOTE` e `REFUND_NOTE_PREFIX`, mesmo tratamento do `fetchAccountSummary`. Todas as queries filtram `isSettled = true` — recarga lançada como não-liquidada é invisível pro widget.

Nota de modelagem (VR/VA): cartão de VR/VA NÃO deve ser cadastrado como cartão. A tabela `cartoes` exige `closingDay`/`dueDay` notNull — é toda construída em cima de fatura, e VR é saldo pré-pago sem fatura. O modelo correto é a conta do tipo `"Pré-Pago | VR/VA"` sendo o próprio cartão; o "crédito" na maquininha é só a rede de captura. Ao lançar, usar a forma de pagamento `"Pré-Pago | VR/VA"` — payment-method-section.tsx filtra o select de conta por esse accountType exato.

### Saldo inicial editável na edição de conta
o campo "Saldo inicial" passou a aparecer também na edição de conta (antes só na criação — `showInitialBalance={mode === "create"}` em account-dialog.tsx, agora sem a prop, valendo o default `true` de account-form-fields.tsx). Corrigir o saldo de abertura de uma conta existente deixou de exigir SQL manual. NÃO era trava proposital do upstream — a `updateAccountAction` original já gravava `initialBalance` na coluna a cada save; o campo só não era renderizado na edição (investigado no git: nenhuma validação ou comentário bloqueando, o backend sempre foi permissivo).

⚠️ Invariante crítico preservado por `syncInitialBalanceTransaction` (src/features/accounts/actions.ts): o saldo inicial vive em DUAS representações que precisam bater — a coluna `contas.saldo_inicial` (fonte de verdade de todo cálculo de saldo; queries fazem `saldo_inicial + soma(lançamentos)` excluindo o lançamento de saldo inicial via `when note = INITIAL_BALANCE_NOTE then 0`, ver accounts/queries.ts, dashboard/lib/accounts-queries.ts, accounts/statement-queries.ts) E o lançamento "Saldo inicial - <conta>" (nota minúscula `INITIAL_BALANCE_NOTE`, existe só pra aparecer como linha no extrato). O helper é um upsert idempotente reusado por createAccountAction E updateAccountAction, rodando dentro de db.transaction: valor>0 e existe → atualiza amount/name; valor>0 e não existe → cria; valor==0 e existe → remove (sem linha órfã). Localiza o lançamento por `accountId + note = INITIAL_BALANCE_NOTE`. Sem esse helper, editar saldo inicial deixaria coluna e lançamento divergentes — bug latente que já existia no código original do upstream (o update gravava a coluna sem tocar no lançamento). Se um sync futuro do upstream reescrever updateAccountAction/createAccountAction, PRESERVAR a chamada ao helper. Cuidado com a nota case-sensitive: o filtro é `=` (não `ilike`), então lançamento manual com nota "Saldo inicial" (S maiúsculo) NÃO é reconhecido e entra em "Entradas" (foi o que aconteceu na conta 99pay, saldo lançado à mão em vez de pelo campo).

### Forma de pagamento "Saldo em conta"
forma de pagamento adicionada ao fork (não existe no upstream): representa débito genérico direto do saldo da conta (ex: pagar 99food com saldo da carteira/débito automático), distinta de Pix/Boleto/Transferência bancária apenas no RÓTULO — contabilmente todas debitam a conta selecionada igual. Existe porque forçar "Pix" num débito que não foi Pix sujava o widget de formas de pagamento com dado errado. Comportamento igual a Pix/Boleto: abre seletor de conta livre (sem filtro de accountType), exige `accountId`, deriva período da data de compra pelo caminho genérico. NÃO é migration — `contas`/`transacoes.forma_pagamento` é `text` livre, absorve a string nova; renomear uma forma existente em vez de adicionar quebraria histórico (a string é persistida crua, sem tradução). Pontos tocados: `PAYMENT_METHODS` em transactions/lib/constants.ts, array `showContaSelect` em payment-method-section.tsx, registry `saldoemconta`→RiWalletLine em shared/utils/icons.tsx, e o `z.enum` de `registrar_transacao` em api/chat/route.ts (a Monetinha precisa do valor no enum senão o Zod rejeita o registro; o handler executeRegisterTransaction já trata genérico — só ramifica "Cartão de crédito" vs resto). Ao sincronizar upstream que reescreva PAYMENT_METHODS ou o enum do chat, RE-ADICIONAR o valor nos dois lugares.

### Inbox Process Type
modal "Como deseja registrar?" (Despesa/Receita/Transferência entre contas) ao processar pré-lançamento — inbox-process-type-dialog.tsx, inbox-transfer-dialog.tsx

### validatePayerOwnership
em core.ts — existe no fork, não existe no upstream atual (divergência antiga, não mexer sem investigar)

### Companion (device auth)
/api/auth/device/verify retorna expiresAt (campo que o app Android Companion sempre esperou mas nunca recebia) — divergência do upstream, preservar ao sincronizar essa rota. Fork público do Companion em github.com/Tavares-z/openmonetis-companion (Kotlin/Android, repo separado) com fixes de confiabilidade: recuperação de notificação travada em SYNCING, aviso de expiração de token na tela de Ajustes.

## Stack Técnica
Next.js 16 App Router, PostgreSQL + Drizzle ORM, pnpm, Railway, OpenRouter, AI SDK ^6.0.191 (Zod v4 interno)

UI em português, código em inglês, commits em Conventional Commits (português)

Imports: @/shared/lib/db, @/shared/lib/auth/config, @/shared/components/ui/

Server Actions: Zod + try/catch + ActionResponse; forms com useTransition

Ícones: Remixicon via getIconComponent()

Migrations no Windows: npx drizzle-kit generate + npx drizzle-kit migrate (pnpm falha no postinstall)

Erro EPERM symlink no npm run build local é conhecido e não bloqueia deploy no Railway (Linux) — não perder tempo tentando "corrigir"

`next build` local pode travar (worker principal com CPU parada, sem progresso por 15-20min) sem erro nenhum — não é o mesmo problema do EPERM. Se acontecer: matar os processos node do build (taskkill /F /T), e se travar de novo na segunda tentativa, aceitar `npx tsc --noEmit` + `npx biome check` como validação suficiente em vez de insistir — o Railway builda em Linux de qualquer forma

Lockfile no Windows: usar sempre `pnpm install --ignore-scripts` (nunca `pnpm install` puro) — contorna o postinstall com `cp`, que falha no cmd.exe. O Dockerfile roda o postinstall de verdade dentro do container Linux; `public/pdf.worker.min.mjs` precisa ser copiado manualmente depois (`Copy-Item node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`) já que fica desatualizado no repo com scripts ignorados.

⚠️ Radix duplicado: bumps de `@radix-ui/*` podem deixar duas versões de um sub-pacote compartilhado (`dismissable-layer`, `popper`, `focus-scope`) instaladas — dois contextos React, e o Dialog nunca restaura `pointer-events` pro Popover que abre dentro dele (calendário do DatePicker fica inclicável). Fix vigente: override de `@radix-ui/react-dismissable-layer` numa única versão no `pnpm-workspace.yaml`. Em bumps futuros, checar duplicidade com `Get-ChildItem node_modules/.pnpm -Filter "@radix-ui+react-<pacote>@*"`.

## Versionamento do Fork
O fork tem sua **própria linha de versão**, independente do upstream, começando em **`v3.0.0`** (primeira release do fork, base upstream v2.7.12). A escolha do `v3.x` (em vez de `v1.0.0`) foi deliberada: o repo já carrega todas as tags do upstream (`v2.1.0`…`v2.7.12`) por causa dos syncs, então uma tag `v1.0.0` afundaria no meio delas e pareceria antiga — `v3.x` continua acima do upstream e mantém um único eixo de versão no repo.

Regras ao lançar uma release do fork:
- **Um só eixo de versão** (`v3.x`). NÃO criar prefixo separado (`control-v…`, `fork-v…`) nem reusar a numeração do upstream — as tags do upstream já convivem no repo e um segundo esquema vira confusão a cada sync.
- **Portar um fix/feature do upstream** = patch ou minor SEU, não o número do upstream. Ex: upstream lança `v2.7.13`, você porta → vira `v3.0.1` (patch) ou `v3.1.0` (minor), nunca `v2.7.13`/`v2.7.14`.
- **Feature própria do fork** (Metas, Assinaturas, VR, Monetinha, etc.) = `minor` (`v3.1.0`); bugfix = `patch` (`v3.0.1`); breaking change estrutural = `major` (`v4.0.0`).
- **Sempre registrar a base do upstream no TÍTULO da release** — formato `vX.Y.Z — Control-Finances (base upstream vA.B.C)` — e detalhar no corpo. Decisão explícita: a correspondência com o upstream é um *metadado* que mora no título/corpo, NÃO no número da tag (numerar a tag igual ao upstream foi avaliado e descartado — colide no `git fetch` quando o upstream lança a mesma versão, e não acomoda features próprias do fork como Metas/Assinaturas/VR/Monetinha, que não existem no upstream). O título dá a rastreabilidade "bato o olho e sei a qual upstream corresponde" sem os problemas de amarrar o número.
- Release = **git tag anotada + GitHub Release** no `Tavares-z/Control-Finances` (não duplicar o conteúdo no `CHANGELOG.md`, que já é o diário técnico). ⚠️ O `gh` pode resolver o repo pro upstream por engano — sempre passar `--repo Tavares-z/Control-Finances` explicitamente.

## Estado do Sync
Sync atual: upstream **v2.7.12** (de v2.7.2). Histórico detalhado de cada bloco portado está em [`CHANGELOG.md`](./CHANGELOG.md) (changelog do fork). Invariantes e gotchas que sobreviveram ao sync estão preservados nas seções acima (Stack Técnica, Minhas Customizações, Regra de Verificação), não aqui.

Pendência conhecida: **workflows CI/CD** (`.github/workflows`) não sincronizados — o upstream removeu `docker-publish.yml`, reescreveu `release.yml` e adicionou `ci.yml`. Decisão explícita de não mexer: o fork usa Railway, não Docker Hub/GitHub Releases. Revisitar só se precisar de algo específico.

⚠️ Formato do `CHANGELOG.md` diverge do upstream: no upstream, o `CHANGELOG.md` segue Keep-a-Changelog (`## [x.y.z] - data`) e é **lido por parser** em dois lugares — a aba "Changelog" em Ajustes (histórico mostrado ao usuário no app) e o workflow `release.yml` (extrai a entrada da versão pra criar a GitHub Release). No fork, o `CHANGELOG.md` virou formato próprio (changelog do fork) e o formato Keep-a-Changelog do upstream mora em `CHANGELOG.upstream.md`. Se for sincronizar a aba Changelog ou o `release.yml`, apontar o parser pra `CHANGELOG.upstream.md` — aplicar o diff cru faz o parser não casar e a tela/release quebrar em silêncio.

Ao bumpar dependências no sync: `better-auth` fica pinado em **1.6.23** (não 1.6.22 do upstream) por peer dependency de `@better-auth/passkey@1.6.23` — rodar `pnpm peers check` depois de bumps.

## Comandos de Sobrevivência (Tokens)
/clear — usar ao trocar completamente de tarefa/contexto (ex: terminou o bloco de settings, vai começar dashboard)

/compact — usar quando a conversa está longa mas ainda no mesmo bloco de trabalho, pra resumir sem perder o fio

/context — usar pra checar quanto de contexto já foi consumido antes de decidir se compacta ou limpa

/statusline — usar pra manter visibilidade rápida de custo/contexto sem precisar rodar /context toda hora

## Regra de Modelos
Sonnet para 95% das tarefas (merges, geração de arquivos, debugging, análise de diffs)

Opus só para raciocínio profundamente complexo (ex: redesenho de arquitetura, decisão estrutural de schema) — e apenas com autorização explícita minha antes de trocar

## Regra de Caching e Output
Output custa ~5x mais que input — pedir respostas diretas, sem repetir código que não mudou, sem preâmbulo desnecessário

Preferir diffs/trechos quando a mudança é pequena e NÃO exigir arquivo completo; arquivo completo só quando for pra substituição real

## 📌 Regra de Atualização deste Documento (AGENTS.md)
**NUNCA atualize este arquivo automaticamente sem minha autorização explícita.**

**Quando atualizar:** Ao final de uma sessão onde implementamos uma nova feature estrutural, mudança de stack ou alteração em regra de negócio que precisa ser preservada em futuros merges, você DEVE me perguntar:

> "Implementamos [feature X]. Quer que eu atualize o AGENTS.md para refletir essa mudança?"

Se eu responder "sim", você deve:

1. Analisar o que mudou na sessão.
2. Atualizar as seções relevantes (especialmente "Minhas Customizações"). O
   conteúdo real vive neste `AGENTS.md`; o `CLAUDE.md` da raiz é só um stub
   (`@AGENTS.md`) — nunca escrever conteúdo lá.
3. Me entregar o conteúdo novo, pronto para copiar, colar e commitar.

**NUNCA atualize por mudanças triviais** (bugfixes, ajustes de UI, refatorações internas) — isso é ruído desnecessário.