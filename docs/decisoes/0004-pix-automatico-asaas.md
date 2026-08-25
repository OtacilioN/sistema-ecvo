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

- Usar cobrança PIX dinâmica para o modo mensal, com uma `CobrancaAsaas` idempotente por `Mensalidade`.
- Usar autorização PIX Automático com frequência mensal e `paymentCreationMode = MANUAL` para o semestre.
- Materializar seis `Mensalidade` locais. O QR imediato é o ciclo 1; um job diário envia apenas os ciclos 2
  a 6 quando a autorização estiver ativa e o vencimento estiver na janela aceita pelo Asaas.
- Preservar um histórico de `ContratoPixAutomatico` por aluno. Nunca reutilizar um ciclo concluído para um
  novo semestre.
- Fazer chamadas HTTP fora de transações PostgreSQL. Criar primeiro uma intenção local com
  `externalReference` determinística e recuperar a operação remota antes de repetir uma criação.
- Autenticar o webhook pelo header `asaas-access-token`, deduplicar por ID do evento e só baixar uma
  mensalidade após validar referência e valor. O webhook registra auditoria como sistema, sem autor humano.
- Não persistir chave de API, token de webhook, imagem base64 do QR nem payload bruto do evento. Os segredos
  são exclusivamente server-side e as URLs de API são fixadas por ambiente.
- Falhar fechado quando `NODE_ENV=production` ou `VERCEL_ENV=production` estiver associado a
  `ASAAS_ENVIRONMENT=sandbox`. Validar também o prefixo `$aact_hmlg_` no Sandbox e `$aact_prod_` em
  produção, impedindo que uma chave de homologação gere pagamentos fictícios no sistema publicado.

## Consequências

- Um semestre incompleto pode ser retomado sem criar uma sétima cobrança.
- Webhooks repetidos não duplicam baixa, notificação ou auditoria.
- O job diário e a reconciliação são necessários para tolerar indisponibilidade e perda de webhook.
- A ativação real depende de chave Asaas, token de webhook, chave PIX e elegibilidade da conta para PIX
  Automático; a validação deve ocorrer primeiro no Sandbox.
