# 0008 — Loja com domínio financeiro e wallet isolados

## Contexto

A ECVO terá uma operação de Loja administrada por um perfil próprio. O Gestor precisa poder abrir o
painel por URL direta, sem misturar a navegação ou os indicadores financeiros da escola. A vitrine e o
checkout públicos serão implementados depois em `/loja` ou em um subdomínio.

O modelo escolar `Pagamento` já representa aulas, eventos, exames e produtos vinculados à operação da
academia. Reutilizá-lo faria vendas comerciais aparecerem no financeiro e nos relatórios escolares.

## Decisão

- Criar `Papel.LOJA`, com home protegida em `/loja/painel` e autorização real na DAL para `LOJA` ou
  `GESTOR`.
- Manter `NAV_GESTOR` sem link para a Loja. A navegação do perfil Loja é própria.
- Reservar `/loja` para a futura vitrine pública; compradores não recebem o papel `LOJA`.
- Persistir a operação comercial somente em `PedidoLoja`, `CobrancaLojaAsaas` e `SplitLojaAsaas`.
  Essas entidades não se relacionam com `Mensalidade`, `Pagamento`, `Aluno`, `Plano` nem com o split de
  professores.
- Manter `ContaAsaasLoja` como configuração financeira singleton, independente da conta usada para
  entrar no painel.
- Usar onboarding não-BaaS de pessoa física, com consentimento, reserva local antes do HTTP, busca por
  CPF/e-mail e estado indeterminado para falhas de comunicação. Persistir apenas `asaasAccountId` e
  `walletId`; nunca a chave de API devolvida na criação.
- Bloquear novas cobranças até `accountStatus.general = APPROVED` ou confirmação manual auditada do
  Gestor.
- Congelar por tentativa um único `percentualValue = 100`. Esse percentual incide sobre o `netValue`
  após taxas, não sobre o valor bruto.
- Considerar a cobrança utilizável somente quando a resposta do Asaas confirmar a wallet, o percentual
  e a referência esperados. Divergência, estorno parcial ou evento órfão segue para conciliação.
- Compartilhar somente a entrada autenticada/idempotente do webhook; o tratamento de conta, cobrança e
  split da Loja permanece em serviços próprios.

## Consequências

- O faturamento da Loja não altera nenhum indicador financeiro escolar existente.
- Uma venda não pode prosseguir sem recebedor aprovado; não existe fallback para repasse manual.
- O saldo líquido da cobrança fica integralmente na wallet da Loja, mas a cobrança continua registrada
  na conta Asaas que a emitiu. Separação fiscal e emissão de notas devem ser confirmadas com a
  contabilidade antes de publicar o checkout.
- A subconta real depende dos dados cadastrais exatos do titular, da conta-pai ECVO ser pessoa jurídica e
  da análise regulatória do Asaas; esses dados não são inventados nem incluídos em seed ou migration.
