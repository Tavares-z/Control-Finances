# CLAUDE.md — Control-Finances (fork OpenMonetis)

## Visão Geral
- **Projeto:** Control-Finances — fork pessoal do OpenMonetis, deployado no Railway
- **Upstream:** https://github.com/felipegcoutinho/openmonetis (versionamento semver, releases por tag)
- **Fork local:** `C:\OpenMonetis-dev` (Windows, PowerShell + VS Code) — preencher URL do remote `origin` aqui: https://github.com/Tavares-z/Control-Finances
- **Sync atual:** upstream v2.7.2 → v2.7.12 (completo — falta só os workflows de CI/CD, deixados de fora por decisão, ver "Estado do Sync" abaixo)

## Contexto de Fork e Atualizações — REGRAS OBRIGATÓRIAS
1. **NUNCA sugerir merge automático** de uma nova versão do upstream sem antes verificar conflitos com as customizações abaixo.
2. Ao lidar com uma nova versão do upstream, Claude DEVE pedir primeiro:
   ```bash
   git fetch upstream
   git --no-pager log vX.Y.Z..upstream/main --stat
e analisar quais arquivos tocam nas áreas customizadas antes de qualquer ação.

Nunca presumir que um arquivo está intocado. Sempre pedir a versão local (type caminho\arquivo) E a versão upstream (git --no-pager show "upstream/main:caminho/arquivo" > arquivo.txt) antes de sugerir substituição.

Sempre gerar arquivos completos para substituição — nunca snippets parciais com instrução de inserção.

Migrations com numeração conflitante (upstream reusa número já usado localmente) → NÃO renomear manualmente .sql/snapshot.json. Resolver portando as mudanças pro schema.ts e rodando drizzle-kit generate, que encadeia certo a partir do snapshot local.

Caminhos com parênteses no PowerShell ((dashboard)) exigem aspas no comando inteiro, não só no nome do arquivo de saída.

## Regra de Verificação (qualquer contexto, não só upstream)
Essa regra vale para TODA conversa neste projeto, não só merge de upstream — inclusive brainstorming, avaliação de features, e análise de viabilidade.

- NUNCA afirme que algo existe/não existe, é fácil/difícil, ou precisa/não precisa de mudança (migration, refactor, nova dependência) sem antes ler o arquivo real que comprova isso.
- Proibido usar "provavelmente", "assumo que", "acho que", "deve ser" quando o arquivo está disponível para leitura — nesses casos, leia primeiro e afirme com certeza, ou não afirme.
- Se delegar pesquisa a um subagente (Explore, general-purpose, etc.), trate o retorno dele como HIPÓTESE, não fato. Antes de repassar a conclusão ao usuário como certeza — especialmente se ela vai embasar uma recomendação tipo "vale a pena implementar" ou "não precisa migration" — confirme com leitura direta (Read/Grep) do(s) arquivo(s) citado(s) pelo subagente.
- Se não for possível verificar (arquivo não encontrado, ambíguo, etc.), diga isso explicitamente em vez de hedgear.
- Depois de editar código com duas ou mais variáveis/maps de tipo igual e fácil de confundir (ex: dois Maps construídos a partir de queries paralelas, valores com mesmo tipo mas significado diferente), releia o bloco editado inteiro e rastreie cada variável até sua origem antes de rodar typecheck/build. Typecheck não pega troca semântica entre duas variáveis do mesmo tipo — só reler o código pega (aconteceu de verdade na sessão que corrigiu `currentInvoiceAmount` em `cards/queries.ts`, quase inverteu `usageMap`/`invoiceMap`).
- Quando perguntado sobre gaps/riscos do sistema ("tem algum gap que você identifique?"), não faça varredura módulo por módulo — simule mentalmente, ponta a ponta, os fluxos de usuário que cruzam ≥2 features customizadas (ver lista em "Minhas Customizações" abaixo: Assinaturas × Inbox × Import × Fatura, Metas × Attachments, Companion × Auth). Os bugs mais caros vivem na interação entre features que isoladamente parecem corretas, não dentro de uma única feature.

Minhas Customizações (preservar sempre)
Metas Financeiras: tabela metas, migration local (era 0031, ver histórico de migrations), CRUD completo, página /metas (abas Ativas/Concluídas/Arquivadas), widget top-3 no dashboard, tool consultar_metas na IA. Imagem de capa opcional (migration 0034, goals.coverAttachmentId → attachments, ON DELETE SET NULL): foto de referência da meta (ex: destino de viagem), exibida no topo do card quando presente — NÃO substitui o seletor de ícones, que continua sempre visível e funcional independente de ter capa ou não. Reaproveita a tabela attachments/storage S3 já existente, mas com fluxo de upload próprio em src/features/goals/actions.ts (getGoalCoverUploadUrlAction/confirmGoalCoverUploadAction/removeGoalCoverAction, token assinado por goalId em vez de transactionId, já que o fluxo original de attachments em transactions/actions/attachments.ts é acoplado a transactionId e não é genérico). Só aceita JPEG/PNG/WebP, máx. 5MB. Constante GOAL_COVER_MAX_SIZE_MB fica em src/features/goals/lib/goal-cover-config.ts (não no actions.ts) porque arquivos "use server" só podem exportar async functions — exportar uma const ali quebra o módulo inteiro no build (erro só aparece no `next build`, não no `tsc`). deleteGoalAction limpa o attachment de capa (linha em attachments + objeto S3) antes de excluir a meta, mesmo padrão de removeGoalCoverAction — antes deixava lixo órfão no S3 (fix sessão 2026-07-13).

Assinaturas/Despesas Fixas: tabela assinaturas (migration 0033) + coluna inboxItems.subscriptionId, CRUD completo em src/features/subscriptions/, página /assinaturas (abas Ativas/Pausadas/Canceladas, item no menu), widget "Assinaturas" no dashboard, tool consultar_assinaturas na IA. Não confundir com o "Recorrente" nativo (condition="Recorrente" em transactions, materializa N transações de uma vez no registro) — Assinaturas é para cobrança contínua de duração indefinida (Netflix, aluguel): quando vence, gera 1 pré-lançamento pending no Inbox (sourceApp="assinatura") via ensureDueSubscriptionsGenerated, chamada oportunisticamente a cada load do /dashboard (sem cron — decisão explícita, ver histórico da sessão que implementou). subscriptions.lastGeneratedPeriod evita gerar duplicado no mesmo mês. Reaproveita 100% o fluxo existente do Inbox (InboxProcessTypeDialog → TransactionDialog → markInboxAsProcessedAction), nenhuma mudança lá. Relatório em /reports/subscriptions (projeção anual de 12 meses dos gastos fixos ativos, breakdown por categoria, export) — fetchSubscriptionsAnnualProjection em src/features/reports/subscriptions/queries.ts, item no menu de Relatórios. Ao confirmar no Inbox um pré-lançamento de assinatura com valor diferente do cadastrado, syncSubscriptionAmountAction atualiza o valor esperado automaticamente — TransactionDialog.onSuccess passou a receber { amount } do valor confirmado (breaking change de assinatura da prop, verificar outros usos antes de mexer). syncSubscriptionAmountAction só atualiza se status="ativa" (evita sobrescrever valor de assinatura pausada/cancelada entre a geração do item no Inbox e a confirmação tardia).

⚠️ Assinatura com cardId setado NÃO gera item no Inbox (fix pós-lançamento, sessão 2026-07-13): se a assinatura é cobrada no cartão, o gasto já vai aparecer quando a fatura for importada/reconciliada (import de OFX/planilha não cruza com Inbox por nome — só dedup por ofxFitId) — gerar Inbox também duplicaria o lançamento. `ensureDueSubscriptionsGenerated` (src/features/subscriptions/generate-due-inbox-items.ts) pula a geração e só carimba lastGeneratedPeriod quando cardId existe. subscription-card.tsx mostra aviso "Cobrada na fatura do cartão — não gera item no Inbox" quando aplicável. Isso só cobre assinaturas SEM cardId (débito/pix), onde o Inbox é a única fonte de registro.

Geração de Inbox de assinatura é protegida contra duplicidade por corrida (duas abas, ou web+Companion quase simultâneos): migration 0035 adiciona pre_lancamentos.assinatura_periodo (YYYY-MM) + uniqueIndex parcial em (assinatura_id, assinatura_periodo) WHERE assinatura_id IS NOT NULL. O insert usa onConflictDoNothing amarrado nessa constraint — a garantia de não-duplicidade é do banco, não mais de lastGeneratedPeriod lido em memória (que sozinho tinha janela de corrida read-then-write).

Monetinha (ChatWidget): tabela mensagens_chat, colunas chat_model/chat_personality em preferencias_usuario, widget de chat no layout do dashboard, anexos (jpg/png/webp/pdf até 10MB), modo full-screen, modal de insight (ESC fecha antes de minimizar), aba "Assistente" em /settings com assistant-form.tsx, action updateChatSettings (limpa histórico se o modelo mudar). Tools da IA: consultar_metas, consultar_assinaturas, consultar_orcamento (limite/gasto/restante por categoria no período, via fetchBudgetsForUser)

Saldo VR/VA (widget de dashboard): widget "Saldo VR/VA" (id `vr-balance`, registrado em widget-config.tsx logo após `cash-flow`) que mostra saldo do benefício, quanto dá pra gastar por dia até a próxima recarga, ritmo atual de consumo e veredito (fecha/aperta/não fecha). Feature 100% aditiva e de leitura — sem migration, sem schema, sem server action. Query em src/features/dashboard/vr/vr-balance-queries.ts (`fetchDashboardVrBalance`), plugada no `Promise.all` de fetch-dashboard-data.ts como `vrBalanceSnapshot`; componente em components/widgets/vr-balance-widget.tsx. Só renderiza conteúdo se existir conta com accountType `"Pré-Pago | VR/VA"`.

⚠️ Esse widget depende de um comportamento não-óbvio de `fetchDashboardAccounts` (dashboard/lib/accounts-queries.ts): o WHERE dela é só `userId`, e `excludeFromBalance` é aplicado DEPOIS, apenas no cálculo do `totalBalance` — o array `accounts` sai completo. É isso que permite ler a conta de VR (que normalmente tem `excludeFromBalance = true`) sem query própria e sem violar a convenção do resto do dashboard, onde `excludeTransactionsFromExcludedAccounts()` é aplicado em toda parte (budgets/queries.ts, cash-flow-queries.ts, reports/establishments/queries.ts). Se um sync futuro do upstream mover esse filtro para dentro do WHERE de `fetchDashboardAccounts`, o widget zera silenciosamente — typecheck não pega. A query tem comentário explicando a exceção deliberada; preservar ao sincronizar.

Decisões de design que já foram testadas contra alternativa e devem ser preservadas: (1) a data da recarga é INFERIDA da receita mais recente da conta, não configurada — chegou a existir plano de uma coluna `recargaDia` (int) em `contas`, descartado porque VR não cai em dia fixo e o campo ou mentiria ou viraria manutenção mensal; (2) a duração do ciclo sai da média dos intervalos entre as últimas 4 recargas (fallback 30 dias sem histórico); (3) o ritmo diário usa dias corridos, INCLUINDO fim de semana (o usuário usa VR no fim de semana — não "corrigir" pra dias úteis); (4) o veredito é suprimido nos 3 primeiros dias do ciclo (`MIN_DAYS_FOR_VERDICT`) porque um gasto alto no dia 1 projetaria um mês catastrófico. A recarga é identificada como receita excluindo `INITIAL_BALANCE_NOTE` e `REFUND_NOTE_PREFIX`, mesmo tratamento do `fetchAccountSummary`. Todas as queries filtram `isSettled = true` — recarga lançada como não-liquidada é invisível pro widget.

Nota de modelagem (VR/VA): cartão de VR/VA NÃO deve ser cadastrado como cartão. A tabela `cartoes` exige `closingDay`/`dueDay` notNull — é toda construída em cima de fatura, e VR é saldo pré-pago sem fatura. O modelo correto é a conta do tipo `"Pré-Pago | VR/VA"` sendo o próprio cartão; o "crédito" na maquininha é só a rede de captura. Ao lançar, usar a forma de pagamento `"Pré-Pago | VR/VA"` — payment-method-section.tsx filtra o select de conta por esse accountType exato.

Saldo inicial editável na edição de conta (PR #4): o campo "Saldo inicial" passou a aparecer também na edição de conta (antes só na criação — `showInitialBalance={mode === "create"}` em account-dialog.tsx, agora sem a prop, valendo o default `true` de account-form-fields.tsx). Corrigir o saldo de abertura de uma conta existente deixou de exigir SQL manual. NÃO era trava proposital do upstream — a `updateAccountAction` original já gravava `initialBalance` na coluna a cada save; o campo só não era renderizado na edição (investigado no git: nenhuma validação ou comentário bloqueando, o backend sempre foi permissivo).

⚠️ Invariante crítico preservado por `syncInitialBalanceTransaction` (src/features/accounts/actions.ts): o saldo inicial vive em DUAS representações que precisam bater — a coluna `contas.saldo_inicial` (fonte de verdade de todo cálculo de saldo; queries fazem `saldo_inicial + soma(lançamentos)` excluindo o lançamento de saldo inicial via `when note = INITIAL_BALANCE_NOTE then 0`, ver accounts/queries.ts, dashboard/lib/accounts-queries.ts, accounts/statement-queries.ts) E o lançamento "Saldo inicial - <conta>" (nota minúscula `INITIAL_BALANCE_NOTE`, existe só pra aparecer como linha no extrato). O helper é um upsert idempotente reusado por createAccountAction E updateAccountAction, rodando dentro de db.transaction: valor>0 e existe → atualiza amount/name; valor>0 e não existe → cria; valor==0 e existe → remove (sem linha órfã). Localiza o lançamento por `accountId + note = INITIAL_BALANCE_NOTE`. Sem esse helper, editar saldo inicial deixaria coluna e lançamento divergentes — bug latente que já existia no código original do upstream (o update gravava a coluna sem tocar no lançamento). Se um sync futuro do upstream reescrever updateAccountAction/createAccountAction, PRESERVAR a chamada ao helper. Cuidado com a nota case-sensitive: o filtro é `=` (não `ilike`), então lançamento manual com nota "Saldo inicial" (S maiúsculo) NÃO é reconhecido e entra em "Entradas" (foi o que aconteceu na conta 99pay, saldo lançado à mão em vez de pelo campo).

Inbox Process Type: modal "Como deseja registrar?" (Despesa/Receita/Transferência entre contas) ao processar pré-lançamento — inbox-process-type-dialog.tsx, inbox-transfer-dialog.tsx

validatePayerOwnership em core.ts — existe no fork, não existe no upstream atual (divergência antiga, não mexer sem investigar)

Companion (device auth): /api/auth/device/verify retorna expiresAt (campo que o app Android Companion sempre esperou mas nunca recebia) — divergência do upstream, preservar ao sincronizar essa rota. Fork público do Companion em github.com/Tavares-z/openmonetis-companion (Kotlin/Android, repo separado) com fixes de confiabilidade: recuperação de notificação travada em SYNCING, aviso de expiração de token na tela de Ajustes.

Stack Técnica
Next.js 16 App Router, PostgreSQL + Drizzle ORM, pnpm, Railway, OpenRouter, AI SDK ^6.0.191 (Zod v4 interno)

UI em português, código em inglês, commits em Conventional Commits (português)

Imports: @/shared/lib/db, @/shared/lib/auth/config, @/shared/components/ui/

Server Actions: Zod + try/catch + ActionResponse; forms com useTransition

Ícones: Remixicon via getIconComponent()

Migrations no Windows: npx drizzle-kit generate + npx drizzle-kit migrate (pnpm falha no postinstall)

Erro EPERM symlink no npm run build local é conhecido e não bloqueia deploy no Railway (Linux) — não perder tempo tentando "corrigir"

`next build` local pode travar (worker principal com CPU parada, sem progresso por 15-20min) sem erro nenhum — não é o mesmo problema do EPERM. Se acontecer: matar os processos node do build (taskkill /F /T), e se travar de novo na segunda tentativa, aceitar `npx tsc --noEmit` + `npx biome check` como validação suficiente em vez de insistir — o Railway builda em Linux de qualquer forma

Estado do Sync (v2.7.2 → v2.7.12)
✅ Migrations (schema.ts, colisão 0031 resolvida → gerado 0032)
✅ Settings/Monetinha (page.tsx, actions.ts, queries.ts, preferences-form.tsx)
✅ Checkbox compacto (estilo upstream adotado)
✅ Transações tabela/lista (12 arquivos: columns, mobile-list, actions-menu, page, table, core, single-actions, export-actions, page-helpers, date.ts, installment-detection.ts, actions barrel)
✅ Wiring de groupTransactionsByDate nas páginas que chamam <TransactionsPage>: /transactions, accounts/[accountId]/statement, cards/[cardId]/invoice, categories/[categoryId], payers/[payerId] (commit b278399)
✅ Dashboard widgets: vínculo de tendências às categorias — nome da categoria no widget "Tendências de categorias" agora linka para /categories/[id], novo dashboard-widget-list-styles.ts (commit 2b8e82a)
✅ Popovers de fatura/data: fix "corrigir seleção de faturas em popovers" — modal em Popover + type="button" em botões de formulário (commit 9a702a0)
✅ Anexos (filtro por pessoa) — Select de pessoa na página de anexos, fetchAttachmentsForPeriod aceita payerScope opcional (commit a228369)
✅ Import de planilhas (mapeamento automático de categoria) — coluna "Categoria" no .xlsx, match por nome com as categorias do usuário (commit 3a65b54)
✅ Cards (destacar fatura paga) — badge "Paga" no valor da fatura atual quando currentInvoiceStatus é PAID (commit d587ff0). ⚠️ currentInvoiceAmount (cards/queries.ts) reaproveitava a mesma query de limite em uso, que exclui faturas PAID — zerava o valor exibido assim que a fatura era marcada como paga, e escondia transações novas que entrassem no mesmo cartão/período depois. Corrigido pra somar todas as transações do período sem excluir PAID, igual já fazem fetchDashboardInvoices e fetchInvoiceData (fix sessão 2026-07-13)
✅ Config/infra (deps, docker) — completo, exceto CI/CD (decisão explícita de não mexer, ver abaixo):
  - BETTER_AUTH_TRUSTED_ORIGINS documentado em .env.example/docker-compose.yml (commit 3515d8c). Nota: só documentação — nem o upstream lê essa env var em config.ts ainda, sem efeito funcional
  - pdfjs-dist ^5.7.284 → ^6.0.227 (major) — único breaking change [api-major] relevante era getDocument(url) exigir getDocument({ url }), corrigido em attachment-grid-item.tsx (commits e377781, bd0a781)
  - Resto do bump de dependências (package.json → versão 2.7.12): Next 16.2.7, React/React DOM 19.2.7, AI SDK (@ai-sdk/*, ai, @openrouter/ai-sdk-provider), @better-auth/passkey, @aws-sdk/*, @radix-ui/react-* (hover-card, navigation-menu, popover, radio-group, slider), @tanstack/react-query e react-virtual, date-fns, resend, @biomejs/biome, @types/react, knip, tsx (commit 14562f6). better-auth pinado em 1.6.23 (não 1.6.22 como o upstream) para satisfazer peer dependency de @better-auth/passkey@1.6.23 — rodar `pnpm peers check` depois de bumps futuros
  - ⚠️ Esse mesmo bump quebrou todo Popover aninhado dentro de Dialog (ex: calendário do DatePicker em "Nova assinatura"/"Nova meta" ficava inclicável, forçando digitar a data). Causa: @radix-ui/react-popover/hover-card/navigation-menu subiram pra uma versão nova de @radix-ui/react-dismissable-layer (1.1.15), mas @radix-ui/react-dialog/dropdown-menu/select/tooltip ficaram presos na antiga (1.1.11) — duas instâncias do mesmo pacote = dois contextos React de camadas, e o Dialog nunca restaura pointer-events pro Popover que abre dentro dele (fica com pointer-events: none herdado do body). Fix: override em pnpm-workspace.yaml fixando @radix-ui/react-dismissable-layer numa única versão pra todo o dependency tree (PR #1, mergeado em main). Em bumps futuros de @radix-ui/*, checar duplicidade de sub-pacotes compartilhados (dismissable-layer, popper, focus-scope etc.) — `Get-ChildItem node_modules/.pnpm -Filter "@radix-ui+react-<pacote>@*"` revela se sobrou mais de uma versão instalada
  - Lockfile no Windows: usar sempre `pnpm install --ignore-scripts` (nunca `pnpm install` puro) — contorna o postinstall com `cp`, que falha no cmd.exe. O Dockerfile roda o postinstall de verdade dentro do container Linux; public/pdf.worker.min.mjs precisa ser copiado manualmente depois (`Copy-Item node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`) já que fica desatualizado no repo com scripts ignorados
  - Validado com typecheck, biome check, `next build` local completo (45 rotas) e build real do Railway, todos sem erro
  - ⬜ Workflows CI/CD (.github/workflows): upstream removeu docker-publish.yml, reescreveu release.yml e adicionou ci.yml novo. Decisão explícita: não mexer — fork usa Railway, não Docker Hub/GitHub Releases do upstream. Revisitar só se precisar de algo específico

Comandos de Sobrevivência (Tokens)
/clear — usar ao trocar completamente de tarefa/contexto (ex: terminou o bloco de settings, vai começar dashboard)

/compact — usar quando a conversa está longa mas ainda no mesmo bloco de trabalho, pra resumir sem perder o fio

/context — usar pra checar quanto de contexto já foi consumido antes de decidir se compacta ou limpa

/statusline — usar pra manter visibilidade rápida de custo/contexto sem precisar rodar /context toda hora

Regra de Modelos
Sonnet para 95% das tarefas (merges, geração de arquivos, debugging, análise de diffs)

Opus só para raciocínio profundamente complexo (ex: redesenho de arquitetura, decisão estrutural de schema) — e apenas com autorização explícita minha antes de trocar

Regra de Caching e Output
Output custa ~5x mais que input — pedir respostas diretas, sem repetir código que não mudou, sem preâmbulo desnecessário

Preferir diffs/trechos quando a mudança é pequena e NÃO exigir arquivo completo; arquivo completo só quando for pra substituição real

📌 Regra de Atualização deste Documento (CLAUDE.md)
NUNCA atualize este arquivo automaticamente sem minha autorização explícita.

Quando atualizar: Ao final de uma sessão onde implementamos uma nova feature estrutural, mudança de stack ou alteração em regra de negócio que precisa ser preservada em futuros merges, você DEVE me perguntar:

"Implementamos [feature X]. Quer que eu atualize o CLAUDE.md para refletir essa mudança?"

Se eu responder "sim", você deve:

Analisar o que mudou na sessão.
Atualizar as seções relevantes (especialmente "Minhas Customizações").
Me entregar o conteúdo novo, pronto para copiar, colar e commitar.
NUNCA atualize por mudanças triviais (bugfixes, ajustes de UI, refatorações internas) — isso é ruído desnecessário.