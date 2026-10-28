# Dois preços por plano e desconto de adimplência

Cada plano possui `valorBase` (sem desconto) e `valor` (com desconto). O nome existente
`valor` permanece para que a matrícula inicial continue oferecendo o preço pontual.
O valor base não pode ser inferior ao preço com desconto.

As novas mensalidades copiam `valorBase` e `valorComDesconto` do plano. Esses snapshots
não acompanham futuras edições do plano. `Mensalidade.valor` registra o preço vigente
ou, depois da quitação, o valor pago. As mensalidades já emitidas antes da migração
mantêm seus preços e não recebem os novos snapshots.

O desconto vale somente até o fim do vencimento, sem dias de tolerância, no fuso
da academia (`America/Sao_Paulo`). Exemplo: vencimento em 10/10, desconto até 10/10
às 23:59:59.999 e preço base a partir de 11/10 às 00:00 (primeiro dia de atraso).
O job do dia seguinte persiste o valor sem desconto. As regras de acesso às aulas
continuam seguindo a situação financeira do aluno.

A configuração inicial é R$ 100/R$ 120 no padrão, R$ 90/R$ 120 no individual antigo,
R$ 180/R$ 200 no plano de R$ 180 e R$ 270/R$ 290 no de 3 modalidades.
O plano família unitário passa a R$ 90/R$ 100 por
pessoa (duas pessoas: R$ 180/R$ 200). Os demais planos mantêm os dois preços iguais
até configuração explícita. Bolsistas integrais continuam com valor zero.

Na matrícula, o resumo do plano e a página de pagamento informam, junto ao preço,
que a mensalidade inclui o bônus de adimplência e mostram o valor após o vencimento.
O aviso usa o valor base do plano selecionado; na família, mostra o total correspondente
ao número de pessoas. O pagamento inicial continua usando o preço com bônus.

O cron financeiro informa a perda do desconto no primeiro dia de atraso. Não há
avisos de carência após o vencimento. Uma chave única persistida evita
duplicação em execuções concorrentes. O canal push depende da inscrição do aluno
e da configuração de notificações financeiras já existente.

Leituras e baixas usam o preço efetivo por data civil, mesmo antes do cron. A mudança
persistida de preço é auditada e usa a trava da mensalidade. No Asaas, cobranças
pendentes com preço antigo são canceladas com confirmação antes de nova emissão.
O ciclo automático após o vencimento usa um Pix avulso, preservando os demais ciclos.
A quitação usa o dia do pagamento informado pelo provedor, para aceitar pagamentos
pontuais mesmo quando o webhook chega depois do vencimento. Um recebimento inferior
ao valor devido fica em conciliação e bloqueia outra cobrança integral automática.

A configuração inicial exige a migration e a publicação da aplicação em conjunto.
A redução da tolerância para zero dias altera somente a aplicação, sem nova migration.
Alterações locais não afetam cobranças ou mensalidades de produção até a publicação.
