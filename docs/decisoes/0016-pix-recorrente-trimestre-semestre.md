# Pix recorrente por três ou seis meses

O aluno escolhe 3 ou 6 meses ao cadastrar o Pix recorrente. A escolha corresponde a
três ou seis mensalidades, incluindo o primeiro pagamento por QR Code. As seguintes
são cobradas mensalmente após a autorização no aplicativo do banco; não há cobrança
antecipada do trimestre ou semestre inteiro.

`ContratoPixAutomatico.totalCiclos` guarda a duração escolhida. Os contratos anteriores
continuam com seis ciclos. O modo trimestral usa `AUTOMATICO_TRIMESTRAL`; o semestral
preserva `AUTOMATICO_SEMESTRAL`. Retentativas de criação não podem reutilizar contrato
de outra duração. Encerrar um contrato não altera mensalidades já pagas.

A autorização Asaas mantém frequência mensal, valor pontual do plano e vigência
limitada ao último ciclo. A rotina de cobrança e a conclusão do contrato respeitam
o número de ciclos do próprio contrato. O término requer a quitação dos ciclos,
preservando recebimentos divergentes que ainda precisam de conciliação.

A chamada no financeiro destaca a conveniência e a manutenção do bônus de adimplência.
O aluno deve autorizar no banco e manter saldo para que o pagamento ocorra no prazo.
Agendar o Pix não isenta nem quita mensalidades: a regra do bônus depende do pagamento.

Formulários antigos sem seleção de duração continuam solicitando seis meses; valores
diferentes de 3 ou 6 são rejeitados. A ativação pelo aluno usa sua identidade da sessão,
independentemente de identificadores recebidos no formulário.

A mudança é preparada localmente. Para ativá-la em produção, aplicar a migration do
novo modo e publicar a aplicação. Nenhuma autorização bancária é criada durante os testes.
