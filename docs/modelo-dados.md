# Modelo de dados — ECVO

Fonte de verdade: `prisma/schema.prisma`. Este documento explica as decisões e relações principais.

## Princípio central: presença e horas

- **Presença não é uma tabela.** Presença ≡ existe um `Checkin` com `status = VALIDO` para o par
  (aluno, aula). Evita estado redundante (RF-025).
- `Checkin.status = PENDENTE_REVISAO` registra tentativa que exige aprovação; não gera presença nem
  movimento de horas até professor/gestor aprovar lançando o check-in como válido.
- **Horas são um livro-razão (ledger) append-only** em `MovimentoHoras`:
  - check-in válido ⇒ um movimento `CREDITO` com `minutos = duração da aula`, ligado ao `checkinId` e à `modalidadeId`;
  - invalidar/excluir o check-in ⇒ um movimento `ESTORNO` com `minutos` negativos e `estornaMovimentoId`
    apontando o crédito — **nunca** se apaga o crédito original (RF-035/RN-005);
  - ajuste manual ⇒ `AJUSTE_MANUAL` (com `autorId` e `motivo`).
  - **Total geral** = `SUM(minutos)` por aluno; **por modalidade** = `SUM(minutos)` filtrado por `modalidadeId`.
- **Sem dupla contagem**: `@@unique([alunoId, aulaId])` em `Checkin` (RF-039).
- **QR global de check-in**: `TokenCheckinAcademia` guarda o único token válido por vez. Ao rotacionar,
  URLs antigas deixam de validar. Tentativas de aluno inadimplente ficam em
  `TentativaCheckinInadimplente`; elas disparam alerta e auditoria, mas não criam `Checkin` nem horas.
- **Check-in livre por modalidade**: `Modalidade.checkinSemRestricaoHorario` permite o registro fora da
  janela padrão. O check-in continua vinculado a uma `Aula` oficial para preservar presença, horas,
  capacidade e duplicidade; `Checkin.realizadoEm` guarda o horário real e
  `associadoAutomaticamente` preserva que a aula foi escolhida pelo sistema.
- **Ofensivas de treino**: `OfensivaTreino` materializa a ofensiva atual e máxima de cada par
  aluno/modalidade. O resumo é
  recalculável: a fonte canônica continua sendo `Checkin.status = VALIDO`, a data civil de `Aula.inicio`
  e a modalidade preservada no crédito de `MovimentoHoras`.
- **Solicitação pública de matrícula**: `SolicitacaoMatricula` guarda os dados fornecidos pelo candidato,
  a modalidade pretendida, `tipoPagamento` (mensalista, Wellhub ou TotalPass) e a declaração obrigatória
  de benefício ativo nos fluxos externos. Para mensalistas, também guarda o plano padrão aplicado e a
  referência privada do comprovante PIX opcional. `CobrancaMatriculaAsaas` preserva competência, valor,
  cliente, cobrança e QR antes de existir um aluno mensalista. Nenhum `Usuario`/`Aluno` é criado enquanto
  a solicitação estiver `PENDENTE`. Mensalistas só ficam visíveis para aprovação após `PAYMENT_RECEIVED`;
  Wellhub/TotalPass entram na fila sem cobrança. A aprovação externa liga a modalidade por
  `AlunoPlanoModalidade.plataformaExterna`, sem criar plano, mensalidade ou registros Asaas.
- **Notificação de matrícula**: cada solicitação criada e cada aprovação concluída cria uma `Notificacao`
  do tipo `MATRICULA` para cada gestor ativo; o serviço de notificações tenta entregar o mesmo conteúdo
  por Web Push às inscrições ativas de cada destinatário.

## Entidades

Usuário · Aluno · Responsavel · Professor · Modalidade · Turma · Aula · Comparecimento (agendamento de aula) · Checkin ·
TentativaCheckinInadimplente · TokenCheckinAcademia · MovimentoHoras · OfensivaTreino · Graduacao · GraduacaoAluno ·
Exame · InscricaoExame · Plano · AlunoPlanoModalidade · Mensalidade · Pagamento · ClienteAsaas ·
ContratoPixAutomatico · CobrancaAsaas · CobrancaMatriculaAsaas · EventoWebhookAsaas · SolicitacaoMatricula · Importacao ·
RegistroImportado · LogAuditoria · ConfiguracaoAcademia · Notificacao · InscricaoPush.

## Diagrama (ER simplificado)

```mermaid
erDiagram
  Usuario ||--o| Aluno : "é"
  Usuario ||--o| Professor : "é"
  Usuario ||--o{ LogAuditoria : "autor"
  Usuario ||--o{ Notificacao : "recebe"
  Usuario ||--o{ InscricaoPush : "autoriza"

  Aluno }o--o| Plano : "assinado"
  Aluno ||--o{ AlunoPlanoModalidade : "contrata"
  Modalidade ||--o{ AlunoPlanoModalidade : "inclui"
  Aluno }o--o{ Modalidade : "pratica"
  Aluno ||--o| Responsavel : "tem"
  Aluno ||--o{ Comparecimento : ""
  Aluno ||--o{ Checkin : ""
  Aluno ||--o{ TentativaCheckinInadimplente : ""
  Aluno ||--o{ MovimentoHoras : ""
  Aluno ||--o{ OfensivaTreino : "mantém por modalidade"
  Aluno ||--o{ GraduacaoAluno : ""
  Aluno ||--o{ Mensalidade : ""
  Aluno ||--o{ Pagamento : ""
  Aluno ||--o| ClienteAsaas : "pagador"
  Aluno ||--o{ ContratoPixAutomatico : "autoriza"
  ContratoPixAutomatico ||--o{ Mensalidade : "seis ciclos"
  ContratoPixAutomatico ||--o{ CobrancaAsaas : "materializa"
  Mensalidade ||--o{ CobrancaAsaas : "tentativas"
  SolicitacaoMatricula ||--o{ CobrancaMatriculaAsaas : "cobra antes da aprovação"
  Plano ||--o{ SolicitacaoMatricula : "aplicado"

  Professor }o--o{ Modalidade : "habilitado"
  Professor ||--o{ Turma : "ministra"
  Professor ||--o{ GraduacaoAluno : "concede"

  Modalidade ||--o{ Turma : ""
  Modalidade ||--o{ Graduacao : ""
  Modalidade ||--o{ MovimentoHoras : ""
  Modalidade ||--o{ OfensivaTreino : "classifica"
  Turma ||--o{ Aula : "gera"

  Aula ||--o{ Comparecimento : ""
  Aula ||--o{ Checkin : ""
  Aula ||--o{ TentativaCheckinInadimplente : ""
  Checkin ||--o{ MovimentoHoras : "credita/estorna"

  Graduacao ||--o{ GraduacaoAluno : ""
  Graduacao ||--o{ GraduacaoAluno : "anterior"
  Plano ||--o{ Mensalidade : ""

  Importacao ||--o{ RegistroImportado : ""
  RegistroImportado }o--o| Aluno : "resolvido"
  RegistroImportado }o--o| Checkin : "vinculado"
```

## Notas

- **Turma** modela tanto a grade recorrente (`diasSemana`/`horaInicio`/`horaFim`) quanto eventos únicos
- **Aluno.diaVencimento** define o dia usado ao gerar mensalidades internas; `Mensalidade.vencimento`
  preserva a data histórica da cobrança gerada.
- **Plano.padrao** identifica o único plano mensal ativo aplicado a novas matrículas. Índice parcial e
  `CHECK` no PostgreSQL impedem dois padrões ou um padrão inativo/não mensal.
- **ClienteAsaas** reserva localmente o aluno antes da criação remota; enquanto a operação está em curso,
  o identificador remoto pode ser nulo e falhas sanitizadas ficam em `ultimoErro`. Depois, mantém somente o
  identificador remoto e se o pagador é o aluno ou seu responsável financeiro. **ContratoPixAutomatico**
  preserva o histórico de cada semestre e liga exatamente seis
  `Mensalidade`; um índice parcial do PostgreSQL impede dois ciclos abertos simultâneos para o mesmo aluno.
  `ContratoPixAutomatico.asaasConciliationId` é único e liga com segurança o QR imediato ao pagamento
  inicial retornado pelo Asaas, mesmo quando a data do pagamento difere do vencimento da competência.
  **CobrancaAsaas** é uma geração de intenção local antes da chamada remota. O histórico é 1:N por
  mensalidade, com índice parcial permitindo somente uma geração ativa; IDs remotos antigos não são
  sobrescritos e continuam aptos a receber webhooks tardios. `Mensalidade.cobrancaQuitacaoAsaasId` registra
  exatamente qual tentativa Asaas quitou a competência e só essa tentativa pode reabri-la em um estorno.
  `CobrancaAsaas.recebidaEmAsaas` preserva a data canônica de cada recebimento e permite transferir a
  quitação corretamente quando um pagamento duplicado sobrevivente substitui uma tentativa estornada.
  `PIX_AUTOMATICO_FALLBACK` identifica a contingência convencional de um ciclo cuja janela automática foi
  perdida.
- **CobrancaMatriculaAsaas** usa referência determinística e token público opaco, recebe o webhook no mesmo
  pipeline idempotente e só aceita `PAYMENT_RECEIVED` como liquidação final. Na aprovação, seus identificadores
  são materializados em `ClienteAsaas`/`CobrancaAsaas`; webhooks posteriores, inclusive estornos, seguem o
  fluxo financeiro canônico.
- O QR inicial do PIX Automático representa o ciclo 1. Os ciclos 2 a 6 são criados pelo job diário somente
  com autorização ativa. `EventoWebhookAsaas.asaasEventId` impede processamento duplicado; o payload bruto,
  documentos e segredos do Asaas não são guardados na auditoria.
- **AlunoPlanoModalidade** define quais modalidades do aluno estão cobertas pelo plano mensal interno.
  O plano não restringe modalidades; a seleção acontece no vínculo aluno-plano.
  (`ehEvento = true`, sem dia da semana). **Aula** é a ocorrência datada concreta.
- **Agendamento de aula** é persistido no modelo técnico `Comparecimento`. Pode ficar em `LISTA_ESPERA`
  quando a capacidade da aula foi atingida e a configuração de lista de espera está ativa. Ao cancelar um
  agendamento `CONFIRMADO`, o primeiro registro em lista de espera da aula é promovido para `CONFIRMADO`, com
  auditoria e notificação.
- **ConfiguracaoAcademia** é um singleton (`id = "default"`) com as regras configuráveis: janela de
  agendamento, exigência de agendamento para check-in, política de check-in sem agendamento,
  bloqueio por inadimplência, lista de espera, ranking de horas, notificações e valor base financeiro
  por modalidade.
- **RegistroImportado.valorRepasse** guarda o valor financeiro importado de Wellhub/TotalPass quando a
  planilha traz repasse por check-in; o JSON bruto continua preservado em `dadosBrutos`.
- **Modalidade** pode definir overrides operacionais para janela de agendamento, prazo de
  cancelamento, exigência/política de check-in sem agendamento e lista de espera. Também pode ativar
  check-in sem restrição de horário; esta opção é própria da modalidade e não altera a exigência de
  agendamento. Campos nulos herdam a regra global de `ConfiguracaoAcademia`.
- **OfensivaTreino** tem chave composta `alunoId + modalidadeId` e guarda os dias atuais, o recorde,
  o início atual e o último treino. A rotina diária fecha ausências somente depois da virada do dia em
  `America/Sao_Paulo`; check-in e invalidação recalculam imediatamente a modalidade sob lock. Dias sem
  check-in válido de ninguém não entram no calendário de ofensivas.
- **GraduacaoAluno** guarda a graduação concedida e, quando houver, `graduacaoAnteriorId`; isso preserva o
  histórico `anterior -> nova` exigido por RF-042 sem depender do log de auditoria para reconstruir a troca.
- **LogAuditoria** guarda `valorAntigo`/`valorNovo` como JSON, gravado na mesma transação da ação crítica.
  O autor pode ficar vazio quando o usuário é excluído; o log permanece preservado para auditoria.
- **InscricaoPush** guarda as inscrições Web Push autorizadas por usuário/dispositivo; `Notificacao` continua
  sendo a caixa interna de referência, e o push é um canal adicional quando configurado.
