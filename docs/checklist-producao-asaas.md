# Checklist de produção — Asaas PIX

Este checklist separa prontidão do código de prontidão operacional. Nenhum pagamento real deve ser liberado
somente porque o build passou.

## 1. Banco e deploy

- [ ] Aplicar `prisma migrate deploy` no banco Production aprovado antes de publicar a aplicação.
- [ ] Confirmar as tabelas `ClienteAsaas`, `ContratoPixAutomatico`, `CobrancaAsaas` e
  `EventoWebhookAsaas`, os índices parciais de contrato aberto e cobrança ativa e a migration de reserva
  do cliente/histórico de tentativas, além da migration de cancelamento operacional.
- [ ] Confirmar que Preview e Production usam bancos fisicamente isolados.

## 2. Conta e credenciais Asaas

- [ ] Confirmar no painel que a conta Production é a conta bancária real da ECVO e que os dados de
  recebimento estão corretos.
- [ ] Configurar `ASAAS_ENVIRONMENT=production` somente no escopo Production da Vercel.
- [ ] Em um deployment fora da Vercel, configurar também
  `ASAAS_PRODUCTION_CONFIRMED=ECVO_PRODUCTION`; `NODE_ENV=production` sozinho não libera a conta real.
- [ ] Configurar no mesmo escopo uma chave `$aact_prod_...` da conta verificada. Preview e Development
  devem usar `sandbox` e chave `$aact_hmlg_...`.
- [ ] Confirmar permissões de leitura e escrita para clientes, cobranças e PIX Automático.
- [ ] Confirmar elegibilidade `ELIGIBLE` para PIX Automático. Se `ASAAS_PIX_KEY` for usada, ela deve
  pertencer à mesma conta Production.

## 3. Webhook e cron

- [ ] Criar um token exclusivo de 32 a 255 caracteres e definir o mesmo valor em
  `ASAAS_WEBHOOK_TOKEN` Production e no webhook Asaas.
- [ ] Configurar o webhook Production em `https://app.ecvo.com.br/api/webhooks/asaas`, ativo e sem fila
  interrompida.
- [ ] Habilitar eventos tradicionais de cobrança usados pelo fluxo (`PAYMENT_CONFIRMED`,
  `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`) e eventos de autorização
  e instrução do PIX Automático.
- [ ] Configurar `CRON_SECRET` Production e confirmar execução diária de
  `/api/tarefas/cobrancas-pix-automatico`.
- [ ] Monitorar respostas não 2xx, `ultimoErro`, contratos em `ERRO`, cobranças divergentes e fila de
  webhook pausada.

## 4. Homologação e liberação

- [ ] No Sandbox, validar: PIX mensal, autorização inicial, ativação, ciclos 2 a 6, recusa, expiração,
  estorno integral, estorno parcial seguido de integral, cancelamento remoto e liberação dos ciclos após
  estorno do pagamento inicial, reemissão após cobrança terminal, fallback após perda da janela e
  reentrega/webhook tardio de tentativa anterior.
- [ ] Validar uma mensalidade já vencida: o vencimento histórico permanece inalterado, a cobrança remota
  usa a data civil atual e o webhook aceita a mesma `CobrancaAsaas.vencimentoAsaas`.
- [ ] Validar cancelamento pelo aluno e pelo gestor, incluindo cobrança pendente, autorização ativa,
  repetição idempotente, falha remota e preservação de uma mensalidade já recebida.
- [ ] Pagar o QR imediato em um dia diferente do vencimento da mensalidade e confirmar a correlação pelo
  `conciliationIdentifier`, sem depender de igualdade entre as datas.
- [ ] Confirmar que o aluno só atua sobre a própria mensalidade e que o gestor não consegue alterar uma
  mensalidade enquanto há cobrança remota incompatível.
- [ ] Após deploy Production, executar primeiro uma consulta somente leitura para confirmar que a chave
  resolve na conta esperada e que o webhook está ativo.
- [ ] Com autorização explícita para efeito financeiro real, executar uma cobrança controlada e de baixo
  risco, pagar, confirmar crédito na conta bancária real, conferir mensalidade/auditoria/notificação e
  cancelar qualquer autorização de teste remanescente.

Sem a conferência da titularidade da conta, do webhook, da elegibilidade e do crédito bancário controlado,
o sistema deve ser considerado **pronto no código, mas ainda não liberado operacionalmente**.
