# Dois preços por plano e desconto de adimplência

Cada plano possui `valorBase` (sem desconto) e `valor` (com desconto). O nome existente
`valor` permanece para que a matrícula inicial continue oferecendo o preço pontual.
O valor base não pode ser inferior ao preço com desconto.

As novas mensalidades copiam `valorBase` e `valorComDesconto` do plano. Esses snapshots
não acompanham futuras edições do plano. `Mensalidade.valor` registra o preço vigente
ou, depois da quitação, o valor pago. As mensalidades já emitidas antes da migração
mantêm seus preços e não recebem os novos snapshots.

O aluno continua inadimplente desde o primeiro dia após o vencimento. Há quatro dias
civis completos de carência para o desconto, no fuso da academia (`America/Sao_Paulo`).
Exemplo: vencimento em 10/10, desconto até 14/10 às 23:59:59.999 e preço base a partir
de 15/10 às 00:00 (quinto dia de atraso). A carência de preço não altera as regras de acesso às aulas.

A configuração inicial é R$ 100/R$ 120 no padrão, R$ 90/R$ 120 no individual antigo,
R$ 180/R$ 200 no plano de R$ 180 e R$ 270/R$ 290 no de 3 modalidades.
O plano família unitário passa a R$ 90/R$ 100 por
pessoa (duas pessoas: R$ 180/R$ 200). Os demais planos mantêm os dois preços iguais
até configuração explícita. Bolsistas integrais continuam com valor zero.

Na matrícula, o resumo do plano e a página de pagamento informam, junto ao preço,
que a mensalidade inclui o bônus de adimplência e mostram o valor após a carência.
O aviso usa o valor base do plano selecionado; na família, mostra o total correspondente
ao número de pessoas. O pagamento inicial continua usando o preço com bônus.

O cron financeiro envia um aviso por mensalidade e dia, nos quatro dias de carência,
e informa a perda do desconto no quinto dia. Uma chave única persistida evita
duplicação em execuções concorrentes. O canal push depende da inscrição do aluno
e da configuração de notificações financeiras já existente.

Leituras e baixas usam o preço efetivo por data civil, mesmo antes do cron. A mudança
persistida de preço é auditada e usa a trava da mensalidade. No Asaas, cobranças
pendentes com preço antigo são canceladas com confirmação antes de nova emissão.
O ciclo automático fora da carência usa um Pix avulso, preservando os demais ciclos.
A quitação usa o dia do pagamento informado pelo provedor, para aceitar pagamentos
pontuais mesmo quando o webhook chega depois da carência. Um recebimento inferior
ao valor devido fica em conciliação e bloqueia outra cobrança integral automática.

Para ativar, aplicar a migration e publicar a aplicação em conjunto. A configuração
dos preços não altera cobranças ou mensalidades de produção durante o desenvolvimento.
