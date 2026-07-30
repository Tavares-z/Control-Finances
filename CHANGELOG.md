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

Suas contas conectadas por Open Finance agora se atualizam sozinhas, na hora — sem precisar abrir o painel para "acordar" a sincronização.

### Adicionado
- Atualização em tempo real das conexões bancárias: quando o banco envia algo novo (uma transação, ou um aviso de que a conexão precisa de atenção), o app reage na mesma hora. Antes, ele só verificava quando você abria o painel; agora, uma compra nova pode cair na sua Caixa de entrada assim que o banco a informa, e o aviso de "conexão expirada" (com o botão Reconectar) aparece sozinho, sem você ter que descobrir na tentativa e erro.
- Mais segurança nessa comunicação com o banco: o canal que recebe esses avisos é protegido por uma senha secreta combinada entre o app e o provedor (Pluggy). Qualquer aviso que chegue sem a senha correta é recusado, então ninguém de fora consegue injetar informação falsa nas suas conexões.

## [3.1.1] - 2026-07-28

Melhor visibilidade de quando uma conexão bancária precisa da sua atenção.

### Adicionado
- Aviso "Desatualizada" nas conexões bancárias: quando uma conexão perde a validade (o banco costuma pedir religação de tempos em tempos), ela agora mostra um selo amarelo de alerta e um botão "Reconectar" que reabre a tela de religação — sem esperar a conexão falhar por completo para você perceber.

## [3.1.0] - 2026-07-25

Chegou o Open Finance: conecte suas contas bancárias e deixe os lançamentos entrarem sozinhos.

### Adicionado
- Conexão de contas bancárias (Open Finance): uma nova aba em Ajustes permite conectar seus bancos com poucos cliques e desconectar quando quiser. A partir daí, as movimentações das contas conectadas passam a cair automaticamente na sua Caixa de entrada, prontas para você revisar e confirmar. O app evita lançar a mesma transação duas vezes, e a busca por novidades acontece de forma discreta ao abrir o painel (no máximo uma vez por hora, para não pesar). O recurso vem desligado por padrão — você escolhe quando ligar.

### Corrigido
- Assinaturas sem cartão vinculado voltaram a aparecer na Caixa de entrada: elas tinham parado de gerar o lembrete de cobrança por um problema interno; agora o lançamento é criado normalmente de novo.

## [3.0.0] - 2026-07-23

Primeira versão própria do Control-Finances, reunindo tudo o que foi criado sobre a base do OpenMonetis: metas, assinaturas, controle de VR/VA, a assistente Monetinha e vários acertos do dia a dia.

### Adicionado
- Data da próxima recarga do VR/VA: no cadastro da conta de benefício você pode informar quando cai a próxima recarga. Com isso, o app mostra com precisão quantos dias faltam e quanto dá para gastar por dia até lá, em vez de trabalhar com uma estimativa.
- Corrigir o saldo inicial de uma conta já criada: antes, o campo "Saldo inicial" só aparecia na criação da conta. Agora ele também aparece na edição, então dá para ajustar o saldo de abertura direto pela tela, e o extrato acompanha a correção automaticamente.
- Painel de Saldo VR/VA: um quadro no painel mostra quanto ainda há no benefício, quanto dá para gastar por dia até a próxima recarga, o ritmo atual de consumo e um veredito claro (se o saldo "fecha", "aperta" ou "não fecha" até lá).
- Sugestão de limite de orçamento: ao criar um orçamento para uma categoria, o app calcula a média do que você gastou nela nos últimos 3 meses e oferece um botão para preencher esse valor como limite — um ponto de partida realista.
- Previsão de saldo e alertas de gasto fora do padrão: o painel passou a estimar seu saldo daqui a 30, 60 e 90 dias (juntando lançamentos futuros e assinaturas ativas), e o sininho de notificações avisa quando uma categoria estoura 40% acima da sua média recente.
- Foto de capa nas metas: cada meta pode ganhar uma imagem de referência (por exemplo, o destino de uma viagem), exibida no topo do cartão para deixar o objetivo mais concreto e motivador.
- Assinaturas e despesas fixas: uma área nova para cadastrar cobranças recorrentes sem prazo (Netflix, aluguel, etc.), com página própria, um resumo no painel e um relatório de projeção anual. Quando uma cobrança vence, o app cria um lembrete na Caixa de entrada para você confirmar. (Assinaturas cobradas no cartão não geram lembrete, porque já vão aparecer na fatura.)
- Metas financeiras: crie objetivos de economia com página dedicada (abas Ativas, Concluídas e Arquivadas) e acompanhe as três principais direto no painel.
- Monetinha, a assistente por chat: converse com uma IA dentro do app para registrar gastos e tirar dúvidas sobre suas finanças. Aceita anexos (imagens e PDF até 10MB), tem modo tela cheia e ajustes próprios em Ajustes.
- Escolher o tipo ao processar a Caixa de entrada: ao tratar um item pendente, você agora escolhe como registrá-lo — Despesa, Receita ou Transferência entre contas.
- Nova forma de pagamento "Saldo em conta": para débitos direto do saldo da conta (carteira digital, débito automático) que não são exatamente Pix nem boleto, deixando o registro mais fiel e o relatório de formas de pagamento mais limpo.

### Alterado
- Lançamentos técnicos ficaram mais claros: ajustes de saldo e o lançamento de "Saldo inicial" não têm forma de pagamento real, então deixaram de exibir um "Pix" enganoso e passam a mostrar apenas um traço.
- Ajustes visuais para manter o app consistente em tema claro e escuro (cores de sucesso e alerta padronizadas nos quadros de VR/VA, assinaturas e metas).

### Corrigido
- Calendário que não abria em alguns formulários: em "Nova assinatura" e "Nova meta", o seletor de data podia ficar sem responder ao clique. Corrigido.
- Fatura paga não zera mais o valor do cartão no painel: pagar a fatura deixava o cartão parecendo zerado e escondia compras novas do período; agora o valor continua correto.
- Limpeza automática da capa da meta ao excluí-la, sem deixar arquivos soltos, e fim de uma duplicação rara de assinatura quando o app era usado em duas telas quase ao mesmo tempo.

---

> **Sincronização com o upstream:** o fork está sincronizado com o upstream **v2.7.12**
> (de v2.7.2). Detalhes de cada bloco portado no `AGENTS.md`, seção "Estado do Sync".
> O histórico completo das versões do OpenMonetis (2.7.2 e anteriores) vive em
> [`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).
