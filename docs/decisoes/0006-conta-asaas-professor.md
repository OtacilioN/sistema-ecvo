# 0006 — Conta Asaas do professor

## Contexto

O professor pode solicitar, pelo próprio perfil, uma subconta Asaas para receber futuramente o
split fixo correspondente às modalidades que ministra. Criar a subconta é uma operação externa,
sem chave de idempotência documentada, e não significa que ela já esteja aprovada para receber.

## Decisão

- Usar o onboarding **não-BaaS**: a ECVO envia os dados cadastrais; o titular ativa a conta e envia
  documentos diretamente no Asaas.
- Separar os dados financeiros em `ContaAsaasProfessor`, sem alterar automaticamente o cadastro
  pedagógico ou o e-mail de login do Sistema ECVO.
- Exigir consentimento explícito antes do envio.
- Reservar a operação localmente antes do HTTP e consultar subcontas por CPF e e-mail antes de
  executar `POST /accounts`.
- Persistir somente `asaasAccountId` e `walletId` como identificadores remotos. A chave de API
  retornada pelo provedor não é necessária para o split da conta-pai e não será guardada, exibida ou
  registrada em logs.
- Tratar timeout ou resposta inválida como `RESULTADO_INDETERMINADO`, impedindo nova criação até
  conciliação. Um erro determinístico permite corrigir os dados e tentar novamente.
- A criação deixa a conta em `AGUARDANDO_ATIVACAO`. Ela só poderá ficar `HABILITADA` para splits
  após o Asaas confirmar a aprovação geral em uma etapa posterior.

## Consequências

- O cadastro interno do professor continua existindo mesmo se o Asaas rejeitar ou interromper a
  solicitação.
- Duplo clique e concorrência local não iniciam dois `POST /accounts`.
- Uma falha ocorrida após a criação remota pode exigir conciliação manual; não há retry cego.
- Alterações posteriores no cadastro do professor não modificam os dados já enviados à subconta.
- Professores com uma solicitação Asaas não podem ser excluídos; devem ser inativados para preservar
  a identificação financeira e a trilha de auditoria.
