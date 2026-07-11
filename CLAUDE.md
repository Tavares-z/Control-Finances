# CLAUDE.md — Control-Finances (fork OpenMonetis)

## Visão Geral
- **Projeto:** Control-Finances — fork pessoal do OpenMonetis, deployado no Railway
- **Upstream:** https://github.com/felipegcoutinho/openmonetis (versionamento semver, releases por tag)
- **Fork local:** `C:\OpenMonetis-dev` (Windows, PowerShell + VS Code) — preencher URL do remote `origin` aqui: https://github.com/Tavares-z/Control-Finances
- **Sync atual:** upstream v2.7.2 → v2.7.12 (em andamento)

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

Minhas Customizações (preservar sempre)
Metas Financeiras: tabela metas, migration local (era 0031, ver histórico de migrations), CRUD completo, página /metas (abas Ativas/Concluídas/Arquivadas), widget top-3 no dashboard, tool consultar_metas na IA

Monetinha (ChatWidget): tabela mensagens_chat, colunas chat_model/chat_personality em preferencias_usuario, widget de chat no layout do dashboard, anexos (jpg/png/webp/pdf até 10MB), modo full-screen, modal de insight (ESC fecha antes de minimizar), aba "Assistente" em /settings com assistant-form.tsx, action updateChatSettings (limpa histórico se o modelo mudar)

Inbox Process Type: modal "Como deseja registrar?" (Despesa/Receita/Transferência entre contas) ao processar pré-lançamento — inbox-process-type-dialog.tsx, inbox-transfer-dialog.tsx

validatePayerOwnership em core.ts — existe no fork, não existe no upstream atual (divergência antiga, não mexer sem investigar)

Stack Técnica
Next.js 16 App Router, PostgreSQL + Drizzle ORM, pnpm, Railway, OpenRouter, AI SDK ^6.0.191 (Zod v4 interno)

UI em português, código em inglês, commits em Conventional Commits (português)

Imports: @/shared/lib/db, @/shared/lib/auth/config, @/shared/components/ui/

Server Actions: Zod + try/catch + ActionResponse; forms com useTransition

Ícones: Remixicon via getIconComponent()

Migrations no Windows: npx drizzle-kit generate + npx drizzle-kit migrate (pnpm falha no postinstall)

Erro EPERM symlink no npm run build local é conhecido e não bloqueia deploy no Railway (Linux) — não perder tempo tentando "corrigir"

Estado do Sync (v2.7.2 → v2.7.12)
✅ Migrations (schema.ts, colisão 0031 resolvida → gerado 0032)
✅ Settings/Monetinha (page.tsx, actions.ts, queries.ts, preferences-form.tsx)
✅ Checkbox compacto (estilo upstream adotado)
✅ Transações tabela/lista (12 arquivos: columns, mobile-list, actions-menu, page, table, core, single-actions, export-actions, page-helpers, date.ts, installment-detection.ts, actions barrel)
⬜ Wiring de groupTransactionsByDate nas páginas que chamam <TransactionsPage>: /transactions, accounts/[accountId]/statement, cards/[cardId]/invoice, categories/[categoryId], payers/[payerId]
⬜ Dashboard widgets (vínculo de tendências às categorias)
⬜ Popovers de fatura/data
⬜ Anexos (filtro por pessoa)
⬜ Import de planilhas (mapeamento automático de categoria)
⬜ Cards (destacar fatura paga)
⬜ Config/infra (deps, CI, docker) — baixo risco, revisar por último

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