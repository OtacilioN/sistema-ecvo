# 0007 — Split automático de mensalidades no Asaas

## Contexto

A mensalidade interna possui um direito histórico de repasse por modalidade. A cobrança no Asaas é uma
tentativa operacional: pode ser reemitida, estornada, recusada ou liquidar cada split em momentos distintos.
Misturar essas duas informações permitiria recalcular o credor no futuro ou pagar manualmente um valor já
transferido pelo provedor.

## Decisão

- Manter `Mensalidade.repasseSnapshot` como fonte imutável do direito econômico.
- Congelar antes do HTTP, em `SplitPagamentoAsaas`, a wallet, o valor fixo e as modalidades de cada tentativa.
- Usar somente conta de professor ativo com status `HABILITADA` e `walletId`. Ausência ou ambiguidade fica
  como obrigação manual; nunca se escolhe um professor arbitrariamente.
- Agregar na mesma wallet os valores configurados de várias modalidades.
- Enviar `split[].fixedValue` em `POST /payments`; o saldo líquido não distribuído permanece com a ECVO.
- Exigir que a resposta remota contenha composição compatível antes de expor a cobrança como válida.
- Considerar repasse realizado apenas no estado remoto `DONE` ou no evento `PAYMENT_SPLIT_DONE`.
- Processar de forma idempotente os eventos `PAYMENT_SPLIT_*` e preservar cancelamento, recusa, bloqueio e
  estorno como estados históricos.
- Criar o webhook de situação cadastral junto das novas subcontas. `accountStatus.general = APPROVED` habilita
  o split; para contas anteriores, o gestor pode confirmar de forma auditada a aprovação vista no Asaas.
- Congelar o snapshot da primeira mensalidade na própria cobrança de matrícula e copiá-lo, sem recalcular,
  ao criar a mensalidade canônica.
- Não aplicar split ao QR imediato do PIX Automático, pois o provedor não oferece esse recurso. Aplicar aos
  ciclos futuros criados manualmente por `POST /payments`.

## Consequências

- Reemissões recebem novos IDs de split sem apagar a tentativa anterior.
- Cobranças antigas não recebem split retroativo.
- O relatório financeiro separa direito total, valor concluído automaticamente, valor ainda processando e
  saldo de repasse manual, reduzindo o risco de duplicidade.
- Um split ausente ou divergente na resposta do Asaas bloqueia a exposição daquela cobrança para conciliação.
