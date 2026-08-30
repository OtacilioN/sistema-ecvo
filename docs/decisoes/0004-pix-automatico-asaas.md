# ADR 0004 — PIX mensal e PIX Automático pelo Asaas

**Status:** aceito · **Data:** 2026-08-20

## Contexto

A ECVO precisa oferecer ao aluno uma cobrança PIX única por competência ou uma semestralidade paga em
seis parcelas mensais automáticas. No Asaas, uma assinatura cobrada por PIX comum ainda exige que o cliente
pague cada cobrança. O produto que autoriza débitos futuros a partir do primeiro QR é o **PIX Automático**.

A autorização integrada paga imediatamente a primeira mensalidade. No modo manual, as instruções seguintes
devem ser criadas perto de cada vencimento. Por isso, gerar seis cobranças remotas de uma vez produziria uma
cobrança excedente e contrariaria a janela operacional do provedor.

## Decisão

- Usar cobrança PIX dinâmica para o modo mensal. Cada tentativa remota permanece registrada em
  `CobrancaAsaas`; uma mensalidade tem no máximo uma tentativa ativa, e uma cobrança terminal pode gerar
  uma nova geração sem apagar o ID necessário para webhooks tardios. `Mensalidade.cobrancaQuitacaoAsaasId`
  aponta para a tentativa que efetivamente quitou a competência, impedindo que o estorno tardio de outra
  tentativa desfaça um pagamento posterior. Cada tentativa recebida preserva `recebidaEmAsaas`; se houver
  pagamento duplicado e a tentativa eleita for estornada, a quitação e a data passam para a outra tentativa
  recebida. A mensalidade só reabre quando nenhuma tentativa recebida sobreviver.
- Antes da aprovação da matrícula, usar `CobrancaMatriculaAsaas` ligada à solicitação e ao snapshot do plano
  padrão, sem criar `Usuario`, `Aluno` ou `Mensalidade` provisórios. O comprovante continua opcional e não
  produz baixa. Somente `PAYMENT_RECEIVED` libera a fila administrativa; `PAYMENT_CONFIRMED` pode ser cautelar
  e permanece pendente. Na aprovação, a cobrança é materializada no modelo financeiro canônico para que
  estornos futuros preservem as mesmas regras.
- Preservar `Mensalidade.vencimento` como data histórica. Se o aluno emitir o PIX mensal depois dessa
  data, gravar separadamente em `CobrancaAsaas.vencimentoAsaas` a data civil atual da academia e enviá-la
  ao provedor; webhook e conciliação validam essa data técnica, sem alterar competência ou inadimplência.
- Usar autorização PIX Automático com frequência mensal e `paymentCreationMode = MANUAL` para o semestre.
- Permitir que o gestor configure o modo para um aluno e que o próprio aluno o habilite somente para si,
  sempre usando o `alunoId` derivado da sessão autenticada.
- Materializar seis `Mensalidade` locais. O QR imediato é o ciclo 1; um job diário envia apenas os ciclos 2
  a 6 quando a autorização estiver ativa e o vencimento estiver na janela aceita pelo Asaas.
- Se a janela de um ciclo for perdida após falhas, emitir um PIX convencional de contingência ligado ao
  mesmo contrato, notificar aluno e gestores e manter os ciclos seguintes automáticos. Nenhuma competência
  pode desaparecer silenciosamente do job.
- Preservar um histórico de `ContratoPixAutomatico` por aluno. Nunca reutilizar um ciclo concluído para um
  novo semestre.
- Fazer chamadas HTTP fora de transações PostgreSQL. Criar primeiro uma intenção local com
  `externalReference` determinística e uma reserva exclusiva com prazo; somente o vencedor pode criar o
  recurso remoto. Após timeout, reconciliar no Asaas antes de repetir uma criação.
- Autenticar o webhook pelo header `asaas-access-token`, deduplicar por ID do evento e só baixar uma
  mensalidade após consultar a cobrança na API e validar ID, cliente, referência, meio PIX, valor,
  vencimento e autorização. No QR imediato, usar o `conciliationIdentifier` devolvido pelo Asaas em vez
  do vencimento, pois o primeiro pagamento ocorre no dia da adesão. O webhook registra auditoria como
  sistema, sem autor humano.
- Considerar concluído somente o evento que terminou a transação de domínio. Uma divergência mantém o
  diagnóstico e a auditoria, libera a chave idempotente e responde com falha para que o Asaas reentregue;
  somente eventos aplicados ou duplicatas já concluídas recebem HTTP 200.
- Reabrir a mensalidade após estorno integral. Um estorno parcial remove a mensalidade do repasse, notifica
  gestores e aluno e bloqueia a competência para conciliação manual, pois o modelo não presume o saldo. A
  pendência parcial é estruturada; se evoluir para estorno integral, a mensalidade é reaberta. Se o estorno
  integral atingir o pagamento inicial, cancelar primeiro a autorização no Asaas, encerrar o contrato local,
  voltar o aluno ao modo mensal e liberar os ciclos ainda não pagos.
- Permitir que aluno ou gestor cancelem a autorização recorrente. O sistema primeiro confirma o contrato
  e as cobranças na conta Asaas, encerra a autorização, remove apenas cobranças ainda não recebidas e então
  grava o estado local e a auditoria. Cobranças recebidas e mensalidades pagas nunca são convertidas em
  cancelamento ou baixa manual.
- Não persistir chave de API, token de webhook, imagem base64 do QR nem payload bruto do evento. Os segredos
  são exclusivamente server-side e as URLs de API são fixadas por ambiente.
- Quando `VERCEL_ENV` existir, tratá-lo como autoridade: Production exige Asaas Production; Preview e
  Development exigem Sandbox, independentemente de `NODE_ENV`. Fora da Vercel, a conta real exige a
  confirmação explícita `ASAAS_PRODUCTION_CONFIRMED=ECVO_PRODUCTION`; sem ela, somente Sandbox é aceito.
  Validar os prefixos `$aact_hmlg_` e `$aact_prod_` antes da rede.

## Consequências

- Um semestre incompleto pode ser retomado sem criar uma sétima cobrança.
- Webhooks repetidos não duplicam baixa, notificação ou auditoria.
- O job diário e a reconciliação são necessários para tolerar indisponibilidade e perda de webhook.
- A ativação real depende de chave Asaas Production da conta correta, token exclusivo de webhook,
  permissões e elegibilidade da conta para PIX Automático; `ASAAS_PIX_KEY` é enviada quando configurada.
  A validação funcional deve ocorrer primeiro no Sandbox e a liberação final segue o checklist de produção.
