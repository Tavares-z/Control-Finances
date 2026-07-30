# Changelog — Control-Finances (fork)

Mudanças notáveis do **Control-Finances**, fork pessoal do
[OpenMonetis](https://github.com/felipegcoutinho/openmonetis). Este arquivo cobre as
customizações próprias do fork e os pontos de sincronização com o upstream.

O changelog cru do upstream (espelho, sobrescrito no sync) fica em
[`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o fork segue seu próprio eixo de versão (`v3.x`), independente do upstream.
Cada release registra a base do upstream correspondente no corpo.

> **Tom deste changelog:** escrito para quem vai usar o app, não para quem programa.
> Nada de jargão técnico (tabela, migration, função) — o foco é o que muda no seu dia
> a dia. E na pegada da Monetinha: leve, animado, como uma amiga contando a novidade,
> sem exagero de emojis (1 ou 2 por versão, no máximo).

## [3.2.0] - 2026-07-29

Suas conexões bancárias agora se viram sozinhas — chega de abrir o painel só pra elas acordarem! 🎉

### Adicionado
- Suas contas conectadas ficam sempre em dia, na hora: quando o banco tem uma novidade (uma compra nova, ou um aviso de que a conexão precisa de atenção), o app já reage na mesma hora. Antes ele só olhava quando você abria o painel; agora a compra pode cair na sua Caixa de entrada assim que o banco avisa, e se a conexão expirou o alerta com o botão Reconectar aparece sozinho — sem você ficar no chute tentando descobrir o que aconteceu.
- E tudo isso com a porta bem trancada: esse canal que recebe os avisos do banco é protegido por uma senha secreta que só o app e o provedor (Pluggy) conhecem. Se chegar qualquer aviso sem a senha certa, ele é barrado na entrada — ninguém de fora consegue empurrar informação falsa pras suas conexões.

## [3.1.1] - 2026-07-28

Ficou mais fácil perceber quando uma conexão bancária está pedindo socorro.

### Adicionado
- Selo "Desatualizada" nas conexões: de vez em quando o banco pede pra religar a conexão, e antes isso passava batido. Agora aparece um selinho amarelo de alerta e um botão "Reconectar" que já abre a tela certa — você resolve na hora, sem esperar a conexão parar de vez.

## [3.1.0] - 2026-07-25

Chegou o Open Finance! Conecte seus bancos e deixe os lançamentos entrarem no piloto automático. 🏦

### Adicionado
- Conecte suas contas bancárias (Open Finance): tem uma aba nova em Ajustes onde você liga seus bancos com poucos cliques (e desliga quando quiser). A partir daí, as movimentações das contas conectadas caem sozinhas na Caixa de entrada, prontinhas pra você revisar e confirmar. Pode ficar tranquilo: o app não deixa a mesma transação entrar duas vezes, e ele procura novidades de leve ao abrir o painel (no máximo uma vez por hora, pra não pesar). Vem desligado por padrão — quem manda ligar é você.

### Corrigido
- Assinaturas sem cartão voltaram a aparecer na Caixa de entrada: elas tinham parado de avisar a cobrança por causa de um probleminha nos bastidores. Já resolvido — o lembrete volta a ser criado direitinho.

## [3.0.0] - 2026-07-23

A primeira versão de cara própria do Control-Finances! Aqui mora tudo o que foi criado sobre a base do OpenMonetis: metas, assinaturas, controle de VR/VA, a Monetinha e um monte de acerto do dia a dia. ✨

### Adicionado
- Data da próxima recarga do VR/VA: agora você pode avisar ao app quando cai a próxima recarga do benefício. Com isso, ele te diz com precisão quantos dias faltam e quanto dá pra gastar por dia até lá — nada de chute.
- Ajustar o saldo inicial de uma conta que já existe: antes esse campo só aparecia na hora de criar a conta. Agora ele também está na edição, então corrigir o saldo de abertura é questão de dois cliques, e o extrato se ajeita junto sozinho.
- Painel de Saldo VR/VA: um quadrinho no painel te mostra quanto ainda sobra no benefício, quanto dá pra gastar por dia até a recarga, o ritmo que você está indo e um veredito sem rodeios — se o saldo "fecha", "aperta" ou "não fecha" até lá.
- Um empurrãozinho no orçamento: ao criar o orçamento de uma categoria, o app olha quanto você gastou nela nos últimos 3 meses e sugere esse valor como limite, num clique. Um ponto de partida com os pés no chão.
- Bola de cristal do saldo (e alerta de exagero): o painel passou a estimar como fica seu saldo daqui a 30, 60 e 90 dias — juntando o que já está agendado e as assinaturas ativas. E o sininho te cutuca quando uma categoria estoura 40% acima da sua média recente.
- Foto de capa nas metas: cada meta pode ganhar uma imagem de referência (tipo o destino daquela viagem dos sonhos) lá no topo do cartão, pra deixar o objetivo bem na sua cara e dar aquele gás.
- Assinaturas e despesas fixas: uma área nova pras cobranças que não têm fim (Netflix, aluguel e cia), com página própria, um resumo no painel e até uma projeção do ano todo. Quando uma cobrança vence, o app deixa um lembrete na Caixa de entrada pra você confirmar. (As que caem no cartão não geram lembrete, porque já vão aparecer na fatura.)
- Metas financeiras: crie seus objetivos de economia com página dedicada (abas Ativas, Concluídas e Arquivadas) e acompanhe as três principais direto no painel — porque ver o progresso motiva.
- A Monetinha, sua assistente por chat: converse com uma IA dentro do app pra registrar gastos e tirar dúvidas sobre suas finanças. Ela aceita anexos (imagens e PDF até 10MB), tem modo tela cheia e dá pra ajustar o jeitão dela em Ajustes.
- Escolha o tipo ao processar a Caixa de entrada: ao tratar um item pendente, você diz de cara como quer registrar — Despesa, Receita ou Transferência entre contas.
- Nova forma de pagamento "Saldo em conta": pra aquele débito direto da carteira digital ou débito automático que não é bem Pix nem boleto. Fica mais fiel ao que aconteceu e deixa o relatório de formas de pagamento mais limpo.

### Alterado
- Lançamentos técnicos ficaram menos confusos: ajustes de saldo e o "Saldo inicial" não têm forma de pagamento de verdade, então pararam de mostrar um "Pix" que enganava e agora exibem só um tracinho.
- Uns retoques visuais pra deixar o app bonito e consistente no claro e no escuro (cores de sucesso e alerta padronizadas nos quadros de VR/VA, assinaturas e metas).

### Corrigido
- O calendário que travava: em "Nova assinatura" e "Nova meta", o seletor de data às vezes fazia corpo mole e não respondia ao clique. Resolvido.
- Fatura paga não zera mais o cartão no painel: pagar a fatura fazia o cartão parecer zerado e ainda escondia as compras novas do período. Agora o valor continua certinho.
- E mais uns ajustes de bastidor: a capa da meta é apagada junto quando você exclui a meta (sem deixar arquivo perdido), e sumiu aquela duplicação rara de assinatura que aparecia quando o app era usado em duas telas quase ao mesmo tempo.

---

> **Sincronização com o upstream:** o fork está sincronizado com o upstream **v2.7.12**
> (de v2.7.2). Detalhes de cada bloco portado no `AGENTS.md`, seção "Estado do Sync".
> O histórico completo das versões do OpenMonetis (2.7.2 e anteriores) vive em
> [`CHANGELOG.upstream.md`](./CHANGELOG.upstream.md).
